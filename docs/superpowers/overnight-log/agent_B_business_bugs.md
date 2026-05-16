# Agent B — 业务逻辑 Bug 嫌疑清单

扫描范围：`frontend/src/lib/api.ts`、`components/tasks/*`、`components/BatchTaskEditor.tsx`、`pages/TaskDetail.tsx`、`pages/admin/AdminDashboard.tsx`、`pages/ReviewCenter.tsx`

与已修复的 Bug A（`useRejectHandoff` 不回滚 `from_task`）、Bug B（`TasksBulkBar.batchMarkComplete` 绕过 mutation 不写 audit_log）属于同模式。

---

## HIGH 严重度

### Bug #1 [确定] — `useApproveHandoff` 不同步 `from_task` 状态（与 Bug A 镜像）
- **文件**：`frontend/src/lib/api.ts:562-627`
- **现状**：
  ```ts
  const handoff = await pb.collection('handoffs').getOne<Handoff>(id)
  const newTask = await createTaskWithSideEffects({...predecessor_tasks: [handoff.from_task]})
  await pb.collection('handoffs').update(id, { status: 'approved', ... })
  // ❌ 没有任何 from_task 的状态变更
  ```
- **业务后果**：
  - 场景 1：员工通过 PR 4 `TasksBulkBar.batchMarkComplete` 批量标记完成（直接 PB 写 status=completed，不走 `useMarkTaskComplete`），后又有人手动从 ReviewCenter 创建 handoff 并被审批通过 — 工作流不一致，from_task 不一定还是 completed。
  - 场景 2：员工通过 `useMarkTaskComplete` 时 from_task 已经设为 completed；但若状态被审计 Reviewer 用 `useUpdateAuditLogStatus` 拒绝过 `mark_complete` 后回滚成 `in_progress`，此时再批准遗留的 handoff，from_task 仍为 in_progress，但新任务已经创建，前序任务变成"幽灵进行中"。
  - **更严重**：如果 from_task 当前是 `blocked`（员工先标完成再标卡点），批准 handoff 后 from_task 还是 blocked，但下游任务已经创建并分配给新人，看上去项目并行进行但实际前置阻塞未解决。
- **修复建议**：在更新 handoff 后强制把 `from_task.status` 设为 `completed`：
  ```ts
  await pb.collection('handoffs').update(id, { status: 'approved', ... })
  // 与 useRejectHandoff 镜像：批准意味着接受"完成" — 强制 from_task=completed
  await pb.collection('tasks').update(handoff.from_task, {
      status: 'completed',
      completed_at: new Date().toISOString(),
  }).catch(e => console.warn('sync from_task to completed failed', e))
  ```
- **复现**：
  1. 员工 A 标完成任务 T1 → status=completed + handoff H1 创建
  2. 管理员在 ReviewCenter 拒绝 T1 的 mark_complete audit_log → T1.status 被回滚成 in_progress（`useUpdateAuditLogStatus` 行 1486-1497）
  3. 管理员仍在 pending 列表看到 H1，点批准
  4. 结果：H1.approved；新任务 T2 创建；但 T1 还在"进行中"，员工 A 看到自己的任务还要再做一次。
- **严重度**：HIGH

### Bug #2 [确定] — `TasksBulkBar.batchMarkComplete` 不通知项目成员、不写 `notifyProjectMembers`、不 invalidate `projects` / `notifications`
- **文件**：`frontend/src/components/tasks/TasksBulkBar.tsx:22-69`
- **现状**：
  ```ts
  await pb.collection('tasks').update(t.id, { status: 'completed', completed_at })
  await pb.collection('audit_logs').create({ action_type: 'bulk_mark_complete', ... })
  // ❌ 没有调用 notifyProjectMembers
  // ❌ invalidate 只有 tasks/myTasks/audit_logs，没有 projects、['notifications']、queryKeys.projectTasks(t.project)
  ```
- **业务后果**：
  - 项目经理/其他成员不会收到"X 完成了 N 个任务"通知；单条 `useMarkTaskComplete` 行 858 会通知项目全员，批量场景下静默。
  - 项目卡片上的 `completed_tasks` / 进度百分比 query 不刷新；用户必须手动下拉刷新。
  - 项目详情页 `useTasks(projectId)`（queryKey `projectTasks(projectId)`）不刷新，用户在项目页看不到状态变化直到 staleTime（15s）过期或手动刷新。
- **修复**：
  ```ts
  // 在每条 update 后或循环结束后
  const affectedProjects = new Set(pending.map(t => t.project))
  for (const pid of affectedProjects) {
    await notifyProjectMembers(pid,'任务批量完成',
      `${currentUser.name} 批量完成了 ${pending.filter(t=>t.project===pid).length} 个任务`,
      'task_update', operatorId).catch(() => {})
  }
  // invalidate
  queryClient.invalidateQueries({ queryKey: queryKeys.projects })
  queryClient.invalidateQueries({ queryKey: ['notifications'] })
  for (const pid of affectedProjects) {
    queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(pid) })
    queryClient.invalidateQueries({ queryKey: queryKeys.project(pid) })
  }
  ```
