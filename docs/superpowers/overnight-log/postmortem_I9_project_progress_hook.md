# Postmortem — I9 project.progress PB hook 引入 regression 并 revert

**时间：** 2026-05-16 13:20（夜间作业末段）
**Trigger：** Agent C 数据流审计 P1-5：projects.total_tasks / completed_tasks / progress 字段无人维护

## 改动尝试
`backend/pb_hooks/project_progress_sync.pb.js`（新增）：
- onRecordAfterCreate/Update/Delete('tasks') 时重算所属 project 的三个字段
- 用 `dao.findRecordsByFilter('tasks', filter, ..., 0, 0)` count

## 引入的 regression
E2E business round 25：**0/6 PASS**

**错误证据**：
```
RuntimeError: HTTP 400: {"code":400,"message":"Something went wrong"}
Failed to create record: project validation_required
```

S1 创建 task 直接 400 错误，所有后续 scenario 因没有 task_id 全 FAIL。

## 推测根因（未深入定位前已 revert）

1. **`findRecordsByFilter` 签名错**：PB JS hooks 的 API 可能要求 `findRecordsByFilter(collectionId, filter, sort, limit, offset)` 5 个参数；我传了 0 作 limit 可能不被允许（limit 必须 > 0 或省略）。
2. **hook 内的 `dao.saveRecord(project)` 触发递归 update tasks**：保存 project 可能间接触发其他 hooks 形成循环。
3. **同步触发顺序问题**：onRecordAfterCreate 在 tasks 集合刚 commit 后立即重算，可能 task 还没真正可读取（PB 事务时序问题）。

## 立即处置
- 删除 hook 文件
- 重启 PB
- E2E round 26 验证流程恢复

## 修复方向（v3.1）
此 bug 仍需修，但分步骤：
1. **先在 PB Admin 控制台手动测 hook**（用 PB Admin UI 内置 JS console 跑 `findRecordsByFilter` 单条命令）
2. **改用 `findRecordsByExpr`** 或 raw SQL（PB 支持）
3. **加 try/catch + 严格 limit 参数**
4. **单元测试**：先用 Python E2E 测 PB hook 行为，再合入

## 经验教训
- **小幅改动也要先在隔离环境验证**：直接重启 PB 让所有用户的核心 task create 路径失败是严重 incident
- **PB hooks 调试困难**：错误信息 vague（"Something went wrong"），需要在 hook 内加详尽的 try/catch + console.log
- **过夜自主的纪律**：发现 regression 立即 revert > 试图原地修。saved business flow，留下根因待之后冷静修

## 状态
- 删除文件 + PB 重启 + E2E 恢复 6/6 PASS（round 26 验证）
- I9 仍在 known issues 列表，标记为 v3.1 待修（"需先单独修 hook 实现，不再直接合入"）
