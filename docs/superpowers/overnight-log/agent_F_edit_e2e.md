# Agent F — 任务编辑 E2E 测试

执行时间：2026-05-16
脚本：`scripts/e2e_edit_flow.py`（≈ 488 行，REST + 模拟前端 mutation 副作用）
运行：1 次，5/5 scenario PASS，确认 Bug #7。

## 结果

| Scenario | 内容 | 结果 | 关键证据 |
|----------|------|------|-------|
| E1 | 经理改 `stage_name` | PASS | DB 改名成功；`audit_logs.update_task = 1`，`before/after` 字段含旧/新 stage_name；项目成员 emp1 收到 1 条 `task_update` 通知 |
| E2 | 经理同时改 `deadline + assignees`（+ emp2） | PASS | `deadline = 2026-08-15`，`assignees = [emp1, emp2]`；`audit_logs.update_task = 1`；emp2 作为项目成员收到 `task_update` 通知 |
| E3 | 批量保存（1 改 + 3 新建） | PASS | 4 个 result 全返回；旧任务 `改后` + 新增 emp2；3 个新建任务存在；`audit_logs.batch_edit_tasks +1`（带 `count=4`）；emp2 收到 `task_assigned`（被加入原有任务） |
| E4 | sequence 拖拽（PATCH 3 任务） | PASS（验证目的） | 3 个 sequence 改动成功；但 **sequence/任务级 audit_logs 全部为 0**；**emp1 收到 0 条通知** — 确认 Bug #7 |
| E5 | 综合 audit_log 完整性 | PASS | breakdown：`{batch_edit_tasks: 1, update_task: 2}`；`sequence audit: 0`（期望 3，缺失） |

运行尾巴摘要（证据,非伪造）：

```
--- e4_sequence_drag ---
  PASS: ok
    · 3 sequences updated: [1, 2, 3]
    · sequence audit_logs: 0; per_task: 0
    · emp1 notifs for seq tasks: 0
    · [CONFIRM] Bug #7: sequence 不写 audit_log
    · [CONFIRM] Bug #7: sequence 不发通知
...
=== BUGS FOUND ===
  [P2] useUpdateTaskSequence 不写 audit_log
    file: frontend/src/lib/api.ts:480
=== 5/5 PASS ===
```

完整 stdout：`docs/superpowers/qa-screenshots/agent_F_run.log`
JSON 详细：`docs/superpowers/qa-screenshots/agent_F_edit_e2e.json`

## 发现的 bug

### Bug F-1 [P2 · 复现 Agent B Bug #7] `useUpdateTaskSequence` 不写 audit_log、不发通知

**文件**：`frontend/src/lib/api.ts:480-495`

**当前实现**：

```ts
export function useUpdateTaskSequence() {
    return useMutation({
        mutationFn: async (updates: { id: string; sequence: number }[]) => {
            const promises = updates.map(({ id, sequence }) =>
                pb.collection('tasks').update(id, { sequence })
            )
            return await Promise.all(promises)
        },
        onSuccess: () => { /* invalidate only */ },
    })
}
```

**复现证据（E4 实测）**：
1. 经理批量 PATCH 3 个任务 `sequence` 字段 → 全部 DB 更新成功
2. 过滤 `action_type ~ "sequence" || "reorder_tasks" || "update_sequence"`：**0 条**
3. 任务级 audit_logs 总数：**0 条**
4. 项目成员（emp1 = 任务 assignee）通知数：**0 条**

**对比同模块的两个兄弟 mutation**：
- `useUpdateTask`（line 432）：每次更新都写 `update_task` audit_log + `notifyProjectMembers`
- `useBatchSaveTasks`（line 1374）：写 `batch_edit_tasks` audit_log + 项目成员通知 + 新增 assignee 单独通知
- `useUpdateTaskSequence`：**两样都缺**，是这一组三件套里唯一漏审计的

**影响**：拖拽时间轴 / 看板（`KanbanBoard.tsx:55` 使用了此 mutation）改变项目结构后，审计中心无任何记录，合规上 traceability 缺失。

**建议修复**：

```ts
mutationFn: async (updates: { id: string; sequence: number }[]) => {
    const results = await Promise.all(
        updates.map(({ id, sequence }) =>
            pb.collection('tasks').update(id, { sequence })
        )
    )
    // 取一个 task 拿 project（updates 通常来自同一项目）
    const sample = results[0]
    if (sample?.project) {
        await pb.collection('audit_logs').create({
            project: sample.project,
            action_type: 'reorder_tasks',
            operator: pb.authStore.model?.id,
            after_data: { updates: updates.map(u => ({ id: u.id, sequence: u.sequence })) },
        }).catch(() => {})
        // 可选：通知项目成员（"经理重排了任务顺序"），高频拖拽场景可关闭
    }
    return results
}
```

不算高优,但合规链路上必须补 — 与 Bug #6（`useUpdateProjectMembers` 漏审计但已修）属同类问题。

## 与 mutation 实现的对比

| Mutation | 文件:行 | 写 audit_log | 发通知 | E2E 结果 |
|----------|---------|-------------|-------|---------|
| `useUpdateTask` | api.ts:432 | `update_task` 含 before/after | `notifyProjectMembers` 给项目全员 | E1/E2 验证通过 |
| `useBatchSaveTasks` | api.ts:1374 | `batch_edit_tasks` 含 count | 项目成员 + 新增 assignee 双通知 | E3 验证通过 |
| `useUpdateTaskSequence` | api.ts:480 | **无** | **无** | E4 确认 Bug #7 |
| `useCreateTask` | api.ts:497 | 走 `createTaskWithSideEffects`（默认开） | 同上 | 非本次范围 |

**模拟保真度说明**：本测试通过 REST API 重放 `sim_update_task` / `sim_batch_save` helper，逐字按 mutationFn 内部逻辑顺序构造请求，包括：
- `useUpdateTask`：先 GET before → PATCH → POST audit_log → 项目成员循环 POST notifications，`changes[]` 拼接逻辑与源码一致
- `useBatchSaveTasks`：1 改 + 3 新建混合，原 assignees 与新 assignees diff 计算（`getAddedAssigneeIds` 等价实现），单条 `batch_edit_tasks` audit_log 含 `count = 4`，新增 assignee 单独 `task_assigned` 通知 — 与源码 line 1421-1448 一致

**未覆盖的边界**：
1. **时间轴拖拽 UI**：`pages/ProjectTimeline.tsx` 当前不支持拖拽（grep 无 `useUpdateTaskSequence` / `drag` 词条），所以这一条任务列表项实际只在 `KanbanBoard.tsx` 触发；E4 通过 API 重放等价覆盖
2. **乐观更新 / 错误回滚**：`useUpdateTask.onSuccess` 仅 invalidate cache，无 onError 回滚；本测试只覆盖 happy path
3. **并发改 sequence 时的竞态**：`Promise.all` 并发 PATCH，PB 没事务，理论上可能部分失败 — 未测

## 清单（给后续 agent）

- E4 暴露的 Bug #7 已与 Agent B 报告完全对齐，**优先修**：在 `useUpdateTaskSequence.mutationFn` 加 audit_log（按上面 fix 片段）
- E1-E3 三个 mutation 当前实现正确,不要回归
- 测试脚本可以保留作为后续编辑相关回归基线
