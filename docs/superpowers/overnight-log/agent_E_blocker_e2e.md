# Agent E — 卡点 blocker E2E 测试

**测试时间**：2026-05-16
**脚本**：`G:\项目管理软件_v2\scripts\e2e_blocker_flow.py`（402 行）
**结果 JSON**：`G:\项目管理软件_v2\docs\superpowers\qa-screenshots\e2e_blocker_results.json`
**前置**：PB :8090 + Vite :5173 已运行；账号沿用 e2e_business_flow.py

## 测试结果

| Scenario | 状态 | 关键验证 |
|---|---|---|
| B1_create_task | PASS | 经理→员工建任务，pending→in_progress 流转通畅 |
| B2_mark_blocked | PASS | 员工 PATCH blocker（含 need_help_from 2 人）+ audit_log + 通知 |
| B3_verify_persistence | PASS | blocker JSON 字段持久化正确，2 名 help_user 各收到 1 条 blocker_reported；**Bug #8 probe 确认 PB 端能保留 rollback_to** |
| B4_unblock | PASS | status=blocked → in_progress，blocker 清空为 None，audit_log unblock_task 创建 |
| B5_verify_unblock | **WARN** | 状态/audit/通知都对，但经理拒绝 mark_blocked audit_log 后**任务状态/blocker 完全不变** |

总计：**4 PASS + 1 WARN + 0 FAIL / 5**。

### stdout 实际输出（节选 — 证明真跑过）

```
=== E2E Blocker test starting, prefix=E2E-Blocker-1778904955- ===
--- B2_mark_blocked ---
  PASS: ok
    · audit_log mark_blocked created
    · notifications sent to help_users: [('chen_doc', 'zc8tl9tzua89izf'), ('mgr_li', 'j1xta4ecffzz328')]
    · task after: status=blocked blocker={'expected_resolve': '2026-05-25 12:00:00.000Z',
       'need_help_from': ['o4avodgw2fs9x63', 'yclq2nmebp7qj8u'],
       'reason_detail': '等待客户提供详细规格说明,无法继续推进',
       'reason_type': 'awaiting_input'}

--- B3_verify_persistence ---
  PASS: ok
    · blocker field persisted correctly
    · notif distribution: [{'user': 'chen_doc', 'count': 1}, {'user': 'mgr_li', 'count': 1}]
    · [Bug#8 probe] after writing rollback_to='rollbacktest123', PB persisted = 'rollbacktest123'
    · [Bug #8 partial] PB persisted rollback_to OK; 但 Task.blocker 类型仍未声明该字段，useUnblockTask 不读它

--- B4_unblock ---
  PASS: ok
    · before unblock: status=blocked blocker_present=True
    · audit_log unblock_task created
    · after unblock: status=in_progress blocker=None

--- B5_verify_unblock ---
  WARN: ok
    · user o4avodgw2fs9x63 notif (total=2): [('task_update', '卡点解除'), ('blocker_reported', '有任务遇到卡点需要您协助')]
    · manager rejected mark_blocked audit_log iquy7i9u5ri1zvl
    · task status after audit reject: in_progress blocker=None
    ! [BUG] useUpdateAuditLogStatus (api.ts:1573-1672) 拒绝 mark_blocked 时 NO action_type 特殊处理 …

=== 4 PASS, 1 WARN, 0 FAIL / total=5 ===
```

> 备注 console 中文乱码是 Windows code page (CP936) 问题，原始 JSON dump 与 .md 文件用 UTF-8 编码，字符均正确。

## 发现的 bug

### Bug E-1 [HIGH] — `useUpdateAuditLogStatus` 拒绝 `mark_blocked` 时无任何回退/同步处理
- **文件**：`frontend/src/lib/api.ts:1573-1672`
- **现状**：
  ```ts
  // 拒绝 mark_complete 时，回滚任务状态
  if (review_status === 'rejected' && auditLog.action_type === 'mark_complete' && auditLog.task) { ... }
  // 拒绝 update_task 时，回滚到 before_data
  if (review_status === 'rejected' && auditLog.action_type === 'update_task' && auditLog.task && auditLog.before_data) { ... }
  // ❌ 没有处理 mark_blocked
  ```
- **业务后果**：经理在审计中心点"拒绝"理由不充分的卡点 → `audit_logs.review_status='rejected'` 落库，但：
  1. `tasks.status` 保持 blocked（如果员工还没自己 unblock）— 员工被拒后仍然卡着，没有强制恢复路径；
  2. `tasks.blocker` 保留不变 — 拒绝理由不充分的 blocker 信息仍可见，业务语义混乱；
  3. operator (员工) 仅靠 1647-1659 行的 audit_rejected 通知得知被拒，但下一步该怎么办没有任何 UI 引导。
- **测试证据**（B5）：手工模拟拒绝 → `task status after audit reject: in_progress blocker=None`（注意：测试中员工**已经**先 unblock 了，所以 in_progress；如果员工还没 unblock，应该会停在 blocked 永远不动）。
- **复现**：
  1. 员工 A 标记任务卡点（B2 流程）→ task.status='blocked', audit_logs 添 mark_blocked
  2. 经理在 `/audit-center` 拒绝该 audit_log（前端 mutation）
  3. 观察：task 永远停在 blocked，员工无法用 UI 解除（"原因不充分"的卡点理由仍展示）
- **修复建议**：在 `useUpdateAuditLogStatus` mutation 增加 mark_blocked 分支：
  ```ts
  if (review_status === 'rejected' && auditLog.action_type === 'mark_blocked' && auditLog.task) {
      const task = await pb.collection('tasks').getOne<Task>(auditLog.task)
      if (task.status === 'blocked') {
          await pb.collection('tasks').update(auditLog.task, {
              status: 'in_progress',
              blocker: null,
          })
      }
  }
  ```
  并在 audit_rejected 通知 content 里说明"任务已自动恢复进行中"。
