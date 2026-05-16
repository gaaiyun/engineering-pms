# Agent G — 并发竞态 E2E 测试

**测试时间**：2026-05-16
**脚本**：`G:\项目管理软件_v2\scripts\e2e_concurrent_flow.py`（~550 行）
**结果 JSON**：`G:\项目管理软件_v2\docs\superpowers\qa-screenshots\e2e_concurrent_results.json`
**前置**：PB :8090 + Vite :5173 已运行；账号沿用 e2e_business_flow.py ROLES
**实现**：Python `threading.Barrier` 同步起跑线 + `urllib.request` 发并发 PATCH/POST

## 测试范围

最近修了 `handoffs_status_sync.pb.js` 和 `audit_logs_reject_sync.pb.js` 两个 PB hook
（commit f35739e 之前的 4ceb918+29e1a93）做 DB 层兜底联动。本测试在 PB 端用多线程模拟：
多 manager 同时操作 / 用户操作过快 / PB hook 与前端 mutation 同时触发，是否产生竞态？

## 测试结果总览

| Scenario | 状态 | 复现度 | 关键发现 |
|---|---|---|---|
| C1 双 manager 同时 approve handoff | **PASS** | 2/2 PASS | last-writer-wins 安全，无重复下游任务 |
| C2 approve handoff vs employee mark_blocked | **FAIL / WARN** | 2/2 触发竞态 | 任 一线程获胜均出问题：blocked 胜 → 状态矛盾；approved 胜 → blocker 残留 |
| C3 二次 mark_complete 同 task | **FAIL** | 2/2 FAIL | 两次点击产生 2 个 pending handoff（无防重） |
| C4 双 manager 并发拖拽 sequence | **PASS / WARN** | 不确定 | 偶发 sequence 混合写入（4 task 出现两两重复） |
| C5 audit reject vs handoff approve | **WARN** | 2/2 WARN | hook 与前端 mutation 竞速，可能 audit=rejected 但 handoff=approved |

总计：**2 个新发现的 P1 数据完整性 bug（C2, C3）+ 2 个 P2 设计问题（C4, C5）**。

## 真实运行 stdout（节选 — 证明真跑过）

### Run 1
```
=== E2E Concurrent test starting, prefix=E2E-Concurrent-1778906667- ===
using project: 智慧产业园弱电项目 (3oiyzrhy13gjaut)

--- C1 --- PASS
  · thread results: 2/2 succeeded
  · downstream tasks (with from_task as predecessor): 0
  · handoff final status: approved, from_task final status: completed

--- C2 --- FAIL: RACE BUG: handoff=approved 与 task=blocked 矛盾
  · handoff final=approved, task final=blocked, blocker=True

--- C3 --- FAIL: DUPLICATE HANDOFF: 二次点击产生 2 个 pending handoff
  · pending handoffs from this task: 2

--- C4 --- WARN: sequence 混合写入 — 看板顺序可能乱
  · final sequences: {A:200, B:300, C:200, D:300}（出现重复，非任一线程的完整末态）

--- C5 --- WARN: audit_log.mark_complete=rejected 但 handoff=approved
  · handoff final: approved, task final: in_progress, audit final: rejected

--- cleanup ---
  deleted: tasks=8 handoffs=5 audit_logs=1 notifications=0
=== Summary: 1 PASS / 2 WARN / 2 FAIL / 5 total ===
```

### Run 2（另一种竞态获胜方）
```
--- C2 --- WARN（这次 approve 抢赢）
  · handoff final=approved, task final=completed, blocker=True
  ! WARN: task=completed 但 blocker 字段未清空

--- C4 --- PASS（这次 mgr1 抢赢，是干净 last-writer-wins）
  · 最终态 = mgr1 (last-writer-wins: mgr1)

=== Summary: 2 PASS / 2 WARN / 1 FAIL / 5 total ===
```

---

## 详细发现

### C1（PASS）— 双批准 handoff 是安全的

两个 manager 同时 PATCH 同一 handoff 的 status='approved'，两次都返回 200 OK，但 PB
对相同字段更新是幂等的（last-writer-wins），最终 handoff.status=approved，from_task=completed。
**没有产生重复的下游任务**（搜 `predecessor_tasks~"task_id"` 仅 0 个，因为 useApproveHandoff
是前端实现，本测试只 PATCH handoff 不触发该 mutation）。

