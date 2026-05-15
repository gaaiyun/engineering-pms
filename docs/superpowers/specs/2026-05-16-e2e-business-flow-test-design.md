# 端到端业务流程测试设计

**日期：** 2026-05-16
**目的：** 在 18 个真实账号 + 真实 PocketBase 数据上，跑 manager + employee 协作的核心业务流，发现 bug 立即修复。
**作者：** Claude（按 superpowers brainstorming → writing-plans → executing-plans 流程）
**用户授权：** "核心 happy path + 主线错路 + 发现 bug 立即修，一 bug 一 commit"

---

## 1. 测试方法（已选 Approach A）

**Playwright 双浏览器上下文 + 真实 PocketBase 后端**：
- 同一个 Chromium 进程内开 2 个独立 `BrowserContext`（独立 cookie + localStorage + sessionStorage）
- Context A：manager 角色登录（默认 zhang_manager）
- Context B：employee 角色登录（默认 zhao_site，"赵工长"）
- 业务流真实穿透 React → PB REST → SQLite，跨 context 验证通知/状态/审计

**为什么不选 API-only？** 会漏掉所有 React mutation 路径上的 bug（cache invalidation、optimistic update、permission check）。
**为什么不选 Mock？** 真 PB + 真表 = 真实数据流，能暴露 schema / hook / migration 问题。

---

## 2. 测试角色

| 角色变量 | 用户名 | 显示名 | 业务角色 |
|---|---|---|---|
| `MANAGER` | `zhang_manager` | 张经理 | 主测 manager — 建任务、审核 |
| `MANAGER2` | `mgr_li` | 李经理 | 错路场景的拒绝者（验证跨 manager 操作） |
| `EMPLOYEE` | `zhao_site` | 赵工长 | 主测 employee — 接收任务、改状态、完成 |
| `EMPLOYEE2` | `chen_doc` | 陈资料 | 备用 employee（批量场景需要多 assignee） |

所有密码均为 `12345678`（PB 内默认）。

---

## 3. 测试场景（6 个）

### S1 — Manager 建任务 + 指派 + 通知

**Setup：**
- Manager 登录，跳转到 `/admin`
- 选一个已有项目（取 `useProjects()` 返回的第一个 active 项目）

**Action：**
- 在项目页点"新建任务"
- 填表：`stage_name="E2E-Test-{timestamp}"`, `description="自动化测试任务"`, `deadline=今天+7天`, `assignees=[zhao_site.id]`, `priority="normal"`
- 提交

**Verify：**
1. **UI**：返回项目页，新任务出现在列表
2. **DB**：`GET /api/collections/tasks/records?filter=stage_name~"E2E-Test-"` 返回 1 条，`status="pending"`，`assignees=[zhao_site.id]`
3. **通知**：employee 视角的 `unreadNotificationCount` +1，notifications 表新增一条 `type="task_assigned"` 给 zhao_site

---

### S2 — Employee 接收 + 状态变更 pending→in_progress

**Setup：** Employee 登录（zhao_site）

**Action：**
1. 进入"我的任务"页（mobile：卡片 / desktop：表格），找到刚才的 E2E 任务
2. 点进任务详情
3. 点"开始处理"按钮（or 状态选择 → 进行中）

**Verify：**
1. **UI**：状态 Tag 由"待办"灰色变"进行中"蓝色，Toast 显示成功
2. **DB**：`tasks.status="in_progress"`，`audit_logs` 表新增 1 条 `action_type="status_change"` 关联此任务
3. **通知**：manager 收到 1 条 `type="task_started"` or 类似

---

### S3 — Employee 标记完成触发 handoff

**Setup：** 继续 S2 的会话

**Action：**
1. 任务详情页点"完成"
2. 弹 handoff 对话框，填：`proposedTitle="后续验证"`, `proposedAssignees=[manager.id]`, `proposedDueDate=今天+3天`
3. 提交

**Verify：**
1. **UI**：返回我的任务，刚才任务从"进行中"消失（移到"已完成"或留 handoff pending 标记）
2. **DB**：
   - `handoffs` 表新增 1 行，`from_task=任务id`, `proposed_assignees=[manager.id]`, `status="pending"`
   - 原 `tasks.status` 可能仍是 `in_progress` 或变 `completed`（看实现）
3. **通知**：manager 收到 `type="handoff_pending"` or `audit_needed`
4. **manager UI**：审核中心 `/review-center` 出现待审项

---

### S4 — Manager approve handoff

**Setup：** Manager 端

**Action：**
1. 进 `/review-center`
2. 找到刚才的 handoff，点"批准"
3. 确认 dialog

