# Agent C — 数据流不变量审计

审计范围：`frontend/src/lib/api.ts`、关键页面（`TaskDetail.tsx`、`AdminDashboard.tsx`、`TasksBulkBar.tsx`、`Notifications.tsx`、`DataImportCenter.tsx`）、`backend/pb_migrations/*.js`、`backend/pb_hooks/realtime.pb.js`。

核心架构假设：所有副作用（audit_log + notification + 关联清理）由前端 React mutation 触发；PB 端只做被动数据库 + 通用 collection rules，没有 onRecordAfter* hooks 兜底。`pb_hooks/` 仅有 `realtime.pb.js`（调 idleTimeout，与一致性无关）。

---

## 1. 关键数据流不变量

| # | 不变量 | 业务含义 |
|---|---|---|
| I1 | 每次 `task.status` 改变必有一条对应的 `audit_logs` 记录（`action_type ∈ {mark_complete, bulk_mark_complete, mark_blocked, unblock_task, update_task}`） | 复核中心 / 经理日报依赖审计流水回滚和评估 |
| I2 | 每次员工"标记完成"必同时创建 `handoffs(status=pending)` 记录（除非走批量或经理跳过流程） | 强制交接审核工作流；丢失会让"完成"无人复核 |
| I3 | `handoffs.status='approved'` 必创建新 `tasks` 且写入 `handoffs.approved_task` | 项目进度链条；丢失会让交接审批后没有后继任务 |
| I4 | `handoffs.status='rejected'` 必回滚 `from_task.status` 为 `in_progress` 且 `completed_at=null` | 已在 PR `useRejectHandoff` 中显式 fix（见 api.ts L646） |
| I5 | 删除 task 必删（或孤立标记）关联的 `handoffs.from_task`、`handoffs.approved_task`、`audit_logs.task` 引用 | 防止悬挂外键 / "幽灵任务"出现在交接审核列表 |
| I6 | 删除 project 必删该项目所有 tasks / handoffs / audit_logs / notifications | 防止用户看到"已删除项目"残留通知和审计 |
| I7 | 每条 `notifications` 的 `type` 必在 select 枚举内、`link_id` 与 `link_type` 配对（`task`/`project`） | 通知中心点击跳转一致性；type 不在枚举 → PB create 直接 422 |
| I8 | 业务事件触发的 notification 不发给操作者本人（`excludeUserId` 一致） | 防止刷屏 |
| I9 | `project.total_tasks` / `completed_tasks` / `progress` 与实际 tasks 一致 | 看板和首页进度条；当前未发现任何代码在 task 增删改时同步该字段 |
| I10 | `audit_logs.review_status='rejected'` 必触发 task 状态回滚 + 通知 operator | `useUpdateAuditLogStatus` 已实现，但仅 mark_complete/update_task 两类，其它 action_type 不回滚 |

---

## 2. 每条不变量的风险评估

### I1 — audit_log 必存在
**违反路径**：
- `frontend/src/pages/admin/AdminDashboard.tsx` L316 `handleProjectStatusChange` 直接 `pb.collection('projects').update(...)`，**无 audit_log**（P0）
- `AdminDashboard.tsx` L431 `handleDeleteTask` 直接 `pb.collection('tasks').delete(taskId)`，**无 audit_log**（P0）
- `useUpdateTaskSequence`（api.ts L483）只 update sequence，**无 audit_log**（P2，影响小）
- PB Admin UI 直接改库（任何字段）—— 没有任何 hooks 兜底（P1）
- 外部脚本调用 PB REST API：tasks.updateRule 是 `admin || manager || assignees ?= @auth.id` —— 任意 assignee 用 token 直接调 PATCH /api/collections/tasks/records/:id 即可绕过（P1）

### I2 — 完成必伴随 handoff
**违反路径**：
- `TaskDetail.tsx` L117 `handleComplete` 直接 `update(id, { status: 'completed' })`，**完全没创建 handoff**（**P0**）。注释里写"被分配人也可以标记完成"——这条路径绕过了 `useMarkTaskComplete` 整个强制交接流程。
- `TasksBulkBar.tsx` `batchMarkComplete` 显式跳过 handoff（业务有意为之，注释 L20-21 明示）—— 不算违反，但需在文档明示双轨制（P2）
- PB rule `assignees.id ?= @request.auth.id` 允许 assignee 直接 PATCH status —— 绕过前端即可（P1）

