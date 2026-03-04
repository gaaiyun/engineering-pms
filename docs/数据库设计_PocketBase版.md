# PocketBase 数据库设计指南（v2 手动对照版）

> **PocketBase 版本**：0.26.3（与本项目 `frontend/src/lib/api.ts` 类型定义对齐）

本指南用于你想**手动点 PocketBase 后台建库/核对字段**时使用。

> ✅ 更推荐：直接运行 `v2/scripts/database_rebuild.mjs` 一键重建（集合/字段/规则/示例数据一次到位）。  
> 入口文档：`v2/docs/快速启动_命令行版.md`

## 0. 打开 PocketBase 管理后台

- **本地**：`http://127.0.0.1:8090/_/`
- **服务器（HTTP）**：`http://<YOUR_PB_HOST>:8090/_/`
- **服务器（HTTPS）**：建议先配置同域 `/pb` 反代（见 `v2/docs/宝塔部署操作手册.md`），再使用 `https://<YOUR_DOMAIN>/pb/_/`

> 安全提醒：不要把 PocketBase 管理员账号/密码、AI Key 写进仓库文件（.md/.bat/.js）。

---

## 1. Users 集合（系统自带）

PocketBase 自带一个认证用户表，ID 为 `_pb_users_auth_`，我们只**用它，不改结构**，因为我们的前端只用到了：

- `id`: 用户ID
- `username`: 登录名（例如 `zhang_doc`）
- `name`: 展示名（例如 `张资料员`）
- `email`: 邮箱（可空）
- `avatar`: 头像（可空）
- `role`: **(新增)** Select(values: `admin`, `manager`, `employee`)，默认为 `employee`。用于控制 App 内的权限视图。
- （可选但推荐）`department`: Select（如：工程部/审计部/财务部/管理层/设计院/监理部/安监部）
- （可选）`position`: Text（岗位）
- （可选）`flower_count`: Number（小红花累计）

> 说明：角色、部门、小红花统计等高级信息，后面可以追加字段；当前版本先聚焦“进展录入 + 查看 + 基础排行榜”。

你只需要**在 users 里创建几条记录**（用来登录 App），创建方式我已经在和你对话时详细说过，这里不再重复。

---

## 2. Projects 集合（项目表）

### 2.1 在后台创建集合

1. 左侧点击 **`+ New collection`**。
2. `Name` 填：`projects`；`Type` 保持 `Base`；点击 **Create**。

### 2.2 字段设计（逐个添加 Field）

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `name` | Text | ✅ | 项目名称，如“XX道路结算项目” |
| `status` | Select(values: `active`,`completed`,`archived`) | ✅ | 项目状态：进行中/已完成/归档 |
| `progress` | Number (0-100) | ❌ | 整体进度百分比，整数 |
| `description` | Text | ❌ | 项目说明 |
| `manager` | Relation → `users` | ❌ | 项目负责人（资料员/项目经理） |
| `members` | Relation → `users`（可多选） | ❌ | 项目成员（用于权限过滤与通知） |
| `start_date` | Date | ❌ | 项目开始日期 |
| `deadline` | Date | ❌ | 项目截止日期 |
| `total_tasks` | Number | ❌ | 任务总数（统计用） |
| `completed_tasks` | Number | ❌ | 已完成任务数（统计用） |

> 操作提示：在 Projects 集合页面的 `Fields` 区，反复点 `Add field`，用上表里的字段名和类型配置即可。

### 2.3 建议的权限（Rules）

在 `Settings` → `Rules` 中设置：

- **List rule**: `@request.auth.id != ""`  （登录用户都能看到项目列表）
- **View rule**: `@request.auth.id != ""`
- **Create / Update / Delete rule**: 先留空（允许任何已登录用户操作，后续再按角色细分）。

---

## 3. Tasks 集合（任务 / 进展表）

### 3.1 创建集合

1. 再次点击 **`+ New collection`**。
2. `Name` 填：`tasks`；`Type` 选 `Base`；点击 **Create**。

