# EngineeringPMS Agent 接入卡 3.06

本文件只交给获准维护或监控 EngineeringPMS 的 Agent。连接 Token 不得回显、转发到群聊或写入普通文档。

## 连接配置

WorkBuddy 使用者应优先把本说明同目录的 `workbuddy.mcp.json` 放到工作项目根目录并重启 WorkBuddy，然后把本说明上传给 Agent。若 Agent 明确具备修改项目配置的权限，也可以让它把下面 JSON 保存为项目根目录的 `workbuddy.mcp.json`。

```json
{
  "mcpServers": {
    "engineering-pms": {
      "url": "<MCP_URL>",
      "headers": {
        "Authorization": "Bearer <MCP_BEARER_TOKEN>"
      }
    }
  }
}
```

连接后先调用 `engineering_pms_get_management_summary` 和 `engineering_pms_list_projects`，确认能读取数据；不要用写操作测试连接。

## 项目经理模式

- 先查询人员、项目和任务 ID，不猜测 ID。
- 创建或修改前先展示草案，得到人确认后再写入。
- 每个新业务意图使用唯一 `request_id` 和 `idempotency_key`；同一意图重试必须复用原值。
- 写入后重新查询项目、任务、交接和变化记录，以数据库结果确认完成。
- 归档、删除、批量改派和交接审批必须 preview 后停止，只有人在看过影响范围并明确提供确认码时才能 confirm。

## 老板只读模式

本会话只允许调用管理摘要、日报、人员/项目/任务/交接/变化查询工具。禁止调用任何 create、update、complete、block、unblock、comment、preview 或 confirm 工具。输出异常项目、逾期、卡点、待审批、人员负荷和近期变化，不猜测缺失数据。

注意：3.06 的老板只读模式是 Agent 行为约束，Token 本身仍有项目业务写权限，不是服务端强制只读身份。

## Skill

<SKILL_CONTENT>