### I3 — 交接 approved 必创建新任务
当前仅由 `useApproveHandoff` 写入。PB rule 上 handoffs.updateRule 是 `@request.auth.id != ""`（创建时设置，未在后续 migration 收紧）—— 任何登录用户都能 PATCH handoffs.status='approved' 而不创建任务（**P0 安全 + 一致性**）。

### I4 — rejected 必回滚 from_task
已在 `useRejectHandoff` 实现。但同样：直接 PATCH handoffs.status='rejected' 不会触发回滚（P1）。

### I5 — 任务删除级联
**严重缺失**：
- `1770000001_created_handoffs.js`：`from_task` 和 `approved_task` 字段的 `cascadeDelete: false`
- `1770000003_created_audit_logs.js`：`task` 字段 `cascadeDelete: false`
- `useDeleteTask`（api.ts L1137）**只删 task 本身**，不清理 handoffs / audit_logs / 关联 notifications（link_id）
→ 删除任务后 ReviewCenter / 交接审核列表会看到 expand 失败的"幽灵记录"（P0）

### I6 — 项目删除级联
`useDeleteProject`（api.ts L1099）逐条删 tasks，但**不删** handoffs、audit_logs、notifications、comments、ai_summaries（P0）。`projects` collection 上无 cascadeDelete 配置（projects.id 被这些表通过 relation 引用，cascadeDelete: false）。

### I7 — notification type 枚举
PR `1772600000_expand_notifications_type_values.js` 已把 `audit_rejected` 加入枚举。但 `task_rollback`（api.ts L923 `useMarkTaskBlocked` 使用）—— 检查 `1772600000` 已包含 ✓。OK。

### I8 — 不通知自己
`excludeUserId` 在大部分 mutation 已传入。但 `useMarkTaskBlocked` 内部 `for (const userId of blocker.need_help_from)` 循环（api.ts L956）**没排除自己**——员工把自己写进 need_help_from 会自通知（P2）。

### I9 — project 进度字段一致性
**完全没有维护机制**：grep 全代码库，没有任何 mutation 在 task create/update/delete 时同步 `projects.total_tasks/completed_tasks/progress`。`useCreateProject` 和 `useQuickCreateProject` 仅在项目创建那一刻写一次初始值，之后永远不更新。前端各处看板大概率走前端聚合（按 tasks 查询即时算），但 `project.progress` 字段本身从未变 → 任何依赖该字段的查询/通知（如 deadline_warning 计算）会读到陈旧数据（**P1**，潜在已有不一致）。

### I10 — 审计 rejected 回滚覆盖
`useUpdateAuditLogStatus` 仅处理 `mark_complete` 与 `update_task`。`bulk_mark_complete`、`mark_blocked`、`unblock_task`、`approve_handoff`、`delete_task`、`delete_project` 全都不会回滚（P1，复核中心拒绝这些 action 时数据库不会改回）。

---

## 3. PocketBase rules 漏洞

读完所有相关 migration，**最新有效 rules 总结**：

| Collection | listRule | createRule | updateRule | deleteRule |
|---|---|---|---|---|
| tasks | `assignees?=@auth.id \|\| manager \|\| admin \|\| project.members~@auth.id` | `@auth.id!=""` | `admin \|\| manager \|\| assignees?=@auth.id` | `admin \|\| manager` |
| handoffs | `@auth.id!=""` | `@auth.id!=""` | `@auth.id!=""` ⚠️ | `admin \|\| manager` |
| audit_logs | `@auth.id!=""` | `@auth.id!=""` ⚠️ | `admin \|\| manager` | `admin \|\| manager` |
| notifications | `@auth.id=user` | `@auth.id!=""` ⚠️ | `@auth.id=user` | `@auth.id=user` |
| projects | `admin \|\| manager \|\| members~@auth.id` | `@auth.id!=""` | `admin \|\| manager` | `admin \|\| manager` |
| device_tokens | scoped to user/admin/manager | `@auth.id!=""` | scoped | scoped |

