# WorkBuddy 项目管理与监控指南

本文供项目负责人和管理层使用。EngineeringPMS MCP 是远程 Streamable HTTP 服务；WorkBuddy 通过自定义连接器调用，不需要 SSH、PocketBase 管理员或数据库权限。

## 一、配置 WorkBuddy

私下发送给项目负责人的交付 ZIP 已直接包含 `Agent工具/华哥Agent接入/`，无需本地解密：

- `workbuddy.mcp.json`：含实际 MCP 地址和 Bearer Key，放到 WorkBuddy 工作项目根目录。
- `EngineeringPMS-Agent接入说明.md`：直接上传给 Agent，包含完整连接说明、项目经理/老板工作模式和安全纪律。
- `engineering-pms/SKILL.md`：WorkBuddy 支持 Skill 导入时使用。

最省事的流程是解压 ZIP，把 `workbuddy.mcp.json` 放进华哥平时用 WorkBuddy 打开的项目目录，重启 WorkBuddy，再把 `EngineeringPMS-Agent接入说明.md` 上传到该 Agent 对话。这个 ZIP 持有项目业务写入 Key，只能私下交给获准人员，不能上传到公开网盘、Git 或群聊。

优先在 WorkBuddy 对话输入框旁打开“连接器”，进入连接器管理后选择“自定义连接器”。不同版本的按钮名称可能略有差异，核心字段如下：

1. MCP Server URL：`<production-web-url>/mcp`。
2. 认证类型：`API Key`。
3. Header Name：`Authorization`。
4. Header Value：`Bearer <MCP_BEARER_TOKEN>`，中间有一个空格。
5. 保存、启用连接器并回到对话。

需要项目级配置时，直接使用私有交付目录中的 `Agent工具/华哥Agent接入/workbuddy.mcp.json`；仓库里的 `workbuddy.mcp.example.json` 只是无 Key 示例。

手动配置时，从私有 `workbuddy.mcp.json` 读取实际地址和 Key：

```json
{
  "mcpServers": {
    "engineering-pms": {
      "type": "streamableHttp",
      "url": "<production-web-url>/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_BEARER_TOKEN>"
      }
    }
  }
}
```

保存并启用连接器后重启 WorkBuddy。连接正常时应显示 24 个 `engineering_pms_*` 工具。Token 只粘贴到 WorkBuddy 的私有连接器配置，不发送到聊天、群聊或普通文档。

## 二、连接验收

依次对 WorkBuddy 说：

1. “列出 EngineeringPMS 当前可用的工具，只显示工具名，不执行写操作。”
2. “调用 `engineering_pms_get_management_summary`，用 Markdown 返回。”
3. “调用 `engineering_pms_list_projects`，查询第一页 20 条，不创建项目。”

预期结果：能看到 24 个工具；摘要和项目列表能返回；当前正式空白基线的项目、任务可以为 0。若显示 0 个工具，检查 JSON 格式、URL、`Authorization` 是否含 `Bearer ` 前缀，保存后重启 WorkBuddy。

## 三、工具分组

| 用途 | 工具 |
|---|---|
| 管理摘要 | `engineering_pms_get_management_summary`、`engineering_pms_daily_briefing` |
| 查询 | `engineering_pms_list_people`、`engineering_pms_list_projects`、`engineering_pms_list_tasks`、`engineering_pms_list_handoffs`、`engineering_pms_list_changes` |
| 人员维护（仅 admin 服务账号） | `engineering_pms_create_person`、`engineering_pms_update_person`、`engineering_pms_disable_person`、`engineering_pms_preview_delete_person` |
| 项目 | `engineering_pms_create_project`、`engineering_pms_update_project` |
| 任务 | `engineering_pms_create_task`、`engineering_pms_update_task`、`engineering_pms_complete_task`、`engineering_pms_block_task`、`engineering_pms_unblock_task`、`engineering_pms_add_comment` |
| 高影响预览 | `engineering_pms_preview_archive_project`、`engineering_pms_preview_delete_task`、`engineering_pms_preview_bulk_reassign`、`engineering_pms_preview_handoff_decision` |
| 最终确认 | `engineering_pms_confirm_action` |

创建和修改操作需要 `request_id` 与 `idempotency_key`。WorkBuddy 应为每次业务意图生成唯一值；重试同一意图时复用原值，不能为同一操作重复生成任务。

### 人员重配流程（华哥）

先说“列出全部人员（包括停用）”，确认目标账号 ID 后，再按以下顺序操作：