**Verify：**
1. **UI**：handoff 从待审列表消失，Toast"已批准"
2. **DB**：
   - `handoffs.status="approved"`
   - 原 `tasks.status="completed"`，`tasks.completed_at` 有值
   - 新任务可能生成（若 handoff 创建了 next-step）
   - `audit_logs` 增加 1 条 `action_type="handoff_approve"`
3. **通知**：employee 收到 `type="handoff_approved"` or `task_completed`

---

### S5 错路 — Manager 拒绝 handoff

**Setup：** S3 后另起一条 handoff（or 重做 S2-S3 用 employee 提交，由 mgr_li 拒绝）

**Action：**
1. mgr_li 登录 → `/review-center`
2. 找 handoff → "拒绝" → 填理由"测试拒绝场景"

**Verify：**
1. **UI**：handoff 状态变红
2. **DB**：
   - `handoffs.status="rejected"`, `reject_reason="测试拒绝场景"`
   - 原 `tasks.status` 回退到 `in_progress`（NOT `completed`）
3. **通知**：employee 收到 `type="audit_rejected"` 含 reason
4. **错路连续性**：employee 应能再次点完成重新提交 handoff

---

### S6 — Manager 批量改状态（PR 4 批量操作）

**Setup：** 用 API 预先创建 3 个 pending 任务，全部指派给 chen_doc

**Action：**
1. Manager（zhang_manager）desktop 视口登录
2. `/my-tasks`（表格视图）勾选 3 个任务
3. 点底部 "标记完成" Bulk Bar 按钮
4. 确认 Dialog

**Verify：**
1. **UI**：3 个任务从待办 tab 消失，进入已完成 tab，Toast"完成 3 个"
2. **DB**：3 个任务的 `status="completed"`, `completed_at` 均有值，PB call 实际发生 3 次（用 console.log 计数）
3. **缓存**：TanStack Query 自动 invalidate `tasks` 和 `myTasks(userId)`，UI 立即反映

---

## 4. 实现结构

```
scripts/
  e2e_business_flow.py        # 主测试脚本（pytest-style 但用 vanilla python）
  e2e_helpers.py              # 共享：登录、PB API、断言
docs/superpowers/qa-screenshots/
  e2e_S1_*.png  ...  e2e_S6_*.png   # 每个场景关键步骤截图
docs/superpowers/qa-screenshots/
  e2e_results.json            # 每个场景的 pass/fail + 失败原因
docs/superpowers/manual-qa/
  2026-05-16-e2e-business-flow-results.md   # 最终报告
```

测试脚本结构：
- 每个 scenario 独立函数 `s1_create_assign_task() -> ScenarioResult`
- 失败时 raise + 截图 + 继续下一个（不中断全测）
- 最后汇总 pass/fail 矩阵

---

## 5. 失败处理流程

```
S_n fails
   ↓
保存失败截图 + DB 状态 dump
   ↓
分析错误（前端报错 / API 4xx 5xx / 业务断言失败）
   ↓
定位代码（grep / Read 相关文件）
   ↓
修复 → 单个 commit "fix(scope): <error>" 描述发现的具体 bug
   ↓
回滚测试数据 → 重跑该 scenario
   ↓
通过 → 继续下一个 scenario
   ↓
本场景修了 ≥3 个 bug 仍然不过 → 停下来记录到 results.md，转下一个 scenario
```

**安全约束：**
- 修复不动 PR 1-5 已上线代码的核心架构，只补 bug
- 任何 PB schema 变更必须通过 migration 文件（不可直接改 pb_data/data.db）
- 测试数据用前缀 `E2E-Test-` 便于事后清理

---

## 6. 测试数据清理

跑完后 `cleanup_e2e_data()` 删除：
- 所有 `stage_name` 以 `E2E-Test-` 开头的任务
- 关联的 handoffs / notifications / audit_logs
- 关联的 progress_logs

清理用 admin 账号（admin_boss）确保权限够。

---

## 7. 验收标准

- 6 个场景全部 PASS = 通过
- 5/6 PASS = 部分通过，未通过场景已识别 bug + 已提 issue（写入 results.md TODO）
- ≤4/6 PASS = 视为重大问题，停止后续 PR，回滚到 v2.96 稳态

---

## 8. 范围外（明确不做）

- Performance / load testing
- Cross-browser（只跑 Chromium）
- 移动真机（v2.98 APK 验证另文）
- iOS（无环境）
- Reset password / register（不在 happy path）
- AI 分析 / 数据导入（admin 专属功能，先不覆盖）

---

## 9. Spec → Plan 拆分

本 spec 由 `writing-plans` 转成 `2026-05-16-e2e-plan.md`，含每个 scenario 的具体 step + 验证代码。然后 `executing-plans` 跑。

发现 bug 即修，每个 bug 用独立 commit 记录在 git log，便于回溯。
