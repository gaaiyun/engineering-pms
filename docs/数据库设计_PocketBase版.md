# PocketBase 数据库设计（v3.04）

> **生产 PocketBase 版本**：0.22.21
> **生产当前集合**：12 个；本分支目标结构增加 `app_settings` 后为 13 个
> **仓库 hooks**：6 个，其中只有经过生产副本测试的 `llm_proxy`、`notifications_api` 可进入本轮上线清单
> **迁移文件数量会持续变化**，部署必须按文件和 schema 对账，不能按数量或整目录覆盖

本文记录目标结构。生产运行态事实必须以服务器的 `_collections`、`_migrations`、当前 rules 和 PocketBase 版本为准。生产与本地历史已经分叉，禁止把整个 `backend/pb_migrations` 上传生产或执行 `history-sync`。

> `scripts/database_rebuild.mjs` 只允许用于全新本地库或隔离测试库，会重建集合和演示数据，严禁连接生产库。
>
> 入口文档：[快速启动](./用户使用指南.md) · [部署](./宝塔部署操作手册.md)

---

## 0. 总览

```
┌─────────────────────────────────────────────────────────────┐
│                  PocketBase (SQLite + JS hooks)             │
├─────────────────────────────────────────────────────────────┤
│  核心域 (5):    users · projects · tasks · handoffs ·       │
│                 audit_logs                                  │
│  协作域 (4):    comments · attachments · notifications ·     │
│                 device_tokens                                │
│  AI 域   (2):   ai_summaries · app_settings (v3.04)         │
│  历史域 (1):    flower_logs · progress_logs                 │
├─────────────────────────────────────────────────────────────┤
│  服务端 hooks:                                              │
│    project_progress_sync.pb.js  (任务变 → 项目进度重算)     │
│    handoffs_status_sync.pb.js   (交接通过 → 上一节点完成)   │
│    audit_logs_reject_sync.pb.js (审核驳回 → 业务回滚)       │
│    llm_proxy.pb.js              (LLM 服务端代理)            │
│    notifications_api.pb.js      (可信通知创建命令)          │
│    realtime.pb.js               (SSE 长连接元信息)          │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. users 集合（PB 自带认证表）

集合 ID：`_pb_users_auth_`，结构在 `1764072041_updated_users.js` 起多次扩展。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | Text (15位) | ✅ | PB 自动生成 |
| `username` | Text | ✅ | 登录名，例：`zhang_manager` |
| `name` | Text | ✅ | 展示名，例：`张经理` |
| `email` | Email | ❌ | 可空 |
| `avatar` | File | ❌ | 头像 |
| **`role`** | Select(`admin`,`manager`,`employee`) | ✅ | 权限角色，**v2.0 起新增** |
| `department` | Select | ❌ | 工程部 / 审计部 / 财务部 / 管理层 / 设计院 / 监理部 / 安监部 |
| `position` | Text | ❌ | 岗位 |
| `flower_count` | Number | ❌ | 小红花累计 |

**目标权限规则**：
- listRule / viewRule：登录用户可读取协作所需的用户基础资料。
- createRule：公开注册只能提交 `role=employee`。
- updateRule：本人可改密码和普通资料，但不可提交 `role`、`is_active`、`flower_count`；admin 可管理。
- deleteRule：admin only。

---

## 2. projects 集合

迁移：`1763750287_created_projects.js` + 多次 update。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | Text | ✅ | 项目名称 |
| `status` | Select(`active`,`completed`,`archived`) | ✅ | 项目状态 |
| `progress` | Number(0-100) | ❌ | **由 hook 自动重算** ¹ |
| `description` | Text | ❌ | 项目说明 |
| `manager` | Relation → users | ❌ | 负责人 |
| `members` | Relation → users (多选) | ❌ | 项目成员（影响 task 列表权限） |
| `start_date` | Date | ❌ | 开始 |
| `deadline` | Date | ❌ | 截止 |
| `total_tasks` | Number | ❌ | **由 hook 自动重算** ¹ |
| `completed_tasks` | Number | ❌ | **由 hook 自动重算** ¹ |

¹ `project_progress_sync.pb.js` 在 task create/update/delete 时自动重算这三个字段。

**权限规则**：
- list / view：`@request.auth.id != ""`
- create / update / delete：`@request.auth.role = "admin" || @request.auth.role = "manager"`

---

## 3. tasks 集合（业务核心）

迁移：`1763750287_created_tasks.js` → `1770000000_updated_tasks_v2_schema.js`（v2 大改）→ 后续多次。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project` | Relation → projects | ✅ | 所属项目 |
| `stage_name` | Text | ✅ | 节点名称（"图纸审核"等） |
| `description` | Text | ❌ | 执行要求 |
| `status` | Select(`pending`,`in_progress`,`blocked`,`completed`,`overdue`) | ✅ | 任务状态（看板分列） |
| `assignees` | Relation → users (多选) | ❌ | 执行人 |
| `created_by` | Relation → users | ❌ | 创建人 |
| `start_date` | Date | ❌ | 计划开始 |
| `deadline` | Date | ❌ | 截止 |
| `completed_at` | Date | ❌ | 实际完成时间 |
| `sequence` | Number | ❌ | 看板内排序（1000/2000…） |
| `priority` | Select(`low`,`normal`,`high`) | ❌ | 优先级 |
| `is_milestone` | Bool | ❌ | 里程碑标记 |
| `blocker` | JSON | ❌ | 卡点详情：`{reason_type, reason_detail, need_help_from[], expected_resolve}` |
| `predecessor_tasks` | Relation → tasks (多选) | ❌ | 前置任务（交接通过自动关联） |
| `completed_steps` | Text(多行) | ❌ | 已完成步骤（前端按 `\n` 拆分） |
| `next_steps` | Text(多行) | ❌ | 下一步任务 |