- **复现**：成员 A 选 5 个任务点"标记完成" → 经理 B 在项目页/通知中心看不到任何变化。
- **严重度**：HIGH

### Bug #3 [确定] — `AdminDashboard.handleDeleteTask` 直接 PB delete，无 audit_log、无通知（与 Bug B 同模式）
- **文件**：`frontend/src/pages/admin/AdminDashboard.tsx:423-442`
- **现状**：
  ```ts
  await pb.collection('tasks').delete(taskId)
  setProjectTasks(prev => prev.filter(t => t.id !== taskId))
  // ❌ 没写 audit_logs，没调 notifyProjectMembers，没刷新 queryKeys.tasks
  ```
- **业务后果**：
  - 管理员从后台删任务，被删任务的执行人和项目经理收不到任何通知 → 数据离奇消失。
  - 审计中心查不到此次删除记录 → 合规黑洞，无法追责。
  - React Query 缓存中 `queryKeys.tasks` / `queryKeys.projectTasks(pid)` 不会刷新，其他打开的页面（时间轴、看板）仍显示已删任务直到 staleTime 过期。
- **修复**：直接调用 `useDeleteTask().mutateAsync(taskId)` 而非 raw `pb.collection('tasks').delete()`。
- **复现**：以 admin 身份登录后台 → 选任意项目 → 删除一个任务 → 检查 audit_logs collection 无 `delete_task` 记录，执行人无通知。
- **严重度**：HIGH

### Bug #4 [确定] — `AdminDashboard.handleProjectStatusChange` 直接 PB update，无 audit_log、无通知、无 cache invalidate
- **文件**：`frontend/src/pages/admin/AdminDashboard.tsx:314-323`
- **现状**：
  ```ts
  await pb.collection('projects').update(project.id, { status: newStatus })
  Toast.show({ icon: 'success', content: '项目状态已更新' })
  refreshAll()  // ← 这里只刷新本页 state，不通知 RQ
  ```
- **业务后果**：
  - 管理员把 active 项目改成 archived/completed 时绕过 `useArchiveProject`（api.ts:1402）和 `useUpdateProject`（api.ts:1170）的审计 + 通知逻辑。
  - 项目成员收不到归档通知，明天打开 App 时只是发现自己的项目神秘消失。
  - audit_logs 无记录 → 不可追溯。
- **修复**：使用 `useUpdateProject` 或 `useArchiveProject` hook 取代直接 PB 调用。
- **复现**：admin 在后台把项目状态从"进行中"改为"已归档" → 项目所有成员无通知。
- **严重度**：HIGH

---

## MEDIUM 严重度

### Bug #5 [确定] — `useDeleteProject` 级联删任务时不清理 handoffs、audit_logs 外键悬挂
- **文件**：`frontend/src/lib/api.ts:1095-1134`
- **现状**：
  ```ts
  const tasks = await pb.collection('tasks').getFullList(...)
  await Promise.allSettled(tasks.map(t => pb.collection('tasks').delete(t.id)))
  await pb.collection('projects').delete(projectId)
  // ❌ 不删 handoffs（这些 handoffs 的 from_task 是被删任务，project 也是被删项目）
  // ❌ 不删 comments、progress_logs、notifications.link_id 引用
  ```
- **业务后果**：
  - 删除项目后，`usePendingHandoffs` 仍可能返回 pending handoffs，from_task 为空（PB 取消引用或 404 expand 失败）。审核中心崩溃或显示空白卡片。
  - 通知 link_id 指向已删任务 → 用户点击通知 404。
- **修复**：在删项目前批量清理：
  ```ts
  const handoffs = await pb.collection('handoffs').getFullList({ filter: `project="${projectId}"`, fields: 'id' })
  await Promise.allSettled(handoffs.map(h => pb.collection('handoffs').delete(h.id)))
  const comments = await pb.collection('comments').getFullList({ filter: `project="${projectId}"`, fields: 'id' })
  await Promise.allSettled(comments.map(c => pb.collection('comments').delete(c.id)))
  // tasks → projects 顺序保留
  ```
- **复现**：创建项目 P → 员工标完成某任务（产生 pending handoff）→ 管理员删除项目 P → 打开 ReviewCenter `pending` tab → 看到 handoff 但 from_task 加载失败。
- **严重度**：MEDIUM