发现的漏洞：

### A. `handoffs.updateRule = @request.auth.id != ""` 🔴 P0
**任意登录用户可以 PATCH 任意 handoff 的 status 为 approved/rejected**，不需要是 reviewer、manager 或 project member。

攻击演示：员工 A 用自己的 token 直接 `PATCH /api/collections/handoffs/records/xxx` body `{"status":"approved","approved_task":""}`，绕过 `useApproveHandoff` 整个流程，结果 handoff 被标为 approved 但没有创建新任务、没有 audit_log、没有通知。

应改为：`reviewer = @request.auth.id || @request.auth.role = "admin" || @request.auth.role = "manager"`，或仅 admin/manager。

### B. `audit_logs.createRule = @request.auth.id != ""` 🟡 P1
任意登录用户能创建任意 audit_log（指定任意 operator、project、task、action_type）→ 可注入伪造审计记录。

应改为：`operator = @request.auth.id`（强制 operator 与 auth 一致）。

### C. `notifications.createRule = @request.auth.id != ""` 🟡 P1
任意用户能创建发给任意人的通知（指定 user 字段为别人）→ 钓鱼 / 骚扰风险。

应改为：管理员或服务端身份；或在 hook 中强校验 type 与 link 配对。这与"前端做副作用"架构本身冲突——前端必须能给别人发通知，所以彻底收紧需要先迁通知逻辑到 PB hooks。

### D. `tasks.updateRule` 允许 assignees 改任意字段 🟡 P1
赋值人能直接 `PATCH /tasks/:id` 设 `status='completed'` 而不走 handoff 流程，且 PB 层无办法限制"只能改 X 字段"（PB rules 是行级，不是字段级）。

唯一解：onRecordBeforeUpdate hook 检测 `oldRecord.status != "completed" && newRecord.status == "completed"` → 强制要求带交接 / 调用专用 endpoint。

### E. audit_logs 的 listRule 是 `@auth.id != ""` 🟡 P1
任何登录员工能列出**所有项目**的审计日志（包括不属于自己项目的）。员工本身就能看到其他项目的操作历史 → 信息泄露。

应改为：`@request.auth.role = "admin" || @request.auth.role = "manager" || project.members ~ @request.auth.id`。

---

## 4. 建议加的 PB hooks（兜底层）

按优先级排：

### P0 必加
1. **`onRecordBeforeUpdate('tasks', ...)`** — 自动写 audit_log（before/after diff）。即使 admin UI / 外部 API / `TaskDetail.handleComplete` / `useUpdateTaskSequence` 漏写也能保证 I1。
2. **`onRecordAfterUpdate('handoffs', ...)`** — 当 status 从 pending 变 approved 时自动校验 `approved_task` 必填；变 rejected 时自动写 audit_log。即使绕过 `useApproveHandoff` 也能保证 I3/I4 不破坏。
3. **`onRecordBeforeDelete('tasks', ...)`** — 级联清理 handoffs（from_task / approved_task）、audit_logs（task）、notifications（link_type=task && link_id=:id）。或软删（status='deleted'）保留审计。保证 I5。
4. **`onRecordBeforeDelete('projects', ...)`** — 级联清理整个项目相关数据。保证 I6。

### P1 推荐
5. **`onRecordAfterCreate/Update/Delete('tasks', ...)`** — 重算 `projects.total_tasks/completed_tasks/progress`。这是唯一可靠的方法保证 I9。
6. **`onRecordBeforeCreate('audit_logs', ...)`** — 强制 `operator = @request.auth.id`，弥补 rule 限制不到字段级的问题。
7. **`onRecordBeforeCreate('notifications', ...)`** — 校验 type 在白名单 + link_type/link_id 配对；可选地禁止 user 指向 auth.id 之外（除非 caller 是 manager+）。
8. **`onRecordAfterUpdate('tasks', ...)`** — 当 status 变 completed 但没有对应 pending handoff（且 actor 非 manager）→ 阻止或自动创建占位 handoff，保证 I2。