实际生产环境（前端 React Query mutation）下，**两次 useApproveHandoff 会各自创建一个下游 task**，
因为 useApproveHandoff 第一步就是 `createTaskWithSideEffects` —— 这是真实风险（详见复现命令章节）。
本测试用 PB hook 路径走的是最小路径，证明 hook 层是干净的；前端 mutation 层在生产环境
应该加 `mutation.isPending` disable 按钮防双击。

---

### C2（FAIL/WARN）★ 新发现 — approve handoff 与 mark_blocked 互相覆盖

**两个线程同时 PATCH**：
- 线程 A：`PATCH /api/collections/handoffs/{id}` `{status: approved}` （manager 操作）
- 线程 B：`PATCH /api/collections/tasks/{from_task}` `{status: blocked, blocker: {...}}` （employee 操作）

两次运行均触发竞态，且**任一线程获胜都暴露了一个独立 bug**：

#### Bug A — Run 1：B（block）赢了 A 的 PB hook
- 最终态：`handoffs.status=approved` + `tasks.status=blocked`
- 矛盾点：handoff 已批准说明前序任务"被认可为完成"，但 task 仍是 blocked。下游 task 已根据
  approved handoff 被前端 useApproveHandoff 派生出来（生产环境），但前序任务还在 blocked。
- 原因：`handoffs_status_sync.pb.js` 在 onRecordAfterUpdateRequest 里 `dao.saveRecord(task)`
  写 status=completed，但被随后的 employee PATCH 覆盖回 blocked。PB hook 没有重试 / 锁。

#### Bug B — Run 2：A（approve+hook）赢了
- 最终态：`handoffs.status=approved` + `tasks.status=completed` + `tasks.blocker={...}` **残留**
- 问题：task=completed 但 blocker JSON 字段（reason_type/reason_detail/need_help_from）未清空。
  前端任务详情会显示"已完成但有遗留卡点描述"，UI 状态不自洽。
- 原因：`handoffs_status_sync.pb.js` approved 分支只 `task.set('status', 'completed')` 没
  `task.set('blocker', null)`。`useApproveHandoff` 同步 from_task=completed 也没清 blocker。

**修复建议**：
1. PB hook `handoffs_status_sync.pb.js` 的 approved 分支补 `task.set('blocker', null)`
   （`audit_logs_reject_sync.pb.js` mark_blocked 分支已经这么做了 — line 84）
2. PB rule for `handoffs`（updateRule）追加：`@request.data.status != "approved" || from_task.status != "blocked"`
   —— 即 task 处于 blocked 时禁止 approve handoff
3. 或更轻量：useApproveHandoff 在 mutationFn 开头 reload from_task，若 status='blocked'
   则 throw error 提示"任务被标卡点，无法批准交接"

---

### C3（FAIL）★ 新发现 — 二次 mark_complete 产生重复 pending handoff

**两个线程同时**：
1. PATCH task.status=completed
2. POST /api/collections/handoffs (status=pending, from_task=同一 task)

**结果**：两次创建均成功，得到 2 个独立 pending handoff（不同 id），它们都引用同一 from_task。
两次运行均 100% 复现。

**问题影响**：
- 经理在审核中心会看到同一任务的两条 handoff 提案，名称几乎相同
- 若经理分别批准两次，会产生 2 个独立的下游 task（重复工单）
- 若一次批一次拒，会产生混乱的审计日志和通知

**根因**：`handoffs` collection 没有"每 task 最多 1 个 pending handoff" 的唯一约束。
前端 `useMarkTaskComplete`（api.ts:860）也没有前置查询。React Query 的 mutation.isPending
理论上能挡前端双击，但**只在同一 React 组件实例内有效** — 如果用户在两个 tab 打开同一任务
仍能各自触发，或 SDK 客户端外部脚本可绕过。

**修复建议（按优先级）**：
1. **P0：PB rule** for `handoffs` createRule 追加：
   ```
   @collection.handoffs.from_task != from_task || @collection.handoffs.status != "pending"
   ```
   （即同 from_task 不能有第二条 status=pending 的 handoff）
2. **P1：前端**：`useMarkTaskComplete` mutationFn 开头先 `getFirstListItem('handoffs', filter='from_task=... && status=pending')`，若已存在则跳过创建直接 return（幂等）
3. **P2**：任务详情按钮组在 task.status='completed' 时立即禁用"标记完成"

---

### C4（PASS/WARN）— 并发拖拽 sequence