### Bug #6 [确定] — `useDeleteTask` 不清理任务关联的 handoffs / blockers / 引用此任务作 predecessor 的下游任务
- **文件**：`frontend/src/lib/api.ts:1137-1167`
- **现状**：
  ```ts
  await pb.collection('tasks').delete(taskId)
  // ❌ 不删 handoffs where from_task=taskId
  // ❌ 不清理 next_task.predecessor_tasks 中包含此 id 的引用
  // ❌ 不删 comments where step=taskId
  ```
- **业务后果**：
  - 删除任务后 pending handoff 残留 → 管理员可能误批准，创建幽灵下游任务（from_task 已不存在）。
  - 时间轴前序依赖渲染时找不到 predecessor → UI 显示空白或断链。
  - 评论区数据残留。
- **修复**：
  ```ts
  // 删除前
  const orphanHandoffs = await pb.collection('handoffs').getFullList({ filter: `from_task="${taskId}"`, fields: 'id' })
  await Promise.allSettled(orphanHandoffs.map(h => pb.collection('handoffs').delete(h.id)))
  // 清理下游 predecessor 引用
  const downstream = await pb.collection('tasks').getFullList({ filter: `predecessor_tasks ~ "${taskId}"`, fields: 'id,predecessor_tasks' })
  for (const d of downstream) {
    await pb.collection('tasks').update(d.id, {
      predecessor_tasks: (d.predecessor_tasks||[]).filter(p => p !== taskId)
    })
  }
  ```
- **复现**：员工标完成 T1 → 产生 pending handoff H1 → 管理员（绕过 ReviewCenter）从任务详情删除 T1 → H1 残留在审核中心。
- **严重度**：MEDIUM

### Bug #7 [确定] — `useUpdateTaskSequence` 批量改 sequence 不写 audit_log、不通知
- **文件**：`frontend/src/lib/api.ts:480-495`
- **现状**：
  ```ts
  mutationFn: async (updates) => {
    const promises = updates.map(({ id, sequence }) =>
      pb.collection('tasks').update(id, { sequence })
    )
    return await Promise.all(promises)
  }
  // ❌ 不写 audit_log，不通知
  ```
- **业务后果**：
  - 拖拽重排时间轴/看板改变项目结构 → 合规缺失，无法追溯谁改了节点先后顺序。
  - 这是与 Bug B 同模式的"绕过 useUpdateTask"，每条 `update` 都直接 PB 调用而非 mutation 链路。
- **修复**：循环结束后写一条聚合 audit_log（避免噪音）：
  ```ts
  await pb.collection('audit_logs').create({
    project: firstTask.project,
    action_type: 'reorder_tasks',
    operator: pb.authStore.model?.id,
    after_data: { count: updates.length, ids: updates.map(u=>u.id) },
  }).catch(() => {})
  ```
- **复现**：经理拖拽时间轴排序 → 审计中心查不到任何变更记录。
- **严重度**：MEDIUM

### Bug #8 [嫌疑] — `useMarkTaskBlocked` rollback 写入 `blocker` 中嵌套 `rollback_to` 字段但类型定义不含此字段
- **文件**：`frontend/src/lib/api.ts:880-974`，配合类型定义 `:48-53`
- **现状**：
  ```ts
  blocker?: {
    reason_type: string
    reason_detail: string
    need_help_from: string[]
    expected_resolve: string
    // ❌ 没有 rollback_to 字段
  }
  // 但实现中：
  const blockerData = { ...blocker }
  if (rollbackToTaskId) blockerData.rollback_to = rollbackToTaskId  // 越权写非声明字段
  ```
- **业务后果**：
  - 取决于 PocketBase 的 schema：如果 schema 是 JSON 字段则会保存但前端读时类型不安全；如果是 strict struct，则 PB 静默丢字段，导致"回退到哪个任务"信息丢失。
  - `useUnblockTask`（行 1205）从 `blocker` 解除时不读 `rollback_to`，所以即便保存了，解除卡点时也不会把回退任务再设回 `completed`/`blocked` → **回退后再次解除卡点会造成"两个任务同时进行中"的循环**。
- **修复**：
  1. 在 Task.blocker 类型加 `rollback_to?: string`；
  2. `useUnblockTask` 解除时检查 `task.blocker?.rollback_to` 决定是否需要把它再标 completed；并通知该任务负责人"卡点已解除"。
- **复现**：T2 卡点 → 选择回退到 T1 → T1 status='in_progress' → T2.unblock(newStatus='completed') → T1 仍在"进行中"无人通知，所有人困惑 T1 到底完没完成。
- **严重度**：MEDIUM（确定有副作用，但严重度依赖业务约定）