### P2 锦上添花
9. `cronJob('overdue-sweeper')` — 每天扫描 `deadline < now() && status not in (completed, overdue)` → 自动改 overdue 并通知。当前通过前端轮询/计算，未真正落库。

---

## 5. 优先级总结

### P0（生产数据已经/即将不一致；必须立即修）

| ID | 描述 | 影响面 |
|---|---|---|
| P0-1 | `TaskDetail.tsx handleComplete` 绕过 `useMarkTaskComplete`，直接改 status='completed' 无 handoff —— 违反 I2 | 任何打开任务详情的员工都能跳过强制交接流程 |
| P0-2 | `AdminDashboard.tsx handleDeleteTask` 删任务无 audit_log；`handleProjectStatusChange` 改项目状态无 audit_log —— 违反 I1 | 经理在 Admin 面板的操作全部无审计 |
| P0-3 | `handoffs.updateRule` 过宽，任意用户能改任意 handoff 为 approved 而不创建任务 —— 违反 I3 + 安全漏洞 | 任何登录用户的 token 都能操控审批流 |
| P0-4 | `useDeleteTask` 不清理关联 handoffs / audit_logs / notifications；外键 `cascadeDelete: false` —— 违反 I5 | ReviewCenter 出现 expand 失败的幽灵记录（已可触发） |
| P0-5 | `useDeleteProject` 仅删 tasks 不删 handoffs/audit_logs/notifications/comments —— 违反 I6 | 通知中心 / 审计列表里看到已删除项目的残留 |

### P1（应加 hook 兜底；当前漏洞窗口较小但 PB Admin / 脚本可触发）

| ID | 描述 |
|---|---|
| P1-1 | tasks.updateRule 允许 assignees 改任意字段（含 status）—— 需 onRecordBeforeUpdate('tasks') 校验 status 转移 |
| P1-2 | audit_logs.createRule 不锁 operator —— 可伪造审计；需 hook 强校 |
| P1-3 | notifications.createRule 不锁 user —— 可发通知给任意人；需 hook 强校或迁到 PB 端 |
| P1-4 | audit_logs.listRule 允许任意员工看所有项目审计 —— 收紧到 project.members |
| P1-5 | `project.total_tasks/completed_tasks/progress` 无人维护，初始值后永不更新 —— 违反 I9，需 task hooks 重算 |
| P1-6 | `useUpdateAuditLogStatus` 只对 mark_complete/update_task 做回滚，其它 action_type 拒绝时无任何效果 —— 违反 I10 |

### P2（理论可违反，实际触发概率低）

| ID | 描述 |
|---|---|
| P2-1 | `useUpdateTaskSequence` 不写 audit_log（拖拽排序无审计） |
| P2-2 | `useMarkTaskBlocked` 不排除自己出现在 need_help_from |
| P2-3 | overdue 状态从未真正落库（前端实时计算） |
| P2-4 | TasksBulkBar 批量完成显式跳 handoff（业务有意为之，文档需说明） |

---

## 6. 修复方向建议（不给完整 patch）

1. **最低成本最高收益**：先收紧 `handoffs.updateRule` 与 `audit_logs.createRule`（一个 migration，10 分钟）—— 关掉 P0-3、P1-2 两个洞。
2. **架构层修正**：把 `TaskDetail.handleComplete`、`AdminDashboard.handleDeleteTask`、`AdminDashboard.handleProjectStatusChange` 全部改用 `lib/api.ts` 中现成的 mutation hook，消除 P0-1、P0-2，并把"业务副作用必走 api.ts mutation"作为代码评审硬规则。
3. **PB hooks 兜底**：新增 `backend/pb_hooks/cascade.pb.js` 实现 P0 级 hooks（tasks/projects 删除级联 + handoff 状态转移校验 + task status 自动 audit）。这是真正解决"绕过前端就失效"问题的唯一方法。
4. **进度字段**：考虑两种方案 —— (a) PB hook 重算并落库，(b) 干脆把 `project.total_tasks/completed_tasks/progress` 从 schema 移除，全部前端实时聚合。两条都行，但不能维持现状（写一次永不更新）。
