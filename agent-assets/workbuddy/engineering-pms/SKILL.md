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

- Preview archive, delete, bulk reassignment, handoff decisions and permanent person deletion.
- Show the full preview and stop.
- Call `engineering_pms_confirm_action` only after the user explicitly provides the operation ID and confirmation code.
- Never chain preview and confirm automatically.

## Personnel reconfiguration (admin service account only)

- Use `engineering_pms_list_people` with `include_inactive=true` before changing anyone; resolve the exact user ID.
- `engineering_pms_create_person` can create only `employee` or `manager`. The one-time temporary password is returned only in that response; hand it to the employee privately and require an immediate password change.
- Use `engineering_pms_update_person` for name, username, email, department, role or password reset. Use `engineering_pms_disable_person` to preserve history while removing access.
- Permanent deletion requires the account to be inactive and free of all project/task/handoff/comment/notification/audit references. Always preview, show the impact, and wait for explicit confirmation.
- Never create or delete an admin, never bypass a reference block, and verify every change with a follow-up list query.

## Safety

- Do not access SQLite, PocketBase collections, server settings, admin accounts or AI configuration. Personnel tools are limited to the controlled employee/manager workflow above.
- Never display or repeat the MCP token, passwords, SSH keys or AI keys.
- For a read-only management session, use only summary, daily briefing and list tools.