### Bug #9 [确定] — `useUpdateAuditLogStatus` 拒绝 `mark_complete` 回滚任务时不通知项目成员，且不删除已经创建的 handoff
- **文件**：`frontend/src/lib/api.ts:1486-1500`
- **现状**：
  ```ts
  if (review_status === 'rejected' && auditLog.action_type === 'mark_complete' && auditLog.task) {
    const task = await pb.collection('tasks').getOne(auditLog.task)
    if (task.status === 'completed') {
      await pb.collection('tasks').update(auditLog.task, { status: 'in_progress' or 'overdue', completed_at: null })
    }
  }
  // ❌ 没有处理：mark_complete 时同步创建的 handoff（useMarkTaskComplete 行 836 创建了 pending handoff）
  // ❌ 没通知项目成员"X 的任务被打回"
  // ❌ 没通知执行人（只下面有"操作人通知"，但不一定是 assignee）
  ```
- **业务后果**：
  - 审计拒绝任务完成时，对应的 pending handoff 仍在 ReviewCenter 等待审批；如果另一个审核员批准了 handoff（Bug #1），就同时存在"任务进行中 + 下游任务已创建"的矛盾状态。
  - 任务执行人若不是操作人（理论上一致，但 audit_log.operator 可能是其他被代操作的账号），通知会发错地址。
- **修复**：
  ```ts
  // 在 status 回滚后，查找并取消该任务的 pending handoff
  const pendingHandoffs = await pb.collection('handoffs').getFullList({
    filter: `from_task="${auditLog.task}" && status="pending"`,
    fields: 'id'
  })
  for (const h of pendingHandoffs) {
    await pb.collection('handoffs').update(h.id, {
      status: 'rejected',
      review_note: `因任务完成被审计拒绝自动撤销 (${reject_note || ''})`,
      reviewer: pb.authStore.model?.id,
    })
  }
  // 通知任务的 assignees 和项目经理
  await notifyProjectMembers(task.project, '任务完成被退回', ...)
  ```
- **复现**：员工 A 标完成 T1（产生 handoff H1）→ 管理员在审计中心拒绝 mark_complete → T1 回到 in_progress；但 H1 仍 pending；另一管理员批准 H1 → 下游任务创建，T1 没人去做。
- **严重度**：MEDIUM-HIGH（取决于多管理员场景频率）

---

## LOW 严重度

### Bug #10 [确定] — `useMarkTaskBlocked` 通知 `need_help_from` 时不去重也不排除当前操作者
- **文件**：`frontend/src/lib/api.ts:956-965`
- **现状**：
  ```ts
  for (const userId of blocker.need_help_from) {
    await createNotificationRecord({ user: userId, ... })
  }
  // ❌ 未 uniqueUserIds 去重；也未 excludeUserId 排除自己
  ```
- **业务后果**：员工选自己当协助人 → 自我通知；选了重复 ID → 多条相同通知。
- **修复**：
  ```ts
  for (const userId of uniqueUserIds(blocker.need_help_from)) {
    if (userId === pb.authStore.model?.id) continue
    ...
  }
  ```
- **严重度**：LOW

### Bug #11 [嫌疑] — `useBatchSaveTasks` 在编辑已有任务时不写每任务的 update_task audit_log（只写一条 batch_edit_tasks 聚合日志）
- **文件**：`frontend/src/lib/api.ts:1304-1330, 1332-1337`
- **现状**：
  ```ts
  if (t.id) {
    const r = await pb.collection('tasks').update(t.id, { stage_name, assignees, ... })
    // ❌ 没有针对该任务的 audit_log，before_data 已查出但未用
  }
  // 后面只写一条聚合
  await pb.collection('audit_logs').create({ action_type: 'batch_edit_tasks', after_data: { count } })
  ```
- **业务后果**：审计中心无法回放"批量编辑里 T1 被改了 deadline"这一具体信息；`useUpdateAuditLogStatus` 的"按 before_data 回滚" 功能（行 1500-1513）对批量编辑完全失效。
- **修复**：在每条 update 后写明细 audit_log（before_data 保留 old），同时保留聚合记录以便审计中心列表呈现简洁。
- **严重度**：LOW（数据可追，回滚不可）

---

## 修复优先级建议

| 排序 | Bug | 理由 |
|------|-----|------|
| 1 | #1 useApproveHandoff 不同步 from_task | 与 Bug A 完全镜像，多审核员场景下产生"幽灵进行中"前序，业务最伤 |
| 2 | #2 batchMarkComplete 不通知 + 不刷 projects | PR 4 上线后高频路径，团队协作通知静默；与 Bug B 同 PR |
| 3 | #3 + #4 AdminDashboard 直接 PB 调用绕过 mutation | 合规黑洞，admin 操作完全无审计；与 Bug B 同模式但发生在 admin 端，影响面更广 |

---

## 工具调用统计
- Read: 5 次（api.ts, TasksBulkBar, BatchTaskEditor, TaskDetail 片段, AdminDashboard 片段, queryClient, ReviewCenter 片段）
- Grep: 4 次
- Glob: 1 次
- PowerShell: 1 次（mkdir）
共约 12 次调用，远低于 60 的上限。