### 3.2 字段设计

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `project` | Relation → `projects`，maxSelect=1 | ✅ | 所属项目 |
| `stage_name` | Text | ✅ | 流程节点名称，如“图纸审核”、“材料送检” |
| `description` | Text（多行） | ❌ | 执行要求/交付标准 |
| `status` | Select(values: `pending`,`in_progress`,`blocked`,`completed`,`overdue`) | ✅ | 任务状态：待办/进行中/卡点/已完成/已逾期 |
| `assignees` | Relation → `users`（可多选） | ❌ | 执行人 |
| `created_by` | Relation → `users`，maxSelect=1 | ❌ | 创建人（通常是经理/管理员） |
| `start_date` | Date | ❌ | 计划开始时间（甘特图/时间轴使用） |
| `deadline` | Date | ❌ | 截止时间 |
| `completed_at` | Date | ❌ | 实际完成时间 |
| `sequence` | Number | ❌ | 看板排序权重（默认 1000/2000/...） |
| `priority` | Select(values: `low`,`normal`,`high`) | ❌ | 优先级 |
| `is_milestone` | Bool | ❌ | 是否里程碑 |
| `blocker` | JSON | ❌ | 卡点详情（仅 status=blocked 时有值），结构：`{ reason_type, reason_detail, need_help_from[], expected_resolve }` |
| `predecessor_tasks` | Relation → `tasks`（可多选） | ❌ | 前置任务（交接通过后自动关联） |
| `next_assignees` | Relation → `users`（可多选） | ❌ | 下一步执行人（备用） |
| `completed_steps` | Text（多行） | ❌ | 已完成步骤，一行一条（前端会自动分行展示） |
| `next_steps` | Text（多行） | ❌ | 下一步任务，一行一条 |

> 说明：`completed_steps` 和 `next_steps` 在前端会用 `\n` 分行来转换成列表，方便你在手机上阅读。

### 3.3 建议的权限

- **List / View rule**: `@request.auth.id != ""`（登录即可看，后续可以细分到“仅参与项目的人可见”）。
- **Create / Update rule**: `@request.auth.id != ""`。

---

## 4. Handoffs 集合（交接提案，闭环核心）

> 说明：员工“完成任务”时**必须提交交接提案**；经理在“审核中心”通过后，系统会创建下一步任务。

建议字段：

- `project` (relation → projects, maxSelect=1)
- `from_task` (relation → tasks, maxSelect=1)
- `proposed_title` (text)
- `proposed_description` (text)
- `proposed_assignees` (relation → users, 多选)
- `proposed_start_date` (date，可选)
- `proposed_due_date` (date)
- `status` (select: `pending`/`approved`/`rejected`)
- `submitter` (relation → users, maxSelect=1)
- `reviewer` (relation → users, maxSelect=1)
- `review_note` (text)
- `approved_task` (relation → tasks, maxSelect=1)

---

## 5. Audit Logs 集合（审计日志）

- `project` (relation → projects)
- `task` (relation → tasks)
- `action_type` (text，例如：`create`/`update`/`status_change`/`handoff`/`blocker`)
- `operator` (relation → users)
- `before_data` (json)
- `after_data` (json)
- `note` (text，可选)
- `review_status` (select: `unread`/`read`/`approved`，可选，用于审核中心)
- `reviewed_by` (relation → users, maxSelect=1，可选)

---

## 5.5 Comments 集合（任务评论）

- `project` (relation → projects, maxSelect=1，可选)
- `step` (relation → tasks, maxSelect=1，关联任务 ID)
- `author` (relation → users, maxSelect=1)
- `content` (text)
- `mentions` (relation → users，可多选，可选)

> 说明：`step` 字段关联到任务，前端通过 `filter: step="${taskId}"` 查询某任务的评论。

---

## 6. Notifications 集合（站内通知）

- `user` (relation → users)
- `title` (text)
- `content` (text，可选)
- `type` (select，例如：`task_assigned`/`handoff_pending`/`blocker_reported`/`deadline_warning`/`system`)
- `is_read` (bool)
- `read_at` (date，可选)
- `link_type` / `link_id` (text，可选：用于跳转 project/task/handoff 等)

> 建议规则：List/View 只允许本人：`@request.auth.id = user`

---

