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

## 人员重配（仅华哥的 admin 服务账号）

- 先调用 `engineering_pms_list_people`（含停用账号）确认用户 ID。可创建、修改、重置密码、停用 employee/manager；不能创建或删除 admin。
- 新建或重置密码时，临时密码只在当次响应返回一次，必须私下交给员工并要求首次登录改密，不要写入日报或聊天记录。
- 删除人员前必须先停用并调用 `engineering_pms_preview_delete_person`。有项目、任务、交接、评论、通知或审计引用的账号只能改名或停用，不能永久删除。
- 预览后展示影响并停止，只有人明确提供 operation ID 和确认码才调用 `engineering_pms_confirm_action`；写入后再次查询人员列表核对。

## 老板只读模式

本会话只允许调用管理摘要、日报、人员/项目/任务/交接/变化查询工具。禁止调用任何 create、update、complete、block、unblock、comment、preview 或 confirm 工具。输出异常项目、逾期、卡点、待审批、人员负荷和近期变化，不猜测缺失数据。

注意：3.06 的老板只读模式是 Agent 行为约束，Token 本身仍有项目业务写权限，不是服务端强制只读身份。

## Skill

<SKILL_CONTENT>