**权限规则**（v2.3 收紧）：
- listRule：`@request.auth.id = created_by || @request.auth.id ?= assignees.id || @request.auth.id ?= project.members.id || @request.auth.id = project.manager || @request.auth.role = "admin"`
- viewRule：同上
- create / update：`@request.auth.role != "employee"`（除非自己是 assignee）
- delete：`@request.auth.role = "admin" || @request.auth.role = "manager"`

---

## 4. handoffs 集合（任务交接闭环）

迁移：`1770000001_created_handoffs.js` → `1772800000_tighten_handoffs_rules_and_audit_create.js`。

| 字段 | 类型 | 说明 |
|------|------|------|
| `project` | Relation → projects | 所属项目 |
| `from_task` | Relation → tasks | 上一节点任务 |
| `proposed_title` | Text | 拟下一节点名 |
| `proposed_description` | Text | 拟描述 |
| `proposed_assignees` | Relation → users (多选) | 拟执行人 |
| `proposed_start_date` | Date | 拟开始 |
| `proposed_due_date` | Date | 拟截止 |
| `status` | Select(`pending`,`approved`,`rejected`) | 交接状态 |
| `submitter` | Relation → users | 提交人（员工） |
| `reviewer` | Relation → users | 审核人（经理） |
| `review_note` | Text | 审核备注 |
| `approved_task` | Relation → tasks | 通过后自动生成的新任务 |

**Hook 联动**：`handoffs_status_sync.pb.js` 监听 status → approved 时，把 `from_task.status` 同步为 completed。

---

## 5. audit_logs 集合（审计中心数据源）

迁移：`1770000003_created_audit_logs.js` → `1772400000_audit_logs_rejected_and_reject_note.js`。

| 字段 | 类型 | 说明 |
|------|------|------|
| `project` | Relation → projects | 所属项目 |
| `task` | Relation → tasks | 关联任务（可空） |
| `action_type` | Text | `create` / `update` / `status_change` / `handoff` / `blocker` |
| `operator` | Relation → users | 操作人 |
| `before_data` | JSON | 变更前快照 |
| `after_data` | JSON | 变更后快照 |
| `note` | Text | 备注 |
| `review_status` | Select(`unread`,`read`,`approved`,`rejected`) | 复核状态 |
| `reviewed_by` | Relation → users | 复核人 |
| `reject_note` | Text | 驳回理由 |

