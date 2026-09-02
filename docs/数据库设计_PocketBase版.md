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
| `service_accounts` | Agent 服务身份、scope、有效期和项目范围 | owner/allowed_projects |
| `agent_operations` | Agent 幂等执行、预览确认和结果记录 | service_account |

## 权限摘要

- `users`：关闭公开注册；已登录、启用且完成首次改密的用户可读取，admin 管理角色、启停和密码重置。
- `projects`：admin/manager 或 manager/member 可见；创建/编辑只允许 admin/manager；永久删除锁定。
- `tasks`：只对项目参与者和负责人可见；employee 不能直接写状态、卡点、完成时间、负责人和日期；永久删除锁定。
- `handoffs`：参与者可见；创建人必须是来源任务负责人；直接更新/删除锁定，审批走事务路由。
- `notifications`：只能读取、已读或删除自己的记录；浏览器不能创建。
- `audit_logs`：参与项目的 manager/admin 可见；普通变更只能确认已阅，不能用审计状态回滚业务。
- `app_settings`：admin/manager 只经受保护路由读取脱敏配置；只有 admin 修改。
- `service_accounts` / `agent_operations`：集合 API rule 全部关闭，只允许受控 Agent 路由访问；服务账号还受 scope、有效期、所有者状态和项目范围限制。

`user_auth_guard.pb.js` 额外保证：停用用户不能登录或 refresh；首次登录和管理员重置后必须先改密；管理员不能自降权；至少保留一个启用 admin；有业务引用的账号不能永久删除。

人员重配通过 Agent 受控路由完成：`people_manage` 仅授予全项目、已完成改密的 admin 服务账号，允许创建/修改/停用 employee 或 manager。删除前必须停用并执行全集合引用检查；任何项目、任务、交接、评论、通知、附件或审计引用都会阻止永久删除。服务端返回删除影响预检，避免前端把历史责任人直接删掉。

## 本轮关键迁移

| 文件 | 作用 |
|---|---|
| `1783838000_add_user_department.js` | 补齐用户部门字段 |
| `1783841000_reconcile_ai_security.js` | AI 设置与权限 reconciliation |
| `1783841100_harden_production_rules.js` | 收紧用户、项目、任务、通知和业务集合规则 |
| `1783841200_fix_user_account_rules.js` | 注册和管理员 CRUD 规则；不改写既有账号启停状态 |
| `1788336000_enable_people_management.js` | 增加“综合部”和受控 `people_manage` scope，不改写业务数据 |
| `1783841300_backfill_project_members.js` | 把经理和任务负责人补入项目成员 |
| `1783841400_lock_transactional_workflows.js` | 锁住直接审批/删除和通用审计回滚入口 |
| `1787190000_require_managed_accounts.js` | 关闭公开注册，加入首次登录/重置后强制改密，并在改密前锁住业务访问 |
| `1787190100_create_agent_access.js` | 创建 Agent 服务账号和幂等操作集合，扩展 Agent 审计字段 |

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
| `agent_api.pb.js` | Agent 服务账号签发、受 scope 约束的查询/命令、一次性确认与审计 |

## 维护与检查

停止服务并冷备后检查：

```bash
sqlite3 -readonly pb_data/data.db 'PRAGMA quick_check;'
sqlite3 -readonly pb_data/logs.db 'PRAGMA quick_check;'
```

`data.db` 不是 `ok` 时中止维护并恢复原服务。损坏的 `logs.db*` 可在冷备后隔离，让 PocketBase 重建；不得移动或删除 `data.db*` 和 `storage`。

生产账号同步不写 migration：真实姓名、用户名和初始密码属于私有部署数据，必须通过管理员界面或忽略的私有脚本幂等写入。

## 生产状态（2026-08-20）

- 提交 `c4c298f` 已于 2026-08-20 06:45 CST 部署；发布前备份的精确路径记录于私有运维接力文档。
- `data.db` 和 `logs.db` 通过 `PRAGMA quick_check`；生产 Realtime SSE 返回 200。
- 生产 `agent_api.pb.js` SHA-256 为 `ccd32069f3d35d8d388719c55cf3bec207ff3d307c731f425358288746ea0dad`。
- 生产 `user_auth_guard.pb.js` SHA-256 为 `7093d50869446d783e7f9a94f3aaa85a5e344c05c317e2e5ac4de136b73afd7a`。
- 生产迁移历史与仓库早期历史存在分叉，后续只允许按 `_migrations` 差异增量发布，禁止整目录覆盖。
