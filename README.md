# 工程结算管理系统

> 基于 React + PocketBase 的移动优先项目管理系统，专为工程结算场景设计。

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite)
![PocketBase](https://img.shields.io/badge/PocketBase-0.22-B8DBE4)
![License](https://img.shields.io/badge/License-MIT-green)

## 功能特性

- **角色权限体系** — 经理/管理员全权管理，员工受限视图
- **项目看板** — 拖拽式任务管理（待处理/进行中/卡点/已完成）
- **时间轴/甘特图** — 项目进度可视化，支持移动端横屏
- **批量任务编辑** — 三列表格一次性设置多个任务
- **实时数据同步** — PocketBase Realtime SSE 自动刷新
- **变更审计中心** — 所有变动可追溯，支持已阅/通过复核
- **全员消息通知** — 项目内任何变动自动通知全体成员
- **AI 智能分析** — 基于 DeepSeek 的项目诊断与问答
- **自动备份** — 每 12 小时备份，保留 60 天
- **移动端适配** — Capacitor 打包 Android APK，PWA 支持

## 快速开始

### 环境要求

- Node.js >= 18
- PocketBase >= 0.22

### 1. 启动后端

```bash
# Linux
cd pocketbase
./pocketbase serve --http=0.0.0.0:8090

# Windows
cd backend
启动后端.bat
```

### 2. 初始化数据库

```bash
cd scripts
npm install
node database_rebuild.mjs
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173

### 一键启动（Windows）

```bash
START.bat
```

## 测试账号

| 角色 | 账号 | 密码 |
|------|------|------|
| 管理员 | zhao_boss | 12345678 |
| 经理 | zhang_manager | 12345678 |
| 员工 | li_audit | 12345678 |
| 员工 | chen_doc | 12345678 |

## 项目结构

```
├── frontend/          # React 前端应用
│   ├── src/
│   │   ├── lib/       # 核心库（API、PocketBase、状态管理）
│   │   ├── pages/     # 页面组件（18 个）
│   │   └── components/# 可复用组件（12 个）
│   └── public/        # 静态资源
├── backend/           # PocketBase 后端配置
│   ├── pb_data/       # 数据库（运行时生成）
│   └── pb_migrations/ # 数据库迁移文件
├── pocketbase/        # PocketBase 可执行文件
├── scripts/           # 运维脚本（备份、数据库重建等）
└── docs/              # 项目文档
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 6 |
| UI 组件库 | Ant Design Mobile |
| 状态管理 | TanStack Query + Zustand |
| 拖拽 | @dnd-kit |
| 图表 | ECharts + Recharts |
| 后端 | PocketBase (SQLite) |
| AI | SiliconFlow / DeepSeek |
| 移动端 | Capacitor (Android) |

## 部署

详见 [宝塔部署操作手册](docs/宝塔部署操作手册.md) 和 [快速启动指南](docs/快速启动_命令行版.md)。

### 自动备份

```bash
# 添加 crontab（每 12 小时）
0 */12 * * * cd /path/to/project && node scripts/auto_backup.mjs
```

### Android APK 打包

详见 [App 打包指南](docs/App打包指南.md)。

## 文档

| 文档 | 说明 |
|------|------|
| [代码架构文档](docs/代码架构文档.md) | 完整技术架构与文件说明 |
| [数据库设计](docs/数据库设计_PocketBase版.md) | PocketBase 集合与字段设计 |
| [技术选型方案](docs/技术选型方案.md) | 技术栈选择理由 |
| [交付文档](docs/交付文档_完整版.md) | 完整交付说明 |
| [用户使用指南](docs/用户使用指南.md) | 终端用户操作手册 |
| [PRD](docs/PRD_v2.0_Enterprise.md) | 产品需求文档 |
| [技术规格](docs/TECH_SPEC_v2.0.md) | 技术规格文档 |

## 许可证

[MIT](LICENSE)