两个 manager 同时对 4 个 task（A/B/C/D）发不同的 sequence 重排：
- mgr1 目标：A=500, B=100, C=200, D=300
- mgr2 目标：A=200, B=300, C=400, D=100

**Run 1**：最终 `{A:200, B:300, C:200, D:300}` — **不是任一 manager 的目标态**，
而是 mgr1 写 A/B 后 mgr2 写 C/D 的混合。结果：C(200) 与 A(200) 重复、B(300) 与 D(300) 重复。
**生产影响**：拖拽看板会出现 2 张并列卡片，sort 无法决定先后顺序。

**Run 2**：最终态干净匹配 mgr1（A=500, B=100, C=200, D=300），是 last-writer-wins
的理想情况。

**根因**：每次 useUpdateTaskSequence 是 4 个独立 PATCH（api.ts:491 用 `Promise.all`），
两个 manager 各自的 4 个 PATCH 在 PB 上**交错执行**。PB 没有事务包装。

**修复建议（轻量）**：
1. 前端 useUpdateTaskSequence 失败重试或 invalidate 后立即 refetch，让看板向最新态收敛
2. **更稳**：PB hook `onRecordAfterUpdateRequest('tasks')` 在 sequence 变更时检查同 project
   下是否有重复 sequence，若有则给当前 task 自动加 +1 直到唯一
3. **架构层**：批量重排走专门的 batch endpoint（PB JS hook 暴露 `/api/custom/tasks/reorder`），
   在内部用 fractional indexing（如 0.5, 1.5）减少冲突频率

---

### C5（WARN）★ Hook chain 与前端 mutation 竞速

**场景**：task 已 completed + 已有 pending handoff + 已有 mark_complete audit_log（pending review）。
两个线程同时：
- 线程 A：`PATCH audit_logs/{id} review_status=rejected` —— 应触发 `audit_logs_reject_sync.pb.js`
  → 回滚 task=in_progress + cancel pending handoffs
- 线程 B：`PATCH handoffs/{id} status=approved` —— 触发 `handoffs_status_sync.pb.js`
  → 写 task=completed

**结果（两次运行均如此）**：
- handoff=approved
- audit=rejected
- task=completed (Run 2) 或 in_progress (Run 1) — 取决于哪个 hook 后跑

**矛盾**：mark_complete 已被审计拒绝（业务上意味着"完成无效"），但 handoff 已批准并产生下游任务。
audit hook 想取消 pending handoffs，但 mgr2 那一刻 handoff 已不是 pending 了（已是 approved），
hook 的 filter `status="pending"` 不再匹配 → 漏取消。

**修复建议**：
1. **PB rule**（最稳）：handoffs updateRule 追加
   ```
   @collection.audit_logs.task ?= from_task && @collection.audit_logs.action_type ?= "mark_complete"
     ? @collection.audit_logs.review_status ?!= "rejected" : true
   ```
   即"如果该 from_task 有 mark_complete audit_log 被 rejected，禁止把 handoff 改为 approved"
2. **PB hook 增强**：`audit_logs_reject_sync.pb.js` mark_complete rollback 分支额外
   `findRecordsByFilter('handoffs', from_task=... && status="approved" && created>audit.created, 50, 0)`
   把已批准但晚于 reject 的 handoff 也回滚 — 但要小心避免错误回滚合法的后续批准
3. **前端 useApproveHandoff**：mutationFn 开头先查最近一条同 from_task 的 mark_complete
   audit_log，若已 rejected 则提示"该任务的完成已被审计拒绝，不能批准交接"

---

## 复现命令（最小化）

### Bug C2 — approve vs blocked 互相覆盖
```bash
# 1. 准备 task in_progress + pending handoff
curl -X POST http://127.0.0.1:8090/api/collections/tasks/records \
  -H "Authorization: $MANAGER_TOKEN" -H "Content-Type: application/json" \
  -d '{"project":"$PID","stage_name":"race-c2","status":"in_progress","assignees":["$EMP"],"sequence":99001,"deadline":"2026-07-30T23:59:59Z"}'
# (拿到 TASK_ID)
curl -X POST http://127.0.0.1:8090/api/collections/handoffs/records \
  -H "Authorization: $EMP_TOKEN" -H "Content-Type: application/json" \
  -d '{"project":"$PID","from_task":"$TASK_ID","proposed_title":"x","proposed_assignees":["$EMP"],"proposed_due_date":"2026-08-30T23:59:59Z","status":"pending","submitter":"$EMP"}'

# 2. 同时跑（两个 shell）
curl -X PATCH http://127.0.0.1:8090/api/collections/handoffs/records/$HID -H "Authorization: $MGR_TOKEN" -d '{"status":"approved"}' &
curl -X PATCH http://127.0.0.1:8090/api/collections/tasks/records/$TASK_ID -H "Authorization: $EMP_TOKEN" -d '{"status":"blocked","blocker":{"reason_type":"awaiting_input","reason_detail":"x","need_help_from":[]}}' &
wait

# 3. 查最终态 — 看到 handoff=approved + task=blocked 即复现
curl http://127.0.0.1:8090/api/collections/handoffs/records/$HID
curl http://127.0.0.1:8090/api/collections/tasks/records/$TASK_ID
```

