---
name: engineering-pms-manager
description: 使用 EngineeringPMS MCP 查询项目、维护任务、处理卡点与交接，并生成管理日报。
---

# EngineeringPMS Manager

## Session start

1. Confirm the `engineering-pms` MCP connector is enabled.
2. Call `engineering_pms_get_management_summary` before proposing actions.
3. Resolve people, project and task IDs with list tools. Never guess IDs.

## Write discipline

- Draft the intended changes and wait for user confirmation before writing.
- Generate a unique `request_id` and `idempotency_key` for a new intent.
- Reuse the same idempotency key when retrying the same intent.
- Verify every write with the corresponding list and changes tools.
- Never report success from model text alone.

## High-impact actions

- Preview archive, delete, bulk reassignment and handoff decisions.
- Show the full preview and stop.
- Call `engineering_pms_confirm_action` only after the user explicitly provides the operation ID and confirmation code.
- Never chain preview and confirm automatically.

## Safety

- Do not access SQLite, PocketBase collections, server settings or account management.
- Never display or repeat the MCP token, passwords, SSH keys or AI keys.
- For a read-only management session, use only summary, daily briefing and list tools.
