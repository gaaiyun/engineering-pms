# Agent K — E2E 权限边界测试报告 (Round 4)

**日期**：2026-05-16  
**执行脚本**：`scripts/e2e_permission_flow.py`  
**结果 JSON**：`docs/superpowers/overnight-log/agent_K_permission_e2e_results.json`  
**测试运行**：8 case → **5 PASS / 3 FAIL / 0 INCONCLUSIVE**  
**Cleanup**：handoffs 1/1, audit_logs 3/3, notifications 1/1, tasks 10/10, projects 2/2（全部干净）

---

## 1. 结果总表

| Case | 场景 | 期望 | 实际 | Verdict | 关键证据 |
|------|------|------|------|---------|----------|
| **P1** | 员工 A PATCH 不属于自己的任务 | 403/404 | HTTP 404, stage_name 未变 | **PASS** | tasks.updateRule 包含 `assignees.id ?= auth.id` 生效 |
| **P2** | 员工 A DELETE 自己的任务 | 403/404 | HTTP 404, 任务仍在 | **PASS** | tasks.deleteRule = `admin || manager` 生效 |
| **P3** | 员工 A 伪造 audit_log.operator = B | 拦截 | HTTP 400（伪造）/ 200（自己）| **PASS** | migration 1772800000 (`operator = @request.auth.id`) 生效 |
| **P4** | 员工 A 给 B 发 notification | 允许 | HTTP 200 | **PASS** | createRule = `auth.id != ""`，前端业务 OK；**有滥用空间**（见下） |
| **P5** | useUnblockTask 跨 assignees rollback_to 联动 | A→X 应 200 或前端有提示 | A PATCH X 返回 **HTTP 404**，X 永远停在 `in_progress` | **FAIL** | **H-1 确认** |
| **P6** | 员工 A 创建 from_task 不属于自己的 handoff | 拦截 | HTTP 200 — handoff 创建成功 | **FAIL** | handoffs.createRule 太宽 |
| **P7** | 员工 A 列其他项目 tasks | 0 条 | A 看 0 条 / admin 看 2 条 | **PASS** | tasks.listRule 项目隔离生效 |
| **P8** | 员工 A 列 audit_logs 是否跨项目泄露 | 0 条 proj_B | A 看到 proj_A + **proj_B 的 audit_log** | **FAIL** | audit_logs.listRule 无项目过滤 |

---

## 2. H-1 (P5) 复现 — 最小步骤

```
前置：emp_A / emp_B / admin 三个账号，项目 P 含 manager + emp_A 但不含 emp_B
       （脚本里 admin 临时创建 emp_B 的任务用 created_by=B）

1. admin 建 task X：assignees=[emp_B], status=completed
2. admin 建 task T：assignees=[emp_A], status=blocked,
   blocker = { ..., rollback_to: X.id, need_help_from: [emp_B.id] }
3. admin PATCH X: status=in_progress  ← 模拟"X 因为 T 卡点而被回退"

4. emp_A 调用 useUnblockTask（api.ts:1349-1418）：
   a) PATCH /tasks/T  { status: 'in_progress', blocker: null }   → HTTP 200 OK
   b) PATCH /tasks/X  { status: 'completed', completed_at: ... }  ← 关键
      ↓
      PB tasks.updateRule = 'admin || manager || assignees.id ?= auth.id'
      emp_A 既不是 admin/manager，也不在 X.assignees=[emp_B]
      ↓
      HTTP 404 (PB 标准行为：updateRule 不匹配时返回 404 而非 403，模糊化资源存在性)

5. 前端 api.ts:1395-1397 用 try/catch 包裹这段，把 error 吞到 console.warn 里：
       } catch (e) {
           console.warn('rollback_to recovery failed', e)
       }
   ↓
6. UI 显示 unblock 成功，但 X 永远停留在 in_progress 状态。
   后续 emp_B 看自己的任务列表会看到一个莫名"in_progress"的已完成任务。
```

**实测 raw**：
- `unblock_T_status: 200`
- `rollback_X_status: 404`
- `X_final_status: "in_progress"`（应为 `"completed"`）

---

## 3. 发现的实际权限漏洞

### 漏洞 V1（高）— P5 / H-1：rollback_to 联动静默失败
- **影响**：上游任务 X 状态显示错误，后续业务（如经理审计、报表）以此为依据会出错。
- **根因**：useUnblockTask 跨 assignees PATCH，PB rule 不允许，前端 catch 吞错。
- **优先级**：P0（数据一致性 + 已知 H-1）

### 漏洞 V2（中高）— P6：handoffs 越权创建
- **影响**：任何登录用户能给任意他人的任务创建 handoff，后续 useApproveHandoff（经理）只看 from_task 不校验 submitter 是否在 from_task.assignees。这意味着员工 A 可以伪造一个看似是 emp_B 提交的 handoff（虽然 submitter 字段写的是 A，但内容指向 B 的任务），形成 spam / 误导 manager 的攻击面。
- **PB raw**：`handoffs.createRule = '@request.auth.id != ""'`（migration 1770000001 默认，未被后续收紧）
- **优先级**：P1

