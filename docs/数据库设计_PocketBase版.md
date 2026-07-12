# PocketBase 数据、权限与迁移

## 版本边界

- PocketBase Server：`0.22.21`
- PocketBase JS SDK：`0.21.5`
- 存储：SQLite + WAL

升级 PocketBase 需要单独验证迁移 API、JSVM Hook API、SDK、备份恢复和 APK，不随普通前端发布升级。

## 核心集合

| 集合 | 用途 | 关键关系 |
|---|---|---|
| `users` | 身份、角色、部门、职位、启用状态 | auth collection |
| `projects` | 项目、经理、成员、计划和进度 | manager/members -> users |
| `tasks` | 任务、负责人、状态、卡点、前置关系 | project/assignees |
| `handoffs` | 完成交接提案和一次性审批 | project/from_task/approved_task |
| `notifications` | 用户站内通知 | user |
| `audit_logs` | 业务变更和阅读确认 | project/task/operator |
| `comments` | 任务讨论 | project/step/author |
| `attachments` | 可选附件集合 | project/task/uploader |
| `progress_logs` | 项目进度记录 | project/user |
| `flower_logs` | 激励记录 | user |
| `device_tokens` | 原生推送设备 | user |
| `ai_summaries` | 管理分析结果 | target_user/project |
| `app_settings` | 服务端 Provider 配置与密钥 | updated_by |

## 权限摘要

- `users`：已登录启用用户可读取；公开注册只能创建启用 employee；admin 管理角色和停用。
- `projects`：admin/manager 或 manager/member 可见；创建/编辑只允许 admin/manager；永久删除锁定。
- `tasks`：只对项目参与者和负责人可见；employee 不能直接写状态、卡点、完成时间、负责人和日期；永久删除锁定。
- `handoffs`：参与者可见；创建人必须是来源任务负责人；直接更新/删除锁定，审批走事务路由。
- `notifications`：只能读取、已读或删除自己的记录；浏览器不能创建。
- `audit_logs`：参与项目的 manager/admin 可见；普通变更只能确认已阅，不能用审计状态回滚业务。
- `app_settings`：admin/manager 只经受保护路由读取脱敏配置；只有 admin 修改。

`user_auth_guard.pb.js` 额外保证：停用用户不能登录或 refresh；管理员不能自降权；至少保留一个启用 admin；有业务引用的账号不能永久删除。

## 本轮关键迁移

| 文件 | 作用 |
|---|---|
| `1783838000_add_user_department.js` | 补齐用户部门字段 |
| `1783841000_reconcile_ai_security.js` | AI 设置与权限 reconciliation |
| `1783841100_harden_production_rules.js` | 收紧用户、项目、任务、通知和业务集合规则 |
| `1783841200_fix_user_account_rules.js` | 注册和管理员 CRUD 规则；不改写既有账号启停状态 |
| `1783841300_backfill_project_members.js` | 把经理和任务负责人补入项目成员 |
| `1783841400_lock_transactional_workflows.js` | 锁住直接审批/删除和通用审计回滚入口 |

迁移是前向的。生产回滚使用发布前冷备，不通过可能覆盖环境规则的 down migration。

结构迁移不能推断业务数据语义，尤其不能把既有 `is_active=false` 批量改成 true。旧环境缺少启用状态时，应根据不入库的私有账号清单单独对账、逐项更新并保留冷备。

## 当前 Hook

| 文件 | 职责 |
|---|---|
| `task_workflow.pb.js` | 完成、卡点、解阻、审批、任务删除事务 |
| `user_auth_guard.pb.js` | 停用认证、管理员和删除保护 |
| `project_members_sync.pb.js` | 新任务负责人补入项目成员 |
| `project_progress_sync.pb.js` | 创建/更新/删除任务后重算项目进度 |
| `notifications_api.pb.js` | 服务端可信通知命令 |
| `llm_proxy.pb.js` | 通用 LLM 配置与代理 |
| `realtime.pb.js` | Realtime 扩展 |

## 维护与检查

停止服务并冷备后检查：

```bash
sqlite3 -readonly pb_data/data.db 'PRAGMA quick_check;'
sqlite3 -readonly pb_data/logs.db 'PRAGMA quick_check;'
```

`data.db` 不是 `ok` 时中止维护并恢复原服务。损坏的 `logs.db*` 可在冷备后隔离，让 PocketBase 重建；不得移动或删除 `data.db*` 和 `storage`。

生产账号同步不写 migration：真实姓名、用户名和初始密码属于私有部署数据，必须通过管理员界面或忽略的私有脚本幂等写入。

## 当前生产状态（2026-07-13）

- `1783841000` 至 `1783841400` 均已记录在生产 `_migrations`。
- 本文列出的 hooks 已部署并由 systemd 加载；未认证访问自定义路由返回 401，说明路由存在且鉴权生效。
- `data.db`、重建后的 `logs.db` 均通过 `PRAGMA quick_check`。
- 生产迁移历史与仓库早期历史存在分叉，后续只允许按 `_migrations` 差异增量发布，禁止整目录覆盖。
