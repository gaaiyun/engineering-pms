# Agent J — 跨断点 UI 截图回归

- 生成时间: 2026-05-16 12:50:20  耗时 130.8s
- BASE_URL: `http://127.0.0.1:5173` | PB_URL: `http://127.0.0.1:8090`
- 账号: `zhang_manager` (manager)
- 截图目录: `docs/superpowers/qa-screenshots/responsive/`  (35 张, 5 viewport × 7 page = 35)
- 脚本: `scripts/e2e_responsive_diff.py`

## 0. 核心结论（人工核对截图后）

**自动检查通过 35/35**：5 个 viewport × 7 个页面全部抓到 shell mode 符合预期：
- 1440×900 / 1024×768 → `data-shell="desktop"`，sidebar = **240px**，正确。
- 900×700 (tablet) → `data-shell="desktop"`，sidebar 折叠到 **64px**，正确（AppShell.tsx `collapsed = bp === 'tablet'`）。
- 768×1024 / 390×844 → AppShell 透传，**无 sidebar、无 TopBar**，移动 TabBar 出现，正确。
- 5/35 截图无 horizontal overflow（scrollW===clientW，与 viewport 完全等宽）。
- PR 4 TasksTableView 在 `/my-tasks` 桌面端正确展示成 table，移动端展示成卡片/empty state（咖啡杯空态图）。

**但目检截图发现 3 个真实 UI 问题**，自动 BUG 计数为 0 是因为 sidebar/shell 都符合断点定义；这些是 **页面内** 层级的响应式适配缺失：

### Bug J-1 [P2] 桌面/平板端仍渲染移动端 Page Header（含左侧返回箭头）

`/settings`, `/notifications` 在 1440 / 1024 / 900 三个非移动 viewport 上，main 区域**最上方仍然是移动版的居中页面 header**（带 `←` 返回箭头 + 居中标题），与左侧 sidebar 的"设置/通知"导航重复，并且这个 `←` 在桌面端**无意义**（桌面没有 history stack 的视觉锚）。

- 证据截图:
  - `1440x900_desktop_05_notifications.png` — 桌面端，"← 消息中心" 还在 main 顶部
  - `1440x900_desktop_06_settings.png` — 桌面端，"← 系统设置" 还在 main 顶部
  - `1440x900_desktop_04_review_handoff.png` — 顶部出现 `<` 折叠按钮 + 居中 "变更审计中心" 标题 + 右侧筛选 icon，是 ReviewCenter 的移动版 header
- 推测原因: `Notifications.tsx / SettingsPage.tsx / ReviewCenter.tsx` 顶部 header 没有按 `useBreakpoint()` 隐藏；AppShell 的 TopBar 已经在桌面端起到全局头部作用，重复的页内 header 既冗余、`←` 又会误导用户。
- 修复建议: 三个页面 header 包一层 `bp === 'mobile' ? <MobileHeader /> : null`，或把"返回 + 居中标题"块提到一个 `<MobileOnly>` 组件里。

### Bug J-2 [P2] 768 mobile_max 页面内容固定窄宽，两侧大块空白

在 `768x1024_mobile_max` viewport（mobile 临界 < 769px），所有页面 main 内容看起来是 **~430px 居中固定宽度**，两侧各有约 168px 灰底空白。

- 证据截图:
  - `768x1024_mobile_max_01_home.png` — 内容居中，约 430px 宽，两侧大量空白
  - `768x1024_mobile_max_06_settings.png` — 整页设置卡片中心化，左右各 168px+ 灰底
  - `768x1024_mobile_max_03_admin.png` — 管理控制台 2 列布局也被压在中央 ~480px
- 与 `390x844_mobile`（也 mobile）对比：390 viewport 内容铺满，无明显左右空白；说明这不是断点判定问题，而是 Home / mobile 容器**自身设置了 max-width**（看起来 ~430px），导致 768 这种"宽 mobile" 时显得很挤。
- 修复建议: mobile 容器把 `max-width` 改成 `min(100%, 480px)` 或在 `>=560px` 时切到 wide-mobile 布局（侧边充满）。

### Bug J-3 [P3] `/project/:id/kanban` 在所有 viewport 都显示 "看板加载失败 重试"

5 个 viewport 7 张 kanban 截图全部呈现错误占位符。可见文字`看板加载失败, 重试`。

- 证据: 5 张 `*_07_project_kanban.png`
- 不是响应式问题，是数据/API 问题——`ProjectKanban` 拉取 project 数据失败（用 `zhang_manager` 登录、project_id=`3oiyzrhy13gjaut`）。
- 建议另起 Agent 调查后端 API（可能与 RLS 规则或 collection 字段相关），本 PR 范围之外。