## 7. AI Summaries 集合（AI 简报）

- `target_user` (relation → users, maxSelect=1)
- `project` (relation → projects, 可选)
- `date` (date)
- `content` (text, 建议存 Markdown)
- `risk_level` (select: `low`/`medium`/`high`)
- `model_used` (text)
- `input_snapshot` (json)

---

## 8. 初始化示例数据（手动模式）

> 如果你已经运行了 `v2/scripts/database_rebuild.mjs`，这里可以跳过。  
> 下面是“手动点后台”的示例，保证你一登录就能看到内容。

### 5.1 用户示例（users 集合）

手动在 `users` 里新增 3 条记录：

1. **张资料员（类似管理者）**
   - `username`: `zhang_doc`
   - `password`: `12345678`
   - `passwordConfirm`: `12345678`
   - `name`: `张资料员`

2. **李审计**
   - `username`: `li_audit`
   - `password`: `12345678`
   - `name`: `李审计`

3. **王工程师**
   - `username`: `wang_eng`
   - `password`: `12345678`
   - `name`: `王工程师`

> 前端登录建议使用：`zhang_doc / 12345678`。

### 5.2 项目示例（projects 集合）

1. **XX道路结算项目**
   - `name`: `XX道路结算项目`
   - `status`: `active`
   - `progress`: `65`
   - `description`: `城市主干道改造工程结算`
   - `manager`: 选择 `zhang_doc`

2. **YY桥梁结算项目**
   - `name`: `YY桥梁结算项目`
   - `status`: `active`
   - `progress`: `30`
   - `description`: `跨江大桥施工结算`
   - `manager`: 选择 `wang_eng`

### 5.3 任务示例（tasks 集合）

1. **图纸审核（进行中）**
   - `project`: 选择 `XX道路结算项目`
   - `stage_name`: `图纸审核`
   - `start_date`: 选一个过去日期（可选但建议）
   - `completed_steps`（多行文本）：
     ```
     已收集全部施工图纸
     完成工程量核算
     ```
   - `next_steps`：
     ```
     审计部门核对工程量清单
     提交初审材料至审计部门
     ```
   - `deadline`: 选一个未来日期
   - `status`: `in_progress`
   - `assignees`: 选择 `li_audit`
   - `sequence`: `1000`（可选）

2. **材料送检（已逾期）**
   - `project`: 选择 `YY桥梁结算项目`
   - `stage_name`: `材料送检`
   - `completed_steps`：
     ```
     完成取样
     ```
   - `next_steps`：
     ```
     送检实验室
     等待检验报告
     ```
   - `deadline`: 选一个已经过去的日期
   - `status`: `overdue`
   - `assignees`: 选择 `wang_eng`
   - `sequence`: `2000`（可选）

这样配置完之后：
- 你在手机/浏览器前端用 `zhang_doc / 12345678` 登录，
- “工作进展”页面就会自动拉取 `tasks` + `projects`，看到和需求文档接近的效果。

---

## 10. 与前端字段的对应关系

为了防止以后忘记，这里再列一遍 **接口字段 ↔ 前端展示**：

- `projects.name` → 任务卡片顶部的“项目名称”。
- `tasks.stage_name` → 卡片中的“流程节点”。
- `tasks.completed_steps` → 详情中“已完成步骤”列表。
- `tasks.next_steps` → 详情中“下一步任务”列表。
- `tasks.deadline` → “截止日期”。
- `tasks.status` → 状态 Tag（待办 / 进行中 / 卡点 / 已完成 / 已逾期）。
- `tasks.assignees` → “下一步执行人”。
- `tasks.sequence` → 看板/列表排序权重。
- `tasks.blocker` → 卡点详情（status=blocked 时展示 reason_type、reason_detail、need_help_from、expected_resolve）。

> 说明：`tasks.score` 与 `tasks.approved` 不在当前 api.ts 的 Task 接口中。任务“审核通过”通过 handoffs 的 `status=approved` 与 `approved_task` 体现。

这份文档与 `frontend/src/lib/api.ts` 类型定义已对齐，只要照着一步步做，数据库就是**完备、可用、符合需求文档**的。

