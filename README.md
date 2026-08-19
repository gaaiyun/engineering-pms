# EngineeringPMS 工程项目管理系统

面向工程结算团队的 Web、PWA 与 Android 项目协作系统。当前应用版本为 `3.06`，采用 React、Capacitor 与 PocketBase。

## 当前状态

- 统一跨端导航：桌面侧栏，触控平板与手机/App 使用底部五入口。
- 工作台、任务、项目详情、看板、时间轴、通知、个人资料和系统管理已连通。
- 任务完成/交接、卡点/回退、解阻、交接审批和永久删除由 PocketBase 服务端事务处理。
- 账号支持保持登录、停用即时失效、管理员增改停用及安全删除校验。
- LLM 使用 OpenAI-compatible 服务端代理，Provider、Base URL、模型和 Key 均由管理员配置；浏览器不保存 API Key。
- PocketBase Server 固定 `0.22.21`，前端 PocketBase JS SDK 固定 `0.21.5`。升级必须单独做迁移和回滚测试。
- 3.06 Debug APK 已通过版本、包信息和内嵌生产地址静态检查；`adb devices` 当前为空，真机验收未完成，产物不得放入正式交付包。
- 3.06 生产数据已清理为正式账号空白基线；项目、任务、通知等业务内容在交付后创建。
- MCP sidecar 已通过生产 HTTPS 提供 20 个受控业务工具，不包含账号或系统管理工具。

生产发布必须遵循 [部署与运维手册](docs/宝塔部署操作手册.md)。仓库内容不等于已部署状态。

## 3.06 交付记录

| 项目 | 结果 |
|---|---|
| 部署 | 提交 `c4c298f`，2026-08-20 06:45 CST |
| 生产备份 | 精确路径记录于私有运维接力文档 |
| Web | `<production-web-url>` |
| MCP | `<production-web-url>/mcp`；无认证 MCP POST 请求返回 401 |
| 自动化 | 后端 QA 既有基线 `64/64`、最终差异 `15/15`；前端 `203/203`；Playwright `28/28`；MCP `11/11` |
| Realtime | 生产 SSE 返回 200 |
| APK | `3.06` / `46`；SHA-256 `C445196B7574C63CDE4F3E90E14EB6CAD4929EDF4717DE41B7D78C2FF52B87ED`；静态验收通过，真机待验收 |

MCP 环境文件权限为 `0600`，release 目录由 root 管理且服务进程只读，systemd 安全评分为 `3.2`。公网 8090 在 3.06 APK 真机验收完成前暂时保留。

## 角色与导航

| 角色 | 主要能力 |
|---|---|
| employee | 个人任务、参与项目、卡点与交接、通知、个人资料 |
| manager | 项目与任务管理、成员管理、审核中心、AI 分析 |
| admin | manager 全部能力，加用户、AI Provider、数据导入与系统设置 |

手机/App 固定入口为：工作台、任务、项目、通知、我的。桌面额外展示审核中心和管理员系统入口。

## 技术栈

| 层级 | 版本/实现 |
|---|---|
| 前端 | React 19、TypeScript 5.9、Vite 6、TanStack Query 5 |
| UI | Ant Design Mobile、ECharts、dnd-kit |
| Android | Capacitor 5.7，applicationId `com.engineering.pms` |
| 后端 | PocketBase 0.22.21、SQLite/WAL、JS hooks/migrations |
| 前端 SDK | PocketBase JS SDK 0.21.5 |
| AI | 管理员配置的 OpenAI-compatible API |

## 本地开发

要求：前端使用 Node.js 18+，MCP sidecar 使用 Node.js 20+，PocketBase 使用与生产兼容的 `0.22.21`。

1. 在隔离测试目录启动 PocketBase，不要复制或覆盖生产 `pb_data`：

   ```powershell
   .\backend\pocketbase.exe serve --http=127.0.0.1:8090
   ```

2. 启动前端：

   ```powershell
   Set-Location frontend
   $env:npm_config_cache = 'G:\dev-cache\npm'
   npm install
   npm run dev
   ```

   也可在已启动 PocketBase 后运行根目录 `START.bat`。该脚本只启动前端，不重建数据库、不创建账号、不写入密钥。

3. 如本地后端不是 `127.0.0.1:8090`，构建前显式设置：

   ```powershell
   $env:VITE_PB_URL = 'http://127.0.0.1:8090'
   ```

仓库不提供生产账号或默认密码。开发测试账号应在隔离数据库中自行创建。

## 验证

```powershell
Set-Location frontend
$env:PLAYWRIGHT_BROWSERS_PATH = 'G:\ClaudeData\ms-playwright'
$env:npm_config_cache = 'G:\dev-cache\npm'
npm test -- --run
npm run build
npm run test:e2e
```

后端脚本语法检查：

```powershell
Get-ChildItem ..\backend\pb_hooks, ..\backend\pb_migrations -Filter *.js -Recurse |
  ForEach-Object { node --check $_.FullName }
```

生产验收还必须包含：业务库 `PRAGMA quick_check`、systemd 自动拉起、登录与权限负面测试、SSE 通知、Web 深链、APK 真机安全区/横竖屏/返回键。

## 目录

```text
frontend/                 React、Capacitor Android、Vitest、Playwright
backend/pb_hooks/         服务端权限与事务扩展
backend/pb_migrations/    前向数据库迁移
deploy/pocketbase/        systemd、日志修复与可选 Nginx 模板
deploy/mcp/               MCP systemd 与 Nginx 模板
mcp-server/               MCP sidecar 源码、测试与锁文件
docs/                     当前产品、架构、运维与交接文档
```

旧的原始自动化计划、调试截图、过期脚本和演示数据文档已退出当前 Git 文件树；历史仍可由 Git 提交记录追溯。

## 文档入口

- [3.06 交付快速使用说明](docs/交付快速使用说明.md)
- [产品说明](docs/产品说明.md)
- [用户使用指南](docs/用户使用指南.md)
- [代码架构](docs/代码架构文档.md)
- [PocketBase 数据与权限](docs/数据库设计_PocketBase版.md)
- [需求与验收矩阵](docs/需求实现对照表.md)
- [宝塔部署与运维](docs/宝塔部署操作手册.md)
- [Android APK](docs/android-apk.md)
- [MCP 服务交接](docs/MCP服务交接.md)
- [开发交接](docs/开发交接.md)
- [历史发展摘要](docs/历史发展摘要.md)

## 安全边界

- 公开服务入口可以写入交付文档；不提交 API Key、管理 Token、真实账号清单、私有拓扑、keystore、生产数据库或备份。
- 不通过前端多请求模拟事务；状态机统一调用 `/api/custom/*` 服务端路由。
- 不直接覆盖生产 `pb_data`、hooks 或 migrations；先冷备、测试副本验证，再逐项发布。
- 不用 `npm audit fix --force`、强推、跳过 hooks 或未经确认的递归删除处理发布问题。
