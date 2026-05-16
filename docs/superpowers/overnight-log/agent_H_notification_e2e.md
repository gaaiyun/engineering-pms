# Agent H — 通知发送完整性 E2E 测试报告
- 运行时间: 2026-05-16 12:48:57
- 测试前缀: `E2E-NotifTest-1778906912-`
- 测试项目: `3oiyzrhy13gjaut`

## 概览

- 总用例数: 9
- PASS: 8
- FAIL: 1
- MISSING (漏通知): 0
- UNEXPECTED (误通知): 0

## device_tokens 状态

- 总记录数: 0
- 状态: **未启用 push** (collection 存在但无数据)

## 用例详情

### [PASS] C1_manager_create_assign_to_employee

**状态**: PASS

**应通知**:
- `员工A(zhao_site,被指派)` (uid=x2kc1qzo) — type∈['task_assigned'], link_id=noe8r7od
- `员工B(chen_doc,项目其他成员)` (uid=o4avodgw) — type∈['task_update'], link_id=noe8r7od

**不应通知**: ['oee8jbfm']

**观察结果（各 user 自己 token 查询）**:
- uid=x2kc1qzo: ['task_assigned@noe8r7od', 'task_update@noe8r7od']
- uid=o4avodgw: ['task_update@noe8r7od']
- uid=oee8jbfm: ∅

**Notes**:
- task_id=noe8r7od2c4hfet
- observed counts: emp=2 emp2=1 mgr=0

### [PASS] C2_manager_edit_task_name

**状态**: PASS

**应通知**:
- `员工A` (uid=x2kc1qzo) — type∈['task_update'], link_id=9zidmeu1
- `员工B(项目其他成员)` (uid=o4avodgw) — type∈['task_update'], link_id=9zidmeu1

**不应通知**: ['oee8jbfm']

**观察结果（各 user 自己 token 查询）**:
- uid=x2kc1qzo: ['task_update@9zidmeu1']
- uid=o4avodgw: ['task_update@9zidmeu1']
- uid=oee8jbfm: ∅

### [PASS] C3_employee_mark_complete

**状态**: PASS

**应通知**:
- `经理` (uid=oee8jbfm) — type∈['task_update'], link_id=80cxvmd9
- `员工B` (uid=o4avodgw) — type∈['task_update'], link_id=80cxvmd9

**不应通知**: ['x2kc1qzo']

**观察结果（各 user 自己 token 查询）**:
- uid=oee8jbfm: ['task_update@80cxvmd9']
- uid=o4avodgw: ['task_update@80cxvmd9']
- uid=x2kc1qzo: ∅

### [PASS] C4_employee_mark_blocked

**状态**: PASS

**应通知**:
- `员工B(need_help_from)` (uid=o4avodgw) — type∈['blocker_reported'], link_id=7vrbwqyh
- `经理(项目成员)` (uid=oee8jbfm) — type∈['blocker'], link_id=7vrbwqyh

**不应通知**: ['x2kc1qzo']

**观察结果（各 user 自己 token 查询）**:
- uid=oee8jbfm: ['blocker@7vrbwqyh']
- uid=o4avodgw: ['blocker_reported@7vrbwqyh', 'blocker@7vrbwqyh']
- uid=x2kc1qzo: ∅

**Notes**:
- emp2 收到的 type: ['blocker', 'blocker_reported']（预期含 blocker_reported 和 blocker 两种）

### [PASS] C5_employee_unblock_with_rollback

**状态**: PASS

**应通知**:
- `经理(项目成员-当前任务)` (uid=oee8jbfm) — type∈['task_update'], link_id=78r3v8jn
- `员工B(项目成员-当前任务)` (uid=o4avodgw) — type∈['task_update'], link_id=78r3v8jn
- `员工B(rollback target assignee)` (uid=o4avodgw) — type∈['task_update'], link_id=wcgsoy76

**不应通知**: ['x2kc1qzo']

**观察结果（各 user 自己 token 查询）**:
- uid=oee8jbfm: ['task_update@78r3v8jn']
- uid=o4avodgw: ['task_update@78r3v8jn', 'task_update@wcgsoy76']
- uid=x2kc1qzo: ∅

