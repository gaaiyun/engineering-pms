# PocketBase 数据库设计（v3.04）

> **PocketBase 版本**：0.22+  
> **集合数量**：11 个（含 v3.04 新增 `app_settings`）  
> **服务端 hooks**：5 个文件 / 8 个 handler  
> **迁移文件**：36 个，按时间顺序累积式应用

本文件是数据库结构的**单一可信来源**，与 `frontend/src/lib/api.ts` 类型定义、`backend/pb_migrations/*.js` 迁移脚本对齐。

> ✅ **首选**：运行 `scripts/database_rebuild.mjs` 一键重建（集合 + 字段 + 规则 + 示例数据一次到位）。
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
│  协作域 (3):    comments · notifications · device_tokens    │
│  AI 域   (2):   ai_summaries · app_settings (v3.04)         │
│  历史域 (1):    flower_logs · progress_logs                 │
├─────────────────────────────────────────────────────────────┤
│  服务端 hooks:                                              │
│    project_progress_sync.pb.js  (任务变 → 项目进度重算)     │
│    handoffs_status_sync.pb.js   (交接通过 → 上一节点完成)   │
│    audit_logs_reject_sync.pb.js (审核驳回 → 业务回滚)       │
│    llm_proxy.pb.js              (LLM API key 服务端代理)    │
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

**权限规则**：
- listRule / viewRule：`@request.auth.id != ""`
- createRule / updateRule / deleteRule：留空（仅 admin 后台操作）

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

**权限规则**：listRule = `@request.auth.id = user`（只能看自己）。

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

## 10. app_settings 集合（v3.04 新增 ⭐）

迁移：`1773000000_create_app_settings.js`。

**目的**：把 LLM API key 从 localStorage 搬到服务端（C1 修复）。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `key` | Text (unique) | ✅ | 例：`siliconflow_api_key` / `deepseek_api_key` |
| `value` | Text (max 5000) | ❌ | 实际 token，PB SQLite 文件级权限保护 |
| `description` | Text | ❌ | 说明 |
| `updated_by` | Relation → users | ❌ | 谁更新的 |

**权限规则**（最严）：
- listRule / viewRule：`admin || manager`
- createRule：`admin only`
- updateRule：`admin || manager`
- deleteRule：`admin only`

**客户端读不到 value** — 浏览器侧通过 PB SDK 查 app_settings 会被规则过滤；调用 LLM 时走 `POST /api/custom/llm-proxy`，由服务端注入 key。

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
  // 1. requireRecordAuth — 必须登录
  // 2. 读 app_settings.value (siliconflow_api_key 或 deepseek_api_key)
  // 3. $http.send 转发到 https://api.siliconflow.cn/v1/chat/completions
  // 4. 返回 LLM 响应（API key 全程留在服务端）
})
```

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

1. **新增字段**：在 `backend/pb_migrations/` 加 `<timestamp>_updated_<collection>.js`，遵守"累积式 + 不可逆"原则。
2. **修改规则**：同上，避免直接在 PB 后台改（重启迁移会回滚）。
3. **新加 hook**：放 `backend/pb_hooks/<name>.pb.js`，文件名末尾 `.pb.js` 是 PB 0.22+ 约定。
4. **更新本文档**：每次新增 collection / 字段 / hook 后同步本表（视为单一可信来源）。