**Hook 联动**：`audit_logs_reject_sync.pb.js` 监听 review_status → rejected 时，将关联 task 的字段回滚到 `before_data`。

---

## 6. comments 集合（任务评论）

| 字段 | 类型 | 说明 |
|------|------|------|
| `project` | Relation → projects | 可选 |
| `step` | Relation → tasks | 关联任务 ID（前端 `filter: step="${taskId}"`） |
| `author` | Relation → users | 作者 |
| `content` | Text | 评论正文 |
| `mentions` | Relation → users (多选) | @ 提到的人 |

---

## 6.1 attachments 集合（生产已有）

| 字段 | 类型 | 说明 |
|------|------|------|
| `project` | Relation → projects | 可选项目 |
| `step` | Relation → tasks | 可选任务 |
| `uploader` | Relation → users | 上传者 |
| `file` | File | 附件 |
| `file_type` | Text | 文件类型 |
| `remark` | Text | 备注 |

目标规则要求上传者是本人，且操作者必须是关联项目参与者或关联任务执行人；更新不可更换 uploader。

---

## 7. notifications 集合（站内通知）

迁移：`1766421091_created_notifications.js` → `1772600000_expand_notifications_type_values.js`。

| 字段 | 类型 | 说明 |
|------|------|------|
| `user` | Relation → users | 接收人 |
| `title` | Text | 标题 |
| `content` | Text | 正文 |
| `type` | Select | `task_assigned` / `handoff_pending` / `blocker_reported` / `deadline_warning` / `audit_rejected` / `system` / 其余 |
| `is_read` | Bool | 是否已读 |
| `read_at` | Date | 已读时间 |
| `link_type` / `link_id` | Text | 跳转 project/task/handoff |

**目标权限规则**：list/view/update/delete 只能操作自己的通知；普通 REST create 关闭。业务通知统一调用 `POST /api/custom/notifications/send`，服务端验证操作者、项目、任务和接收人关系后创建。

**v3.0+ Android 推送**：通过 `realtime.pb.js` 的 SSE 推送 + 客户端 `useNotificationAlerts` hook 触发 Toast / 振动 / 三音调 / 红闪。

---

## 8. device_tokens 集合（v2.95+ 推送注册）

迁移：`1772700000_create_device_tokens.js`。

| 字段 | 类型 | 说明 |
|------|------|------|
| `user` | Relation → users | 拥有者 |
| `token` | Text | FCM token（或预留字段，v3.0 已不依赖 FCM） |
| `platform` | Select(`android`,`ios`,`web`) | 平台 |
| `device_info` | Text | 型号/版本 |

> v3.0 起，Android 推送改为 PB Realtime SSE + 原生 ForegroundService，本表保留兼容历史数据。

---

## 9. ai_summaries 集合

| 字段 | 类型 | 说明 |
|------|------|------|
| `target_user` | Relation → users | 简报对象 |
| `project` | Relation → projects | 可选 |
| `date` | Date | 简报日期 |
| `content` | Text (Markdown) | LLM 生成内容 |
| `risk_level` | Select(`low`,`medium`,`high`) | 风险等级 |
| `model_used` | Text | `deepseek-chat` / `siliconflow:Qwen3` 等 |
| `input_snapshot` | JSON | 当时塞给 LLM 的上下文 |

---

## 10. app_settings 集合（本分支生产 reconciliation 新增）

生产 reconciliation：`1783841000_reconcile_ai_security.js`。旧本地 migration 只属于本地历史，不能直接用于线上分叉数据库。

**目的**：把 LLM API key 从 localStorage 搬到服务端（C1 修复）。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `key` | Text (unique) | ✅ | 例：`siliconflow_api_key` / `deepseek_api_key` |
| `value` | Text (max 5000) | ❌ | 实际 token，PB SQLite 文件级权限保护 |
| `description` | Text | ❌ | 说明 |
| `updated_by` | Relation → users | ❌ | 谁更新的 |

**权限规则**：list/view/create/update/delete 全部锁定为 superuser-only。admin/manager 浏览器也不能读取 `value`；LLM Hook 通过服务端 DAO 读取。

