# EngineeringPMS 统一导航与 PocketBase 稳定化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除桌面与移动端重复导航，建立可复用于 App/未来小程序的导航模型，并安全修复 PocketBase 日志库与进程守护。

**Architecture:** `AppShell` 是唯一主导航容器；纯 TypeScript 导航模型负责角色、路由和跨端 surface 决策，React 组件只负责渲染。PocketBase 先隔离损坏的 `logs.db*`，再由 systemd 单一守护，完成 `/pb` 反代验证后才关闭公网 8090。

**Tech Stack:** React 19、React Router、Vitest、Playwright、Capacitor 5、PocketBase 0.22.21、systemd、Nginx。

---

## Task 1：冻结现有数据流修复

- [x] 运行完整 Vitest 与生产构建。
- [x] 将 PocketBase 同源解析与通知分页分成两个提交。
- [ ] 在最终发布前重新运行全量验证。

## Task 2：可移植导航模型

- [ ] 先为角色可见性、旧路由映射和 surface 决策写失败测试。
- [ ] 定义 `AppRole`、`RouteId`、`NavItem`、`AppSurface` 与无 DOM 的解析函数。
- [ ] 测试 employee、manager、admin 与 native/coarse/fine pointer 组合。

## Task 3：唯一 AppShell

- [ ] 让 `AppShell` 独占桌面侧栏、折叠侧栏和移动底栏。
- [ ] 删除 `Home.tsx` 内部 PC 侧栏、独立断点和底栏。
- [ ] 删除 `AdminDashboard.tsx` 无条件底栏，把页面 Tab 降为内容区二级导航。
- [ ] 保证任一 viewport 只渲染一种主导航。

## Task 4：角色路由和兼容跳转

- [ ] 所有角色登录进入 `/app`。
- [ ] 增加 `/me`、`/system/users`、`/system/ai`、`/system/import` 与 admin-only guard。
- [ ] 把 `/manager` 和旧 `/admin?tab=` 映射到新路由。
- [ ] 保留项目详情、时间轴、任务和通知深链接。

## Task 5：PocketBase 恢复资产

- [ ] 提交维护脚本、systemd 模板和 Nginx `/pb` 片段。
- [ ] 在宝塔终端执行脚本，验证 `data.db` quick check、日志库重建和进程自动拉起。
- [ ] 连续观察 10 分钟，确认 journal 无 malformed 错误。
- [ ] `/pb` 全链路和新版 Web/APK 通过后，再收口公网 8090。

## Task 6：测试、APK、交接与推送

- [ ] Vitest 全量、changed-files ESLint、生产构建全部通过。
- [ ] Playwright 覆盖手机、触控平板、键鼠窗口、桌面和三个角色。
- [ ] 使用 G 盘 Gradle 缓存构建 debug APK。
- [ ] 更新协作交接文档，审阅 diff，只推送功能分支。
