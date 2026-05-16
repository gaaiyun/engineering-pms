# 全功能生产场景实测 — 截图汇总

共 32 个 entry

| name | url | note |
|---|---|---|
| A01_admin_dashboard | `http://localhost:5173/admin` | admin 登录后默认到 /admin |
| A02_admin_timeline | `http://localhost:5173/admin?tab=timeline` |  |
| A03_admin_projects | `http://localhost:5173/my-projects` |  |
| A05_admin_profile | `http://localhost:5173/my-tasks` |  |
| A06_review_center_handoff_tab | `http://localhost:5173/review-center?tab=handoff` | PR 3 修复：直接 ?tab=handoff 深链 |
| A07_notifications | `http://localhost:5173/notifications` |  |
| A08_settings | `http://localhost:5173/settings` |  |
| B01_manager_dashboard | `http://localhost:5173/admin` | manager 登录默认 /admin |
| B02_my_tasks_desktop_table | `http://localhost:5173/my-tasks` | PR 4 桌面 TanStack Table |
| B03_my_tasks_bulkbar_active | `http://localhost:5173/my-tasks` | PR 4 BulkBar 多选触发 |
| B04_my_projects | `http://localhost:5173/my-projects` |  |
| B05_project_timeline_or_kanban | `http://localhost:5173/my-projects` |  |
| B06_kanban_board | `http://localhost:5173/project/3oiyzrhy13gjaut/kanban` | J-3 验证：kanban 实际能加载（pid=3oiyzrhy13gjaut） |
| B07_project_timeline_page | `http://localhost:5173/project/3oiyzrhy13gjaut/timeline` |  |
| C01_employee_home | `http://localhost:5173/app` | employee 默认 /app 含底部 Tab |
| C02_employee_tasks_tab | `http://localhost:5173/notifications` |  |
| C03_employee_my_tasks | `http://localhost:5173/my-tasks` | 桌面员工 my-tasks（桌面 viewport 1440） |
| C04_employee_notifications | `http://localhost:5173/notifications` |  |
| C05_employee_settings_desktop | `http://localhost:5173/settings` | J-1 修复：桌面端无 mobile page header |
| D_390_mobile_admin_home | `http://localhost:5173/admin` |  |
| D_390_mobile_settings | `http://localhost:5173/settings` | J-2 验证点（768 应铺满） |
| D_390_mobile_my_tasks | `http://localhost:5173/my-tasks` | 桌面=表格 移动=卡片 |
| D_768_mobile_max_admin_home | `http://localhost:5173/admin` |  |
| D_768_mobile_max_settings | `http://localhost:5173/settings` | J-2 验证点（768 应铺满） |
| D_768_mobile_max_my_tasks | `http://localhost:5173/my-tasks` | 桌面=表格 移动=卡片 |
| D_1440_desktop_admin_home | `http://localhost:5173/admin` |  |
| D_1440_desktop_settings | `http://localhost:5173/settings` | J-2 验证点（768 应铺满） |
| D_1440_desktop_my_tasks | `http://localhost:5173/my-tasks` | 桌面=表格 移动=卡片 |
| E01_remember_true | `http://localhost:5173/admin` | C2: rememberMe=1 → local=616 session=0 |
| E01_storage_check | `http://localhost:5173/admin` | C2 rememberMe=true → local=616 session=0 |
| E02_remember_false | `http://localhost:5173/admin` | C2: rememberMe=null → local=0 session=616 |
| E02_storage_check | `http://localhost:5173/admin` | C2 rememberMe=false → local=0 session=616 |