调用 LLM 时走 `POST /api/custom/llm-proxy`：匿名返回 401，employee 返回 403，仅 admin/manager 可调用；Hook 还限制模型、消息数量、总字符和 max tokens，并对上游错误脱敏。

---

## 11. flower_logs / progress_logs（历史记录）

| 集合 | 字段要点 | 用途 |
|------|----------|------|
| `flower_logs` | `from_user`, `to_user`, `amount`, `reason`, `project`, `task` | 小红花赠送记录（员工激励） |
| `progress_logs` | `task`, `operator`, `before_status`, `after_status`, `note` | 任务状态变更历史，用于审计追溯 |

---

## 服务端 Hooks 详解

### project_progress_sync.pb.js（I9 兜底，v3 版本）

```js
onRecordAfterCreateRequest('tasks', ...)   // 任务创建 → 项目 total_tasks++
onRecordAfterUpdateRequest('tasks', ...)   // 状态变 completed → completed_tasks++
onRecordAfterDeleteRequest('tasks', ...)   // 任务删除 → total/completed 重算
```

关键：函数体在每个 onRecord 回调内**内联展开**（PB JS sandbox 不共享外层作用域）。limit=10000（不能是 0）。

### handoffs_status_sync.pb.js（交接闭环兜底）

```js
onRecordBeforeCreateRequest('handoffs', ...)   // 校验 submitter/proposed_*
onRecordAfterUpdateRequest('handoffs', ...)    // status=approved → from_task.status=completed
```

### audit_logs_reject_sync.pb.js（审核驳回回滚）

```js
onRecordAfterCreateRequest('audit_logs', ...)  // 驳回审计入库
onRecordAfterUpdateRequest('audit_logs', ...)  // review_status=rejected → 任务回滚 before_data
```

### llm_proxy.pb.js（C1 安全代理）

```js
routerAdd('POST', '/api/custom/llm-proxy', (c) => {
  // 1. requireRecordAuth + admin/manager role
  // 2. 读 app_settings.value (siliconflow_api_key 或 deepseek_api_key)
  // 3. $http.send 转发到 https://api.siliconflow.cn/v1/chat/completions
  // 4. 返回 LLM 响应（API key 全程留在服务端）
})
```

### notifications_api.pb.js（可信通知命令）

`POST /api/custom/notifications/send` 接收单条通知意图。服务端根据 `link_type/link_id` 加载项目或任务，只允许项目参与者给同项目成员、负责人或任务执行人发送通知。普通客户端不能直接创建 `notifications` record。

### realtime.pb.js（PR 2 推送基础）

PB Realtime SSE 元信息钩子，配合 Android 原生 OkHttp SSE + ForegroundService 实现"关掉 App 仍能收到通知"。

---

## 与前端字段对应（速查）

| API 字段 | 前端展示位置 |
|----------|--------------|
| `projects.name` | 任务卡片顶部 |
| `projects.progress` | 进度条（自动重算） |
| `tasks.stage_name` | 卡片"流程节点" |
| `tasks.status` | 状态 Tag |
| `tasks.completed_steps` | 详情"已完成步骤"列表 |
| `tasks.next_steps` | 详情"下一步任务"列表 |
| `tasks.blocker` | 卡点详情（仅 status=blocked） |
| `tasks.assignees` | "下一步执行人" |
| `handoffs.status=pending` | 审核中心"待审核交接" |
| `audit_logs.review_status=unread` | 审核中心徽标 |
| `notifications.is_read=false` | 顶栏红点 + Android 推送 |

---

## 维护建议

1. **新增字段**：在 `backend/pb_migrations/` 加 `<timestamp>_updated_<collection>.js`。生产 reconciliation 必须按 collection name 查找，禁止依赖本地 collection ID。
2. **修改规则**：同上，避免直接在 PB 后台改（重启迁移会回滚）。
3. **新加 hook**：先在精确生产 `data.db` 副本和同版本 0.22.21 上测试，再逐文件上线。Request hooks 不会覆盖 DAO 内部写入，不能把未经验证的 hook 当数据库不变量。
4. **更新本文档**：每次新增 collection / 字段 / hook 后同步本表（视为单一可信来源）。