**Bug 证据**:
- PROD-BUG: useUnblockTask line 1359 — 员工 unblock 时若 rollback target 不在自己 assignees 中，PB updateRule 拒绝 PATCH。生产环境 try/catch 静默吞掉异常，导致 X 永远卡在 in_progress 状态，且不会通知 X 的 assignees。HTTP error: HTTP 404 on PATCH /api/collections/tasks/records/wcgsoy764v62hou: {"code":404,"message":"The requested resource wasn't f

**Notes**:
- prev_task=wcgsoy764v62hou cur_task=78r3v8jnwn67y9l

### [FAIL] C6_manager_approve_handoff

**状态**: FAIL

**应通知**:
- `员工B(新任务 assignee)` (uid=o4avodgw) — type∈['task_assigned'], link_id=qx4umnxa
- `员工A(提交者)` (uid=x2kc1qzo) — type∈['task_update'], link_id=qx4umnxa

**不应通知**: ['oee8jbfm']

**观察结果（各 user 自己 token 查询）**:
- uid=oee8jbfm: ∅
- uid=x2kc1qzo: ['task_update@qx4umnxa', 'task_update@qx4umnxa']
- uid=o4avodgw: ['task_assigned@qx4umnxa', 'task_update@qx4umnxa']

**发现**:
- DUPLICATE: 员工A(提交者) 收到 2 条相同 link 的 ['task_update'] 通知

**Bug 证据**:
- 重复通知：员工A(提交者) 收到 2 条相同 link 类型的通知 (types=['task_update', 'task_update'])

### [PASS] C7_manager_reject_handoff

**状态**: PASS

**应通知**:
- `员工A(提交者)` (uid=x2kc1qzo) — type∈['audit_rejected'], link_id=q9t26i3w

**不应通知**: ['oee8jbfm']

**观察结果（各 user 自己 token 查询）**:
- uid=x2kc1qzo: ['audit_rejected@q9t26i3w']
- uid=oee8jbfm: ∅
- uid=o4avodgw: ∅

### [PASS] C8_audit_reject_mark_blocked

**状态**: PASS

**应通知**:
- `员工A(操作员)` (uid=x2kc1qzo) — type∈['audit_rejected'], link_id=3ugfv3j2

**不应通知**: ['oee8jbfm']

**观察结果（各 user 自己 token 查询）**:
- uid=x2kc1qzo: ['audit_rejected@3ugfv3j2']
- uid=oee8jbfm: ∅

### [PASS] C9_manager_delete_task

**状态**: PASS

**应通知**:
- `员工A` (uid=x2kc1qzo) — type∈['task_update'], link_id=3oiyzrhy
- `员工B` (uid=o4avodgw) — type∈['task_update'], link_id=3oiyzrhy

**不应通知**: ['oee8jbfm']

**观察结果（各 user 自己 token 查询）**:
- uid=x2kc1qzo: ['task_update@3oiyzrhy']
- uid=o4avodgw: ['task_update@3oiyzrhy']
- uid=oee8jbfm: ∅

## 修复建议

### 已发现的具体问题与建议

#### C5_employee_unblock_with_rollback

- PROD-BUG: useUnblockTask line 1359 — 员工 unblock 时若 rollback target 不在自己 assignees 中，PB updateRule 拒绝 PATCH。生产环境 try/catch 静默吞掉异常，导致 X 永远卡在 in_progress 状态，且不会通知 X 的 assignees。HTTP error: HTTP 404 on PATCH /api/collections/tasks/records/wcgsoy764v62hou: {"code":404,"message":"The requested resource wasn't f

#### C6_manager_approve_handoff

- 重复通知：员工A(提交者) 收到 2 条相同 link 类型的通知 (types=['task_update', 'task_update'])

### 推荐补丁

**Bug #1 (C6) — useApproveHandoff 重复通知提交者**

位置: `frontend/src/lib/api.ts` `useApproveHandoff` (L593-675)

原因: `createTaskWithSideEffects` 已经通过 `notifyProjectMembers` 通知项目所有成员（含提交者，excludeUserId=reviewer），随后 L654 又给 `handoff.submitter` 单独发了一条 `type=task_update`、`link_id=newTask.id` 的通知 → 提交者收到 2 条几乎等价的通知。

建议修复（任选一）：
- A. 把给 submitter 的通知改成 `type=handoff_approved`（与项目通知 type 不同，便于 UI 区分），同时 `link_id` 保留 newTask.id —— 这样语义层面不重复。
- B. 在 `createTaskWithSideEffects` 的 `projectNotificationContent` 调用前传入 `excludeUserId=[reviewer, handoff.submitter]` 数组（需扩展现有 API 接受多个 exclude）—— 让 submitter 只收到那条专属的 approval 通知。
- C. 给 submitter 通知前先检查 `handoff.submitter` 是否在新任务 assignees 中：若在，跳过单独通知（assignee 通知已覆盖）。

**Bug #2 (C5) — useUnblockTask rollback_to 联动被 PB 权限拒绝**

位置: `frontend/src/lib/api.ts` `useUnblockTask` (L1353-1381)

原因: PB tasks.updateRule = `admin|manager|assignees.id?=auth.id`。员工 A 解除卡点时，若 rollback target X 的 assignees 不含 A，L1359 的 PATCH 会 403。被 L1378-1380 的 `catch (e) { console.warn(...) }` 静默吞掉 → X 永远停在 `in_progress`，X 的 assignees 也收不到「上游卡点已解除」通知。

建议修复：
- A. **后端补丁** — 在 PB hook (JS) 里监听 tasks blocker 清空事件，由超级权限自动回写 rollback_to 状态 + 创建通知。这是最干净的方案（业务规则不应被 RBAC 拦截）。
- B. **前端补丁** — 用 `pb.send('/api/collections/tasks/records/X', { method: PATCH, body, headers: { admin token }})` 显然不合适。可改为：rollback 联动延迟到下次「rollback target assignee 自己进入任务详情时」，由 task detail 页 useEffect 检测 `predecessor.blocker===null && self.status==='in_progress'` 时自动 PATCH（assignee 有权限）。
- C. **临时缓解** — 把 catch 改成 toast 提示，告知用户「下游任务需后续手动恢复」，至少不让 bug 静默。

### 待补充测试（受限于 REST 测试无法覆盖的场景）

- Push notification 实际投递（FCM/APNs）：device_tokens collection 为空，无法验证。建议待手机端连入后用 `scripts/probe_push.py` 验证。
- Realtime SSE 通知是否实时到达前端 UI：需 Playwright 监听 SSE 流验证，本测试只验证 PB 层数据。
- 通知中心 UI 渲染是否正确（unread count、点击跳转、is_read 翻转）：需 UI E2E（参考 e2e_business_flow.py 的 Playwright 模式）。

## 通知规则映射（代码索引）

| 业务事件 | 代码位置 (`frontend/src/lib/api.ts`) | 通知逻辑 |
|---|---|---|
| 创建+指派任务 | `createTaskWithSideEffects` (L264-307) | `notifyProjectMembers(type=task_update, excludeUserId=creator)` + `notifyTaskAssignees(type=task_assigned, excludeUserId=creator)` |
| 修改任务 | `useUpdateTask` (L437-483) | `notifyProjectMembers(type=task_update, excludeUserId=editor)` |
| 标记完成 | `useMarkTaskComplete` (L860-926) | `notifyProjectMembers(type=task_update, excludeUserId=operator)` + 创建 handoff |
| 标记卡点 | `useMarkTaskBlocked` (L929-1028) | `notifyProjectMembers(type=blocker, excludeUserId=op)` + per `need_help_from`: `type=blocker_reported` |
| 解除卡点 | `useUnblockTask` (L1332-1402) | `notifyProjectMembers(type=task_update, excludeUserId=op)` + rollback_to assignees `type=task_update` |
| 批准 handoff | `useApproveHandoff` (L593-675) | `createTaskWithSideEffects` 链路 + 通知提交者 `type=task_update` |
| 拒绝 handoff | `useRejectHandoff` (L677-733) | 通知提交者 `type=audit_rejected` (link_type=task, link_id=from_task) |
| 审计拒绝 mark_blocked | `useUpdateAuditLogStatus` (L1637-1759) | 回滚 task + 通知 operator `type=audit_rejected` |
| 删除任务 | `useDeleteTask` (L1231-1294) | `notifyProjectMembers(type=task_update, relatedTask=null)` → link_type=project, link_id=projectId |

