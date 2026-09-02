# EngineeringPMS MCP 服务交接

运行时要求 Node.js 20 或更高版本。

## 生产入口

- HTTPS 入口：`<production-web-url>/mcp`
- 健康检查：`<production-web-url>/mcp/healthz`
- sidecar：`engineering-pms-mcp.service`，监听 `127.0.0.1:3100`，由 Nginx 反代。
- 无认证 MCP POST 请求返回 401；普通 GET `/mcp` 返回 405。PocketBase 服务账号和 MCP Bearer Token 只在服务器 `/etc/engineering-pms-mcp/mcp.env`，权限为 `0600`，不进入 Git、APK 或源码交付包。
- 当前 release 由 root 管理，服务运行用户只读；`systemd-analyze security` 评分为 `3.2`。

## 工具边界

MCP 只通过受控业务 API 操作项目、任务、评论、交接和查询；不能直接写 SQLite、不能修改 AI 配置或服务器设置。生产 `tools/list` 实测返回 24 个业务工具，其中人员维护工具需要 `people_manage` scope，且服务账号所有者必须是已完成首次改密的全项目 admin。账号只能创建 employee/manager，不能通过 Agent 新建或删除 admin。

人员维护工具包括 `engineering_pms_list_people`、`engineering_pms_create_person`、`engineering_pms_update_person`、`engineering_pms_disable_person` 和 `engineering_pms_preview_delete_person`。创建和重置密码时，临时密码仅在当次响应显示一次，不写入 operation 结果、审计字段或服务端调试日志；交接给员工后应立即改密。永久删除必须先停用，且账号没有任何项目、任务、交接、评论、通知或审计引用；有历史的账号只能修改或停用，以保留责任链。

归档、删除、批量改派、交接审批和人员永久删除需要先预览，再使用五分钟一次性确认码执行；所有写入都要求幂等键。

高风险操作的 preview 返回一次性确认码。人工必须检查 preview 的影响范围和确认码，再明确授权 confirm。当前 API 允许同一 Agent 连续调用 preview 和 confirm，这项人工确认要求属于操作流程约束，不是系统强制的独立审批安全边界；Agent 不得自动连续执行这两个调用。

常用能力包括管理摘要、日报、人员/项目/任务/交接/变化查询，以及项目和任务创建修改、完成、卡点、解阻、评论和审批。

## 运维与回滚

```bash
systemctl status engineering-pms-mcp --no-pager -l
curl -fsS http://127.0.0.1:3100/healthz
journalctl -u engineering-pms-mcp --since "15 minutes ago" --no-pager
```

发布新版本时，将构建后的 `mcp-server/dist`、`package.json` 和 `package-lock.json` 放入新的 `/opt/engineering-pms-mcp/releases/<timestamp>`，在该目录执行 `npm ci --omit=dev`。确认 `dist/index.js` 和 production dependencies 完整后，再原子切换 `current` 符号链接并重启服务。release 目录归 root 所有，运行用户只保留读取和执行权限。失败时切回上一 release 目录，执行 `systemctl restart engineering-pms-mcp`。修改 Nginx 前必须备份站点配置，`nginx -t` 成功后才 reload。

3.06 生产验收：MCP 单测 `14/14`，人员维护隔离 QA `32/32`，真实 `initialize`、`tools/list`（24 个工具）和健康检查通过；无认证 MCP POST 请求返回 401。

## Agent 使用边界

经授权的 Agent 可以在分配的业务 scope 内维护项目进展和生成日报，但不能获得 SSH、root、PocketBase 管理后台、GitHub 或 LLM 原始密钥。业务负责人直接使用 Web admin 账号查看和管理。

WorkBuddy 的连接配置、项目负责人流程、老板只读提示词和故障排查见 [WorkBuddy 项目管理与监控指南](WorkBuddy项目管理与监控指南.md)。可导入的通用 Skill 和脱敏 MCP 配置示例位于 `agent-assets/workbuddy/`。

实际 URL、Bearer Token 和 Skill 放在私有交付 ZIP 的 `Agent工具/华哥Agent接入/`，无需本地解密；该 ZIP 按凭据文件管理，不进入 Git 或公开渠道。账号凭据包仍与 Agent 接入材料分开。3.06 的老板只读模式仍是行为约束；需要强制只读时必须新增独立只读鉴权边界。