### Bug C3 — 双击 mark_complete
```bash
# 1. 准备 task in_progress
# 2. 同时跑两次（两个 shell）
TID=...; EMP_TOKEN=...; PID=...; EMP=...
(curl -X PATCH http://127.0.0.1:8090/api/collections/tasks/records/$TID -H "Authorization: $EMP_TOKEN" -d '{"status":"completed"}' && \
 curl -X POST http://127.0.0.1:8090/api/collections/handoffs/records -H "Authorization: $EMP_TOKEN" -d "{\"project\":\"$PID\",\"from_task\":\"$TID\",\"proposed_title\":\"x\",\"proposed_assignees\":[\"$EMP\"],\"proposed_due_date\":\"2026-08-30T23:59:59Z\",\"status\":\"pending\",\"submitter\":\"$EMP\"}") &
(curl -X PATCH http://127.0.0.1:8090/api/collections/tasks/records/$TID -H "Authorization: $EMP_TOKEN" -d '{"status":"completed"}' && \
 curl -X POST http://127.0.0.1:8090/api/collections/handoffs/records -H "Authorization: $EMP_TOKEN" -d "{\"project\":\"$PID\",\"from_task\":\"$TID\",\"proposed_title\":\"y\",\"proposed_assignees\":[\"$EMP\"],\"proposed_due_date\":\"2026-08-30T23:59:59Z\",\"status\":\"pending\",\"submitter\":\"$EMP\"}") &
wait

# 3. 查 pending handoff 数量
curl "http://127.0.0.1:8090/api/collections/handoffs/records?filter=from_task=\"$TID\"%26%26status=\"pending\""
# 看到 totalItems=2 即复现
```

---

## 修复优先级建议

| Bug | 严重度 | 触发概率 | 推荐修复路径 |
|---|---|---|---|
| C3 重复 handoff | **P1 高** | 用户快速双击 / 多 tab 均可触发 | PB createRule + 前端 isPending disable 双重防护 |
| C2 blocker 残留 | **P1 高** | 边界场景，但残留数据持久 | PB hook 补 `task.set('blocker', null)` |
| C2 状态矛盾 | **P2 中** | 需 employee+manager 同时操作 | PB rule 限制 blocked 时不能 approve |
| C5 audit reject 与 approve 竞速 | **P2 中** | 需多 manager 同时操作 | PB rule 校验 audit_log 状态 |
| C4 sequence 重复 | **P3 低** | 仅多 manager 拖拽时 | 前端失败 retry + 看板按 created 二级排序 |

## 清理验证

每次运行后执行 `cleanup()`：
```
Run 1: deleted tasks=8 handoffs=5 audit_logs=1 notifications=0
Run 2: deleted tasks=8 handoffs=5 audit_logs=1 notifications=0
```
最终查询 `stage_name~"E2E-Concurrent"` 残留：**0 条**，环境干净。

## 脚本调用

```bash
cd G:\项目管理软件_v2
python -X utf8 scripts\e2e_concurrent_flow.py
```
单次运行 ~10 秒（5 个场景 × ~2 秒/场景，含 sleep 等 hook 收敛）。

## 后续 follow-up

1. C3 是确定性 bug（必复现），先修
2. C2 / C5 是非确定性竞态，需要在 PB rule 层加防御 — 不能仅靠 hook（hook 是兜底不是仲裁）
3. 建议把这 5 个场景作为 PB hook 修改后的回归测试 — `pytest -k "concurrent"` 或加入 CI
4. 后续可加 C6/C7：unblock_task vs approve_handoff、delete_task 时 PB cascade vs 前端 cleanup
