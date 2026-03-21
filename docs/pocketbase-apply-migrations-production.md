# 生产环境 PocketBase 迁移（127.0.0.1 等）

无法在本地代你登录服务器执行命令；按下列方式之一操作即可，与仓库中 **`1772400000`**、**`1772500000`**、**`1772600000`**、**`1772700000`** 迁移**效果一致**。

参考官方说明：[Migrations - PocketBase](https://pocketbase.io/docs/js-migrations/)（`pb_migrations` 下未应用的迁移会在 **`serve` 时自动在事务中执行**，也可手动执行 **`migrate up`**）。

---

## 方式一：部署迁移文件（推荐）

### 1. 将迁移文件拷到服务器的 `pb_migrations` 目录

来源（本仓库）：

- [`backend/pb_migrations/1772400000_audit_logs_rejected_and_reject_note.js`](../backend/pb_migrations/1772400000_audit_logs_rejected_and_reject_note.js)
- [`backend/pb_migrations/1772500000_add_audit_rejected_notification_type.js`](../backend/pb_migrations/1772500000_add_audit_rejected_notification_type.js)
- [`backend/pb_migrations/1772600000_expand_notifications_type_values.js`](../backend/pb_migrations/1772600000_expand_notifications_type_values.js)
- [`backend/pb_migrations/1772700000_create_device_tokens.js`](../backend/pb_migrations/1772700000_create_device_tokens.js)

目标：与 `pocketbase` 可执行文件同级或你实际配置的 **`--migrationsDir`** 下的 `pb_migrations`。

> 若服务器上 `pb_migrations` 已存在**同名时间戳文件**，需先确认内容是否一致，避免重复或冲突。

### 2. 应用迁移并刷新进程

在服务器上 PocketBase 所在目录执行（路径按你宝塔/实际安装调整）：

```bash
# 仅执行未应用的迁移（官方 CLI）
./pocketbase migrate up
```

然后**重启** PocketBase 服务（宝塔 Supervisior / systemd / 面板里重启均可）。

> 文档说明：若手动 `migrate up`，**需要重启 `serve`**，以便内存里的集合配置与数据库一致。

若你平常用「直接启动 `./pocketbase serve`」且**未单独改过迁移目录**，也可：**放好文件 → 重启一次 `serve`**，启动时会自动跑未执行迁移。

### 3. 验证

- 管理后台 → **Collections** → `audit_logs`  
  - 字段 `review_status`（select）选项含 **`rejected`**  
  - 存在可选文本字段 **`reject_note`**
- **Collections** → `notifications`  
  - 字段 `type`（select）至少包含 **`task_update`**、**`task_assigned`**、**`progress_update`**、**`blocker_reported`**、**`task_rollback`**、**`audit_rejected`**
- **Collections** → `device_tokens`
  - 已存在 `user`、`platform`、`device_id`、`token`、`is_active`、`last_seen_at`

可在 **Settings → Logs** 看迁移是否报错。

---

## 方式二：管理后台手动改 Schema（与上述迁移等价）

若暂时不能拷贝迁移文件，可在 **`http://127.0.0.1:8090/_/`**（或你的 Admin 地址）手动修改。

### A. 集合 `audit_logs`

**review_status**

- 编辑字段，在选项中加入：`rejected`（保留原有 `unread`、`read`、`approved`）。

**reject_note（若还没有）**

- Add field → **Plain text**  
- Name: `reject_note`  
- Required: **否**

保存集合。

> 若经理无法「拒绝」审计记录，请确认 **`audit_logs` 的 Update API 规则** 仍为经理可写，与仓库迁移 [`1772200000_fix_audit_logs_update_rule.js`](../backend/pb_migrations/1772200000_fix_audit_logs_update_rule.js) 一致：  
> `@request.auth.role = "admin" || @request.auth.role = "manager"`

### B. 集合 `notifications`

**type**

- 编辑 `type`（select），确保至少包含以下值：  
  `task`、`task_update`、`task_assigned`、`task_rollback`、`step_updated`、`handoff`、`handoff_pending`、`handoff_result`、`blocker`、`blocker_reported`、`project_update`、`deadline_warning`、`overdue`、`flower`、`comment_mention`、`escalation`、`progress_update`、`audit_rejected`、`system`
- 保存（避免任务分配、进度更新、回退任务、审核拒绝等通知在服务端校验失败）。

---

## 迁移对应的业务含义

| 迁移 | 作用 |
|------|------|
| `1772400000` | 审核中心可将记录标为 **已拒绝**并写入 **拒绝原因**；否则接口会校验失败或英文错误。 |
| `1772500000` | 拒绝后给操作人发的通知使用 `audit_rejected`，枚举不含该值时 **notifications 创建会失败**。 |
| `1772600000` | 将 `notifications.type` 扩展到当前前端实际写入的全部通知类型，避免任务分配、进度更新、卡点回退等场景继续静默失败。 |
| `1772700000` | 新建设备 token 集合，为二期后台真推送的客户端注册链路提供存储基础。 |

---

## 常见问题

1. **执行迁移后前台仍报错**  
   浏览器强刷、确认前端已部署新版本；PocketBase 已重启。

2. **不确定迁移是否已执行**  
   管理后台或直连 SQLite 查看内置表 **`_migrations`** 中是否已有上述文件名（需有服务器访问权限）。

3. **集合 ID 与文档不一致**  
   若你的实例是从空库手建而非本仓库迁移初始化，`audit_logs` / `notifications` 的 **Collection id** 可能与脚本中 `auditv2pms00001`、`purhahujq0wmfxe` 不同。此时**不要用 JS 迁移文件盲拷**，请用**方式二**按**集合名称**改字段；或在本机对同版本 PB 用 `migrate collections` 生成快照再比对。

如需从本机上传到宝塔，可将上述四个 `.js` 用 SFTP/面板文件管理上传到 `pb_migrations`，再 SSH 执行 `./pocketbase migrate up` 并重启服务。
