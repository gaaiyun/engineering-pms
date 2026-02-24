# 工程项目协同管理 APP - 技术架构与详细设计文档 v2.0

> **版本**: v2.0 Enterprise  
> **核心栈**: React 19 + TypeScript + Vite + PocketBase + Capacitor  
> **AI 引擎**: SiliconFlow（DeepSeek）

本文件以“当前 v2 代码实现”为准（集合名/字段名/状态枚举与 `v2/scripts/database_rebuild.mjs`、`v2/docs/代码架构文档.md` 对齐）。

---

## 1. 数据库设计（PocketBase Collections）

### 1.1 `users`（Auth）

- `name`（text）
- `avatar`（file）
- `role`（select：`admin`/`manager`/`employee`）
- `department`（select/text，可选）
- `position`（text，可选）
- `flower_count`（number，可选）

### 1.2 `projects`

- `name`（text, required）
- `code`（text，可选）
- `status`（select：`active`/`completed`/`archived`）
- `description`（text，可选）
- `manager`（relation → users, maxSelect=1）
- `start_date` / `end_date` / `deadline`（date，可选）
- `progress` / `total_tasks` / `completed_tasks` / `current_stage`（number/text，可选）

### 1.3 `tasks`（核心）

- `project`（relation → projects, required）
- `stage_name`（text, required）
- `description`（text，可选）
- `status`（select：`pending`/`in_progress`/`blocked`/`completed`/`overdue`）
- `assignees`（relation → users, multiple）
- `created_by`（relation → users, maxSelect=1）
- `start_date` / `deadline` / `completed_at`（date，可选）
- `sequence`（number，可选：看板排序权重）
- `priority`（select：`low`/`normal`/`high`）
- `is_milestone`（bool）
- `blocker`（json：卡点详情）
- `completed_steps` / `next_steps`（text，多行文本）
- （可选）`approved` / `approved_by` / `score`（用于管理员审核/积分场景，非核心流程可不启用）

### 1.4 `handoffs`（交接提案）

- `project`（relation → projects）
- `from_task`（relation → tasks）
- `proposed_title` / `proposed_description`（text）
- `proposed_assignees`（relation → users, multiple）
- `proposed_due_date`（date）
- `status`（select：`pending`/`approved`/`rejected`）
- `submitter` / `reviewer`（relation → users）
- `review_note`（text）
- `approved_task`（relation → tasks，审核通过后生成的新任务）

### 1.5 `comments`

- `step`（relation → tasks）
- `author`（relation → users）
- `content`（text）
- `mentions`（relation → users, multiple，可选）

### 1.6 `audit_logs`

- `project`（relation → projects）
- `task`（relation → tasks）
- `action_type`（text，例如：`status_change`/`handoff`/`blocker`）
- `operator`（relation → users）
- `before_data` / `after_data`（json）
- `note`（text，可选）

### 1.7 `notifications`

- `user`（relation → users）
- `type`（select：`task_assigned`/`handoff_pending`/`blocker_reported`/`deadline_warning`/`system`）
- `title`（text）
- `content`（text，可选）
- `link_type` / `link_id`（text，可选，用于跳转 project/task/handoff 等）
- `is_read`（bool）
- `read_at`（date，可选）

### 1.8 `ai_summaries`

- `target_user`（relation → users）
- `project`（relation → projects，可选）
- `date`（date）
- `content`（text，建议 Markdown）
- `risk_level`（select：`low`/`medium`/`high`）
- `model_used`（text）
- `input_snapshot`（json）

> 备注：`ai_threads/ai_messages` 属于“对话线程”扩展，本仓库当前实现以 `ai_summaries` 为主。

---

## 2. 状态机与关键动作（闭环）

### 2.1 员工执行（Employee）

- **开始任务**：`tasks.status: pending -> in_progress`（可写 `start_date`）
- **上报卡点**：`tasks.status -> blocked` + 写入 `blocker`
- **完成任务**：
  - 创建 `handoffs`（`status=pending`）
  - 更新 `tasks.status -> completed`（可写 `completed_at`）

### 2.2 经理审核（Manager）

- **通过交接**：`handoffs.status -> approved`，并创建下一条 `tasks`
- **驳回交接**：`handoffs.status -> rejected` + `review_note`

---

## 3. 前端关键交互

- **Kanban（看板）**：拖拽改变 `tasks.status`，列内排序更新 `sequence`
- **Timeline（时间轴）**：基于 `start_date/deadline/completed_at` 渲染甘特图
- **通知**：订阅 `notifications`（subscribe）或轮询兜底

---

## 4. 配置要点（与实现一致）

- **PocketBase 地址（前端）**：`VITE_PB_URL` > `localStorage.pb_url` > 运行时推导（HTTP 用 `host:8090`，HTTPS 用同域 `/pb`）
- **AI Key（前端）**：`localStorage.getItem('sf_api_key')`（也可在设置页配置）

更完整的代码级说明请看：`v2/docs/代码架构文档.md`