1. 需要保留历史责任时，用 `engineering_pms_update_person` 修改姓名、用户名、邮箱、部门或角色；如员工忘记密码，可勾选 `reset_password`，把工具当次返回的临时密码通过私下渠道交给本人，并要求首次登录立即改密。
2. 不再使用的账号先调用 `engineering_pms_disable_person`。停用会立即拒绝密码登录，但项目、任务、通知和审计历史保留。
3. 只有明确确认“已停用且无任何业务引用”的账号，才调用 `engineering_pms_preview_delete_person`。展示引用检查和五分钟确认码，人工核对后再调用 `engineering_pms_confirm_action`。
4. 新员工用 `engineering_pms_create_person` 创建，只填写用户名、姓名、邮箱、角色和部门。创建响应中的临时密码只显示一次，不要让 Agent 重复朗读或写入日报；员工首次登录后必须修改。

Agent 不能删除有历史引用的账号，也不能创建/删除 admin。遇到“账号需要保留”时按第 1 步改名或停用，不要绕过服务端保护。每次写操作后都重新调用 `engineering_pms_list_people` 核对状态；同一意图重试必须复用原 `idempotency_key`。

## 四、项目负责人用法

### 每日开工

```text
你是 EngineeringPMS 项目经理助手。先调用管理摘要和日报，只读查询，不修改数据。
按“逾期、三日内到期、卡点、待审批、未分配、人员负荷”输出，并列出今天最需要处理的 3 件事。
不确定的项目或人员 ID 必须先查询，不得猜测。
```

### 创建项目

```text
我要建立一个新项目。先查询启用人员并把项目草案列给我确认，草案包含名称、负责人、成员、开始日期、截止日期和说明。
我回复“确认创建”之前不要写入。确认后调用 create_project，只创建一次，再查询项目列表验证结果。
```

### 拆分和分配任务

```text
读取指定项目和人员列表，根据目标拆成任务草案。每项写明任务名、负责人、截止日期、优先级、验收条件和依赖。
先展示草案；我确认后逐项创建。每次创建使用唯一 request_id/idempotency_key，最后重新查询任务并核对数量、负责人和日期。
```

### 维护进度

```text
查询这个项目的全部未完成任务和近期变化。把任务分成正常、临期、逾期、卡点和未分配。
只给修改建议，不自动完成、改派、归档或删除。需要更新普通任务信息时先列出变更前后差异，得到确认再执行。
```

### 完成、卡点和交接

完成任务必须同时提交下一步交接提案；卡点必须写原因、需要谁协助和预计解除时间。执行后重新查询任务、交接和变化记录，不能只凭工具返回就报告成功。

## 五、老板监控用法

老板可使用下面的只读会话提示词：

```text
本会话只做管理监控。只允许调用以下 7 个查询工具：
get_management_summary、daily_briefing、list_people、list_projects、list_tasks、list_handoffs、list_changes。
禁止调用 create、update、complete、block、unblock、comment、preview 和 confirm 工具。
输出经营摘要、异常项目、逾期与卡点、待审批、人员负荷和本周变化；每个结论注明数据来源，不猜测缺失数据。
```

当前 3.06 的老板只读模式是 WorkBuddy 行为约束，MCP Token 本身仍具备项目业务写权限，并非独立的服务端只读身份。需要技术上强制只读时，应另建只读 Token/sidecar 后再交给老板；在此之前不要把项目负责人的连接器配置转发给不受信任人员。

## 六、高影响操作确认

归档项目、永久删除任务、批量改派、批准或驳回交接必须分两步：

1. WorkBuddy 调用 preview，把影响对象、变更前后和八位确认码完整展示给人。
2. WorkBuddy 必须停止，等待人明确回复“确认执行 + operation_id + confirmation_code”。
3. 人确认后才调用 `engineering_pms_confirm_action`。

确认码五分钟失效且只能使用一次。不得让 Agent 自动连续调用 preview 和 confirm。

## 七、常用管理指令

- “生成今天的项目管理日报，先只读，不修改数据。”
- “找出三天内到期但无人负责的任务，按项目分组。”
- “列出所有卡点、持续时间、求助对象和建议负责人。”
- “比较最近七天变化，列出新增、完成、延期和改派。”
- “查看每个人的未完成任务负荷，只报告异常分布。”
- “为这个项目生成任务草案，等我确认后再创建。”
- “预览这批任务改派给某成员的影响，不要确认执行。”

## 八、安全边界

- Agent 不管理 admin 账号、AI Key、服务器或 PocketBase 后台。华哥的服务账号仅额外开放受控的 employee/manager 人员维护 scope。
- 不把 Token、初始密码、SSH 私钥或管理员凭据写入提示词和输出。
- 不直接操作 SQLite 或 PocketBase 集合；只调用 `engineering_pms_*` 工具。
- 写操作后必须通过查询工具验证数据库结果。
- Agent 说“已完成”不等于交付成功；以工具响应、查询结果和 Web 页面为准。

## 参考

- [WorkBuddy 自定义连接器](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Connector)
- [WorkBuddy 项目级 MCP 配置说明](https://docs.cloudbase.net/en/ai/cloudbase-ai-toolkit/ide-setup/workbuddy)