## 1. 截图矩阵概览

| viewport | 期望 | 页面 | 实际 mode | sidebar (w) | h-overflow | error |
|---|---|---|---|---|---|---|
| 1440x900_desktop | desktop | 01_home | desktop | True (240px) | False (1440/1440) | - |
| 1440x900_desktop | desktop | 02_my_tasks | desktop | True (240px) | False (1440/1440) | - |
| 1440x900_desktop | desktop | 03_admin | desktop | True (240px) | False (1440/1440) | - |
| 1440x900_desktop | desktop | 04_review_handoff | desktop | True (240px) | False (1440/1440) | - |
| 1440x900_desktop | desktop | 05_notifications | desktop | True (240px) | False (1440/1440) | - |
| 1440x900_desktop | desktop | 06_settings | desktop | True (240px) | False (1440/1440) | - |
| 1440x900_desktop | desktop | 07_project_kanban | desktop | True (240px) | False (1440/1440) | - |
| 1024x768_desktop_min | desktop | 01_home | desktop | True (240px) | False (1024/1024) | - |
| 1024x768_desktop_min | desktop | 02_my_tasks | desktop | True (240px) | False (1024/1024) | - |
| 1024x768_desktop_min | desktop | 03_admin | desktop | True (240px) | False (1024/1024) | - |
| 1024x768_desktop_min | desktop | 04_review_handoff | desktop | True (240px) | False (1024/1024) | - |
| 1024x768_desktop_min | desktop | 05_notifications | desktop | True (240px) | False (1024/1024) | - |
| 1024x768_desktop_min | desktop | 06_settings | desktop | True (240px) | False (1024/1024) | - |
| 1024x768_desktop_min | desktop | 07_project_kanban | desktop | True (240px) | False (1024/1024) | - |
| 900x700_tablet | tablet | 01_home | tablet | True (64px) | False (900/900) | - |
| 900x700_tablet | tablet | 02_my_tasks | tablet | True (64px) | False (900/900) | - |
| 900x700_tablet | tablet | 03_admin | tablet | True (64px) | False (900/900) | - |
| 900x700_tablet | tablet | 04_review_handoff | tablet | True (64px) | False (900/900) | - |
| 900x700_tablet | tablet | 05_notifications | tablet | True (64px) | False (900/900) | - |
| 900x700_tablet | tablet | 06_settings | tablet | True (64px) | False (900/900) | - |
| 900x700_tablet | tablet | 07_project_kanban | tablet | True (64px) | False (900/900) | - |
| 768x1024_mobile_max | mobile | 01_home | mobile | False (0px) | False (768/768) | - |
| 768x1024_mobile_max | mobile | 02_my_tasks | mobile | False (0px) | False (768/768) | - |
| 768x1024_mobile_max | mobile | 03_admin | mobile | False (0px) | False (768/768) | - |
| 768x1024_mobile_max | mobile | 04_review_handoff | mobile | False (0px) | False (768/768) | - |
| 768x1024_mobile_max | mobile | 05_notifications | mobile | False (0px) | False (768/768) | - |
| 768x1024_mobile_max | mobile | 06_settings | mobile | False (0px) | False (768/768) | - |
| 768x1024_mobile_max | mobile | 07_project_kanban | mobile | False (0px) | False (768/768) | - |
| 390x844_mobile | mobile | 01_home | mobile | False (0px) | False (390/390) | - |
| 390x844_mobile | mobile | 02_my_tasks | mobile | False (0px) | False (390/390) | - |
| 390x844_mobile | mobile | 03_admin | mobile | False (0px) | False (390/390) | - |
| 390x844_mobile | mobile | 04_review_handoff | mobile | False (0px) | False (390/390) | - |
| 390x844_mobile | mobile | 05_notifications | mobile | False (0px) | False (390/390) | - |
| 390x844_mobile | mobile | 06_settings | mobile | False (0px) | False (390/390) | - |
| 390x844_mobile | mobile | 07_project_kanban | mobile | False (0px) | False (390/390) | - |

## 2. 发现的 UI bug (0)

无 [BUG] 级问题。

## 3. 其他视觉/截断注记 (9)