### 漏洞 V3（中）— P8：audit_logs 跨项目泄露
- **影响**：员工能列出所有项目的 audit_log（含 reject_note、reason_detail 等敏感字段）。结合 Agent C P1-4 警告，这是已知遗漏。
- **PB raw**：`audit_logs.listRule = '@request.auth.id != ""'`（最初 migration 1770000003 + 1772200000 只改了 updateRule，listRule 未动）
- **优先级**：P1

### 漏洞 V4（低）— P4：notifications.createRule 太宽（观察项）
- **影响**：任何登录用户能给任意人发任意类型的通知 → 钓鱼/骚扰风险。
- **业务取舍**：前端 notifyProjectMembers 需要这能力。若改严必须重写为 PB hook 代理发送。
- **优先级**：P3（在 SaaS 化前可以暂缓）

---

## 4. 修复建议

### V1 — H-1：3 种方案（选一即可）

**方案 A（推荐）— PB hook 代理回写**  
新建 `backend/pb_hooks/unblock_rollback.pb.js`：
```js
// 监听 tasks.update：当 status 从 blocked → in_progress 且 blocker.rollback_to 存在
// 时由 PB 用 admin 权限把 rollback_to 那个 task 设回 completed
onModelAfterUpdate((e) => {
  if (e.model.collection().name !== 'tasks') return
  const original = e.dao().findRecordById('tasks', e.model.id, [])
  // ... 用 $app.dao().runInTransaction 回写 X
}, 'tasks')
```
优点：前端不用改，权限收口；缺点：要写 hook + 测。

**方案 B（最快）— 前端检测 403/404 弹提示**  
`frontend/src/lib/api.ts:1371-1398`：
```ts
if (rollbackToTaskId) {
    try { ... }
    catch (e: any) {
        if (e?.status === 404 || e?.status === 403) {
            toast.warning(`已解除卡点，但「${rollbackTask?.stage_name}」需要 ${X负责人名} 手动设回完成`)
        } else {
            console.warn('rollback_to recovery failed', e)
        }
    }
}
```
优点：5 分钟改完；缺点：仍然依赖人工。

**方案 C（最松）— 放宽 tasks.updateRule**  
让 blocker.rollback_to 指向的任务的所有 assignees 都能被 rollback：
`updateRule = 'admin || manager || assignees.id ?= auth.id || project.members ~ auth.id'`  
风险：等于允许任何项目成员改任意任务状态，**不推荐**。

### V2 — P6 handoffs.createRule 收紧
新建 migration：
```js
// pb_migrations/1772900000_tighten_handoffs_create.js
collection.createRule =
  '@request.auth.id != "" && ' +
  '(@request.auth.role = "admin" || @request.auth.role = "manager" || ' +
  ' from_task.assignees.id ?= @request.auth.id) && ' +
  'submitter = @request.auth.id'
```
顺带强制 submitter 与 auth.id 一致（防伪造）。

### V3 — P8 audit_logs.listRule 收紧
新建 migration：
```js
// pb_migrations/1772950000_audit_logs_list_rule_scope.js
collection.listRule =
  '@request.auth.role = "admin" || ' +
  '@request.auth.role = "manager" || ' +
  'operator = @request.auth.id || ' +
  'project.members ~ @request.auth.id'
collection.viewRule = collection.listRule
```
注：viewRule 同步收紧，否则知 id 就能 GET。

### V4 — P4 长期治理
（不在 v2.4 范围）建 PB hook 代理 `/api/notifications/send`，前端调 hook 不直接 POST collections，再把 createRule 改为 `@request.auth.id = @request.auth.id && false`（关闭直接写）。

---

## 5. 备注 / 局限

- **PB 返回 404 而非 403** 是 PocketBase 默认行为（避免暴露资源存在性），脚本两者都接受。
- **P3 自我对照**：脚本验证伪造拒绝同时验证正常写入仍可用，确保 migration 1772800000 没有"误伤"自己 operator 的合法写入。
- **P5 setup 借力 admin** 临时把 X 从 completed 改回 in_progress，模拟"X 因为 T 卡点而被回退"的中间状态。这是 useMarkTaskBlocked 真实路径下会发生的（mark_blocked 时也会 PATCH X.status=in_progress，同样有跨 assignees 越权问题，但本轮聚焦 unblock 侧）。
- **未覆盖**：comments、ai_summaries、device_tokens 的权限；下轮（Round 5）可补 P9-P12。

---

## 6. 推荐落地优先级

| Fix | 优先级 | 改动量 | 风险 |
|-----|--------|--------|------|
| V2 (handoffs.createRule) | P0 | 1 migration，~15 行 | 低，与已有 1772800000 风格一致 |
| V3 (audit_logs.listRule) | P0 | 1 migration，~10 行 | 低 |
| V1-B (前端 toast) | P0 | api.ts 改 ~8 行 | 极低 |
| V1-A (PB hook) | P1 | 1 hook 文件 + 测试 | 中（要测事务） |
| V4 (notification 重构) | P3 | 大 | 高（涉及业务） |

建议本轮直接落 V1-B + V2 + V3，三条 migration/前端 patch 即可关闭 3 个 FAIL。