- **严重度**：HIGH（影响业务核心审核流程闭环，可能导致任务卡死无法恢复）

### Bug E-2 [MEDIUM] — `useUnblockTask` 不读 `blocker.rollback_to`，仅删 blocker
- **文件**：`frontend/src/lib/api.ts:1295-1332`
- **状态**：**Agent B Bug #8 的延续确认** — PB JSON 字段 schema 不是 strict struct，B3 探测 `[Bug#8 probe] after writing rollback_to='rollbacktest123', PB persisted = 'rollbacktest123'` 证实写入会落库。
- **现状**：
  - `Task.blocker` 类型 `api.ts:48-53` 未声明 `rollback_to`
  - `useMarkTaskBlocked` (api.ts:921) 显式向 blocker 写 `rollback_to`，并把 `rollback_to` 指向的旧任务 status 重置成 in_progress
  - `useUnblockTask` (api.ts:1295-1332) 解除卡点时 **`blocker: null`** 直接清空，从未读 `blocker.rollback_to`
- **业务后果**：场景"T2 卡点→回退到 T1"
  - T1 被强制设为 in_progress（mark_blocked 时联动）
  - T2 unblock 后 status=in_progress, blocker=null
  - 但 T1 仍然 in_progress 且无人通知"T2 的卡点已解除，T1 是否要回到 completed?"
  - 结果：T1+T2 同时 in_progress，产线流转混乱
- **修复建议**：
  1. `Task.blocker` 类型补 `rollback_to?: string`
  2. `useUnblockTask` 读 `task.blocker?.rollback_to`，若存在：
     - 把 rollback_to 指向的任务 status 设回 `completed`（并恢复 completed_at）
     - 给该任务 assignees 发"上游卡点已解除，您的任务恢复完成"通知
- **严重度**：MEDIUM（确定有副作用，但需 manager 主动用"回退"功能才触发）

### Bug E-3 [LOW] — `Task.blocker` 类型定义缺 `rollback_to` 字段
- **文件**：`frontend/src/lib/api.ts:48-53`
- **现状**：实现 `useMarkTaskBlocked` (api.ts:921) 写 `blockerData.rollback_to = rollbackToTaskId` 越权使用未声明字段，TS 编译实际靠 spread + 字面量赋值绕过类型检查。
- **业务后果**：任何使用 `task.blocker.rollback_to` 读取的代码（理论上要展示"回退自任务 X"的 UI）会被类型系统打回，开发者只能强转 `as any` 或加 ignore。
- **修复**：见 Bug E-2 同步修。
- **严重度**：LOW（类型卫生问题）

## 与 useMarkTaskBlocked / useUnblockTask 实现的对比

| 业务预期 | useMarkTaskBlocked 行为 | useUnblockTask 行为 | 偏差 |
|---|---|---|---|
| 标卡点后任务 status→blocked | ✅ tasks.update status='blocked' | — | OK |
| blocker 字段含 4 个 key | ✅ 全部 PATCH | — | OK |
| audit_log 留痕 | ✅ action_type='mark_blocked' | ✅ 'unblock_task' | OK |
| 通知 need_help_from | ✅ blocker_reported 给每人 | — | OK |
| 通知项目全员（除操作者） | ✅ notifyProjectMembers | ✅ notifyProjectMembers | OK |
| 解除后 blocker 清空 | — | ✅ blocker: null | OK |
| 解除后 status→in_progress | — | ✅ 接受 newStatus 参数 | OK |
| 解除时联动 rollback_to 任务 | — | ❌ 不读 rollback_to | **Bug E-2** |
| 经理拒绝卡点理由后自动恢复 | — | — | **Bug E-1** （在 useUpdateAuditLogStatus 而非 unblock）|
| Task.blocker 类型完整 | 写入 rollback_to | 不读 | **Bug E-3** |

## 测试设计说明

- **PB 权限注意**：notifications.listRule 限制 `user=@request.auth.id`，admin token 也查不到他人通知。B5 验证 help_users 收到通知时必须用各 user 自己 token —— 这是本次测试发现的隐式约束（最初 admin filter 一直返回 0 让我误以为通知没发）。
- **rollback_to probe**（B3 后段）：直接 PATCH 一个带 rollback_to 的 blocker → admin 读取 → 确认 PB JSON 字段保留它。结论：PB 端 schema 允许保存任意字段（非 strict struct），bug 完全在前端类型 + 取消逻辑里。
- **audit reject schema 修正**：实际字段是 `reject_note`（不是 `reject_reason`）+ `review_status`（'pending'|'approved'|'rejected'|'read'）。前端 mutation 的 PATCH payload 也是这两个字段。
- **未触发 PB rule 阻拦**：本次所有 PATCH/POST 都顺利落地，没遇到 P0-3 commit 80e33d1 那种 updateRule 限制。如果将来 handoffs.updateRule 收紧到要求只能 manager+ 改 status，B5 的 audit_logs PATCH 也可能需要 manager 角色（当前测试用的就是 manager，所以未暴露）。

## 优先级建议

1. **Bug E-1 优先修**（HIGH）— 这是经理审核闭环的关键缺口，可能导致 production 任务卡死。
2. **Bug E-2 次之**（MEDIUM）— 取决于是否真的有"标记卡点+回退"的用户路径在用；可加单元测试守住。
3. **Bug E-3 顺手**（LOW）— 与 E-2 同步修，几行类型补全。