- **1440x900_desktop / 04_review_handoff** — mobile-header-leak: 桌面端 main 顶部出现小按钮（可能是移动 header 漏出来）
- **1440x900_desktop / 05_notifications** — mobile-header-leak: 桌面端 main 顶部出现小按钮（可能是移动 header 漏出来）
- **1440x900_desktop / 06_settings** — mobile-header-leak: 桌面端 main 顶部出现小按钮（可能是移动 header 漏出来）
- **1024x768_desktop_min / 04_review_handoff** — mobile-header-leak: 桌面端 main 顶部出现小按钮（可能是移动 header 漏出来）
- **1024x768_desktop_min / 05_notifications** — mobile-header-leak: 桌面端 main 顶部出现小按钮（可能是移动 header 漏出来）
- **1024x768_desktop_min / 06_settings** — mobile-header-leak: 桌面端 main 顶部出现小按钮（可能是移动 header 漏出来）
- **900x700_tablet / 04_review_handoff** — mobile-header-leak: 桌面端 main 顶部出现小按钮（可能是移动 header 漏出来）
- **900x700_tablet / 05_notifications** — mobile-header-leak: 桌面端 main 顶部出现小按钮（可能是移动 header 漏出来）
- **900x700_tablet / 06_settings** — mobile-header-leak: 桌面端 main 顶部出现小按钮（可能是移动 header 漏出来）

## 4. 截图清单（绝对路径）

### 1440x900_desktop

- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/1440x900_desktop_01_home.png` — route=`/app` shell=desktop sb=True hov=False
  - 可见文字片段: 工程结算, 工程管理系统, 工作进展, 管理, 我的
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/1440x900_desktop_02_my_tasks.png` — route=`/my-tasks` shell=desktop sb=True hov=False
  - 可见文字片段: 进行中 (0), 待办 (0), 逾期 (0), 已完成, 序号
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/1440x900_desktop_03_admin.png` — route=`/admin` shell=desktop sb=True hov=False
  - 可见文字片段: 系统概览, 管理控制台, 退出登录, 项目总数, 活跃项目
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/1440x900_desktop_04_review_handoff.png` — route=`/review-center?tab=handoff` shell=desktop sb=True hov=False
  - 可见文字片段: 变更审计中心, 全部, 待复核, 已阅读, 已通过
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/1440x900_desktop_05_notifications.png` — route=`/notifications` shell=desktop sb=True hov=False
  - 可见文字片段: 消息通知, 消息中心, 全部 (0), 未读 (0), 任务
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/1440x900_desktop_06_settings.png` — route=`/settings` shell=desktop sb=True hov=False
  - 可见文字片段: 系统设置, 通用, 消息通知, 修改密码, 清除缓存
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/1440x900_desktop_07_project_kanban.png` — route=`/project/3oiyzrhy13gjaut/kanban` shell=desktop sb=True hov=False
  - 可见文字片段: 看板加载失败, 重试

### 1024x768_desktop_min

- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/1024x768_desktop_min_01_home.png` — route=`/app` shell=desktop sb=True hov=False
  - 可见文字片段: 工程结算, 工程管理系统, 工作进展, 管理, 我的
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/1024x768_desktop_min_02_my_tasks.png` — route=`/my-tasks` shell=desktop sb=True hov=False
  - 可见文字片段: 进行中 (0), 待办 (0), 逾期 (0), 已完成, 序号
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/1024x768_desktop_min_03_admin.png` — route=`/admin` shell=desktop sb=True hov=False
  - 可见文字片段: 系统概览, 管理控制台, 退出登录, 项目总数, 活跃项目
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/1024x768_desktop_min_04_review_handoff.png` — route=`/review-center?tab=handoff` shell=desktop sb=True hov=False
  - 可见文字片段: 变更审计中心, 全部, 待复核, 已阅读, 已通过
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/1024x768_desktop_min_05_notifications.png` — route=`/notifications` shell=desktop sb=True hov=False
  - 可见文字片段: 消息通知, 消息中心, 全部 (0), 未读 (0), 任务
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/1024x768_desktop_min_06_settings.png` — route=`/settings` shell=desktop sb=True hov=False
  - 可见文字片段: 系统设置, 通用, 消息通知, 修改密码, 清除缓存
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/1024x768_desktop_min_07_project_kanban.png` — route=`/project/3oiyzrhy13gjaut/kanban` shell=desktop sb=True hov=False
  - 可见文字片段: 看板加载失败, 重试

### 900x700_tablet

- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/900x700_tablet_01_home.png` — route=`/app` shell=desktop sb=True hov=False
  - 可见文字片段: 工程结算, 工程管理系统, 工作进展, 管理, 我的
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/900x700_tablet_02_my_tasks.png` — route=`/my-tasks` shell=desktop sb=True hov=False
  - 可见文字片段: 进行中 (0), 待办 (0), 逾期 (0), 已完成, 序号
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/900x700_tablet_03_admin.png` — route=`/admin` shell=desktop sb=True hov=False
  - 可见文字片段: 系统概览, 管理控制台, 退出登录, 项目总数, 活跃项目
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/900x700_tablet_04_review_handoff.png` — route=`/review-center?tab=handoff` shell=desktop sb=True hov=False
  - 可见文字片段: 变更审计中心, 全部, 待复核, 已阅读, 已通过
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/900x700_tablet_05_notifications.png` — route=`/notifications` shell=desktop sb=True hov=False
  - 可见文字片段: 消息通知, 消息中心, 全部 (0), 未读 (0), 任务
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/900x700_tablet_06_settings.png` — route=`/settings` shell=desktop sb=True hov=False
  - 可见文字片段: 系统设置, 通用, 消息通知, 修改密码, 清除缓存
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/900x700_tablet_07_project_kanban.png` — route=`/project/3oiyzrhy13gjaut/kanban` shell=desktop sb=True hov=False
  - 可见文字片段: 看板加载失败, 重试

### 768x1024_mobile_max

- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/768x1024_mobile_max_01_home.png` — route=`/app` shell=mobile sb=False hov=False
  - 可见文字片段: 工程结算管理, 工作进展, 项目与进度, 暂无参与的项目, 工作进展
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/768x1024_mobile_max_02_my_tasks.png` — route=`/my-tasks` shell=mobile sb=False hov=False
  - 可见文字片段: 我的任务, 进行中 (0), 待办 (0), 逾期 (0), 已完成
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/768x1024_mobile_max_03_admin.png` — route=`/admin` shell=mobile sb=False hov=False
  - 可见文字片段: 系统概览, 管理控制台, 退出登录, 项目总数, 活跃项目
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/768x1024_mobile_max_04_review_handoff.png` — route=`/review-center?tab=handoff` shell=mobile sb=False hov=False
  - 可见文字片段: 变更审计中心, 全部, 待复核, 已阅读, 已通过
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/768x1024_mobile_max_05_notifications.png` — route=`/notifications` shell=mobile sb=False hov=False
  - 可见文字片段: 消息通知, 消息中心, 全部 (0), 未读 (0), 任务
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/768x1024_mobile_max_06_settings.png` — route=`/settings` shell=mobile sb=False hov=False
  - 可见文字片段: 系统设置, 通用, 消息通知, 修改密码, 清除缓存
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/768x1024_mobile_max_07_project_kanban.png` — route=`/project/3oiyzrhy13gjaut/kanban` shell=mobile sb=False hov=False
  - 可见文字片段: 看板加载失败, 重试

### 390x844_mobile

- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/390x844_mobile_01_home.png` — route=`/app` shell=mobile sb=False hov=False
  - 可见文字片段: 工程结算管理, 工作进展, 项目与进度, 暂无参与的项目
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/390x844_mobile_02_my_tasks.png` — route=`/my-tasks` shell=mobile sb=False hov=False
  - 可见文字片段: 我的任务, 进行中 (0), 待办 (0), 逾期 (0), 已完成
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/390x844_mobile_03_admin.png` — route=`/admin` shell=mobile sb=False hov=False
  - 可见文字片段: 系统概览, 管理控制台, 退出登录, 项目总数, 活跃项目
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/390x844_mobile_04_review_handoff.png` — route=`/review-center?tab=handoff` shell=mobile sb=False hov=False
  - 可见文字片段: 变更审计中心, 全部, 待复核, 已阅读, 已通过
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/390x844_mobile_05_notifications.png` — route=`/notifications` shell=mobile sb=False hov=False
  - 可见文字片段: 消息通知, 消息中心, 全部 (0), 未读 (0), 任务
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/390x844_mobile_06_settings.png` — route=`/settings` shell=mobile sb=False hov=False
  - 可见文字片段: 系统设置, 通用, 消息通知, 修改密码, 清除缓存
- `G:/项目管理软件_v2/docs/superpowers/qa-screenshots/responsive/390x844_mobile_07_project_kanban.png` — route=`/project/3oiyzrhy13gjaut/kanban` shell=mobile sb=False hov=False
  - 可见文字片段: 看板加载失败, 重试

## 5. 视觉一致性观察

跨 viewport sidebar/shell 行为一致，未发现明显不一致。

## 6. 结论

- 总截图: 35 / 35 全部成功（5 viewport × 7 page）
- 自动断点校验通过: 35（shell mode / sidebar 宽度 / horizontal overflow 全部 OK）
- 目检发现的 UI 问题: **3 个**（详见 §0）
  - J-1 [P2] desktop/tablet 仍渲染移动版 page header (`← 系统设置/消息中心/审计中心`)
  - J-2 [P2] 768 mobile_max 内容固定 ~430px 居中，两侧大块空白
  - J-3 [P3] kanban 跨 viewport 都数据加载失败（非响应式问题）
- AppShell 响应式核心逻辑 (`useBreakpoint` + `data-shell`) 在 5 个断点上**均按设计工作**；问题集中在**单个页面**内部的移动 header 没有跟随断点隐藏。
