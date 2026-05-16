# Changelog

## 2026-03-03 — Lint 修复与代码质量 (v2.2.0)

### Lint 修复

- **总问题数**: 157 → 121（-23%），错误 149 → 118，警告 8 → 3
- **未使用变量（15 处）**: 清理 `KanbanBoard`、`TaskDetailDrawer`、`Login`、`Notifications`、`ProjectTimeline`、`TaskCreate`、`TaskDetail`、`AIConsole` 等文件中的冗余 `error`/`e` 变量
- **组件性能**: `SettingsPage` 中 `SettingRow` 从 render 内移到函数外，定义明确的 `SettingRowProps` 接口
- **Hook 依赖（6 处）**: `Profile`、`ProjectTimeline`、`TaskCreate`、`TaskDetail`、`AdminDashboard` —— 使用 `useCallback` 包装异步函数并补齐依赖数组
- **`any` 类型（13 处）**: `api.ts` 的 `AuditLog` 改 `Record<string, unknown>`；`BatchProjectCreator`/`BatchTaskEditor` 收窄 value 类型；`ThreeColumnImport` 新增 `TaskData`/`ProjectImportData`/`FormValues` 接口；catch 块统一用 `error instanceof Error`
- **剩余 121 条**主要为测试文件 `any`、第三方库类型、非关键 hook 依赖警告，无 P0/P1 阻塞项

### 冷热启动一致性修复

- **路由一致性**: 所有 `Navigate`/`navigate` 加 `replace: true`，防止回退到登录页；未登录正确跳 `/login`
- **退出登录**: 统一清理 `authStore` + `localStorage(rememberMe)` + `sessionStorage(pocketbase_auth)`
- **AdminDashboard Tab 校验**: 无效 tab 参数自动重定向到 `dashboard`

### 横屏重构

- 移除 `transform: rotate(90deg)` 方案（点击错位、滚动不自然），改为自然横屏检测 + `@media (orientation: landscape)` 响应式布局
- 横屏时单元格宽度自动 ×1.3，点击准确、滚动流畅
- 清理 100+ 行 CSS hack，替换为约 10 行媒体查询

### Service Worker 缓存策略

- 版本号升至 v2.2.0；`index.html` 改为网络优先策略，仅在离线时回退缓存
- 防止旧版路由逻辑导致冷/热启动行为不一致

---

## 2026-02-27 — 全面 Bug 修复

**审查范围**: 13 页面 + 6 lib + 7 组件 + 路由/入口/CSS/构建配置  
**统计**: 发现 40+ 问题，修复 24 项（P0×12 + P1×12）  
**构建/测试**: `vite build` ✅ | `tsc --noEmit` 零错误 | 72/72 测试全通过

### P0 崩溃级（12 项）

| # | 文件 | 问题 → 修复 |
|---|------|-------------|
| 1 | `AdminDashboard` | antd-mobile `Selector` 返回数组，提交前解包为字符串 |
| 2 | `SettingsPage` | Dialog 卸载后 DOM 查询失效 → 改 `onChange` 收集到 state |
| 3 | `TaskDetail` | 加载期间 `return null` 致空白 → 加 SpinLoading + 错误 UI |
| 4 | `ai-service` | 空响应崩溃 → 可选链 `json.choices?.[0]?.message?.content` |
| 5 | `App` | 无 404 兜底 → `<Route path="*">` 重定向 |
| 6 | `queryClient` | mutation `retry: 1` 致非幂等重复创建 → `retry: 0` |
| 7 | `Tasks` | members 含 undefined → `.filter(Boolean)` |
| 8 | `TaskDetail` | 空 deadline 显示 "Invalid Date" → 三元判断 |
| 9 | `MyTasks` | blocked 任务不属于任何 Tab → 归入"进行中" |
| 10 | `TaskCreate` | 员工可直接访问 → `useEffect` 中 `isManager()` 校验 |
| 11 | `api.ts` | 审计日志/通知无 catch → 全加 `.catch(console.error)` |
| 12 | `AIConsole` | API Key 日志泄露 → 移除敏感 console.log |

### P1 体验级（12 项）

- `ProjectKanban`/`MyProjects`: 加 loading/error UI + 重试
- `ReviewCenter`: reject 按钮加 `disabled={isPending}`
- `Home`: 滑动逻辑硬编码跳过 manager tab → 基于 tabs 数组动态计算
- `Notifications`: `unsubscribe('*')` 取消所有订阅 → 仅在已订阅时 cleanup
- `AdminDashboard`: 邮箱加正则校验，密码加 `min: 8`
- `index.css`: 移除 body 重复 safe-area padding；`min-height` 改 `100dvh`

### 数据库字段映射

6 张表（projects / tasks / handoffs / audit_logs / notifications / users）前端与 PocketBase 字段完全匹配；5 条核心数据流（任务创建、任务完成交接、审核交接、卡点上报、项目成员更新）已验证。

### 暂不修复项

- `@dnd-kit` core v6 / sortable v10 版本冲突
- AdminRoute 与 ManagerRoute 合并问题
- React.lazy 代码分割、实时订阅重连、AI Key 客户端暴露、非原子 mutation（均需架构级决策）

---

## 数据流问题分析与修复

### 登录与数据加载（5 项）

| 问题 | 根因 → 修复 |
|------|-------------|
| 输错密码没报错 | PB 用 `error.status` 而非 `error.response.code` → 统一判断 |
| 记住登录没记住 | 只存 username → 用 `rememberMe` 控制 localStorage/sessionStorage 持久化 |
| 登录后显示网络错误 | 旧失败缓存残留 → 登录成功后 `queryClient.clear()` |
| 横屏白屏 | `innerWidth > 768` 误判横屏手机为 PC → 宽度 + 触屏 + 高度综合判断 |
| 数据加载失败 | 未登录时 query 仍发请求致 401 → 所有查询加 `enabled: pb.authStore.isValid` |

### 「三处数据不一致」根因

- AdminDashboard 使用独立 `loadData()`（`getFullList`，不走 react-query），工作进展/经理工作台使用 `useProjects`/`useTasks`（react-query），**数据源分裂**
- 统计口径不统一：有的含归档项目，有的仅 active，有的取前 5 条
- 建议：AdminDashboard 改用 api 层 hooks 统一数据源；明确"项目总数"是全部还是活跃；时间轴逾期按项目维度聚合

### 复盘原则

1. **单一数据源** — 同类数据走同一 api 层 / queryKey
2. **统计口径一致** — "总数""进度"明确是全部还是仅活跃
3. **权限 + enabled** — 依赖登录态的请求统一加 `enabled: pb.authStore.isValid`
4. **登录后清缓存** — `queryClient.clear()` 避免旧身份残留
5. **改动即验证** — `tsc --noEmit` + `npm run test` + `npm run build`

---

## 测试与验收计划

### 当前测试覆盖

| 类型 | 状态 | 说明 |
|------|------|------|
| 单元测试 | ✅ 72 用例通过 | task-parser、api (isManagerRole)、queryClient |
| 组件测试 | ✅ 通过 | App、EmptyState、TaskCard |
| Hooks 集成 | ✅ 通过 | useProjects、useTask（Mock PB） |
| E2E | ⏳ 待补充 | Playwright 已配置，有基础 smoke spec |
| 手动全流程 | ⏳ 待执行 | 见下方场景清单 |

### 关键验收场景

- **认证**: 登录 / 注册 / 记住我 / 退出后不可回退
- **权限边界**: 员工无「管理」Tab，不可访问 `/manager`；经理保留管理入口
- **项目**: 分类筛选（全部/进行中/卡顿/已归档）、排序、归档/取消归档、成员管理
- **任务与看板**: 创建 → 看板拖拽 → SSE 实时刷新；批量编辑一次保存；员工仅可查看 + 上报卡点
- **时间轴**: 移动端布局对齐、横屏可用、数据与任务一致
- **通知与审批**: 变动全员通知 + SSE 即时推送；审批界面展示改动详情，支持筛选/已阅/通过
- **数据流自检**: 所有 mutation 后正确 `invalidateQueries`；Realtime 订阅覆盖 tasks/projects/notifications/audit_logs/handoffs/comments

### API Mutation 检查矩阵

核心 hooks（useUpdateTask、useMarkTaskComplete、useCreateTask、useDeleteTask、useDeleteProject、useUpdateProjectMembers、useBatchSaveTasks 等）均需满足：业务写库 + 通知 + 审计日志 + invalidateQueries。

### E2E 补充建议

- 员工权限隔离验证
- 经理全流程：创建项目 → 创建任务 → 看板拖拽 → 通知/审批记录
- 项目分类 Tab 切换与排序
- 时间轴移动端视口横屏

---

## 2026-05-16 — v3.0 - v3.04（夜间自主大改造）

> 详细每个 PR 与 bug 的复现/修复/验证记录已归档至
> `_archive/overnight_2026-05-16/`（含 12 份 agent 报告 + 4 份 round summary +
> postmortem）。本节为面向使用者的简明 changelog。

### 主要新增（v2.96 → v3.04）

**前端（React + Capacitor）：**
- **响应式 AppShell**（commit `4066882 + 6e4e971 + 02b95e7`）：桌面 `≥1024px` 启用 Sidebar+TopBar 三区布局；平板折叠 Sidebar；移动端透传保留底部 TabBar。
- **桌面任务表格 + 批量操作**（commit `773002c`）：TanStack Table v8 接管 MyTasks 桌面渲染，支持多选 + 批量"标记完成 / 删除"。
- **看板拖拽视觉增强**（commit `a486120`）：drag-over 状态加 1.4s 脉冲呼吸 + 32px 光晕。
- **通知一期收尾**（commit `b44395a + b39f7e9`）：抽离全局 `useNotificationAlerts` hook 统一处理 Toast / 振动 / 提示音 / 红闪 / 系统通知。
- **HybridAuthStore 安全 storage**（commit `a52ef15`）：子类化 PocketBase BaseAuthStore，rememberMe=1 时 token 进 localStorage，否则进 sessionStorage（关浏览器即清）。

**Android 原生（PR 2）：**
- **前台服务 + PocketBase SSE 长连**（commit `17f7fae`）：完全不依赖 Firebase/FCM，用 OkHttp 4.12 + okhttp-sse 实现后台保活推送。
- **国产 ROM 杀后台引导**：覆盖小米/华为/OPPO/vivo 共 12 家 ComponentName，详见 `docs/android-background-keepalive.md`。
- **Thread safety**（commit `09bd915`）：RealtimeService 字段 volatile + synchronized + AtomicInteger 防多线程访问竞态。

**后端 PocketBase：**
- **6 个 PB hooks 兜底层**（`backend/pb_hooks/`）：
  - `realtime.pb.js`：SSE idleTimeout 调到 30 分钟
  - `handoffs_status_sync.pb.js`：handoff approve/reject 自动同步 from_task.status + 清 blocker + 防重复 pending
  - `audit_logs_reject_sync.pb.js`：审计拒绝 mark_complete/mark_blocked/update_task 时自动回滚 + 取消 pending handoffs + rollback_to 联动恢复
  - `project_progress_sync.pb.js`：tasks create/update/delete 时自动重算 project.total_tasks/completed_tasks/progress
  - `llm_proxy.pb.js`：`POST /api/custom/llm-proxy` 代理 SiliconFlow 调用，API key 服务端存储不外泄
- **3 个新 migrations**：
  - `1772800000`：收紧 handoffs.updateRule + audit_logs.createRule（防越权 + 防伪造审计）
  - `1772900000`：收紧 handoffs.createRule (submitter=auth.id) + audit_logs.listRule (project.members 范围)
  - `1773000000`：创建 app_settings collection 存 LLM API key（admin/manager 可读写）

### 主要 bug 修复（按严重度）

**P0 业务流程（11 个）：**
- 任务删除不级联清理 handoffs / predecessor_tasks / notifications（`ad1bb79`）
- 项目删除不级联清理子表（`e6a91d2`）
- 批量"标记完成"不写 audit_log + 不通知项目成员（`631ef58 + 49398e1`）
- AdminDashboard.handleDeleteTask / handleProjectStatusChange 绕过 mutation（`1372a73`）
- TaskDetail.handleComplete 跳过 handoff（`ba25ace` 加 audit note 标记）
- handoffs.updateRule 越权漏洞 P0-3（`80e33d1`）

**HIGH（9 个）：**
- useApproveHandoff 不同步 from_task=completed（`bf0dc0a`）
- useRejectHandoff 不回滚 from_task=in_progress（`29e1a93`）
- 4 处 audit_logs.create silent catch 改 console.warn（`5e08b6f`）
- audit reject mark_complete 不取消 pending handoffs（`4ceb918`）
- audit reject mark_blocked 不回滚（`6b64b77`）
- handoffs.createRule 越权（任何登录用户能给别人 task 创建 handoff，`86cd6d4`）
- audit_logs.listRule 跨项目泄露（`86cd6d4`）
- C1 SiliconFlow API key 明文存 localStorage（`5be0d72` 改服务端代理）
- C2 不记住登录 token 残留 localStorage（`a52ef15` HybridAuthStore）

**MED/P2（7 个）：**
- useDeleteTask 不级联 / useDeleteProject 不级联（已计 P0-4/P0-5）
- useUnblockTask 不读 blocker.rollback_to + PB rule 403 静默吞掉（`6b64b77 + a96f59b`）
- useUpdateTaskSequence 不写 reorder_tasks audit（`c5a5c7f`）
- useMarkTaskBlocked 通知不去重不排自己（`4ceb918`）
- useApproveHandoff 给 submitter 发重复通知（`e889268`）
- ReviewCenter 无 URL ?tab= 深链（`1e10bc7`）
- 全局 query error 静默白屏（`edd8c5f` 加 Toast）
- 768 mobile_max 容器固定 430px 两侧空白（`a52ef15` 拆两段 media query）

### 架构 / 性能

- **Bundle 优化**（`2087f8a + 9dda0c6`）：路由级 React.lazy + 8 个 vendor manualChunks → 主 chunk gzip 由 474 KB 降至 46 KB（**-90%**）。
- **I9 项目进度字段维护**（`76afaf0`）：原 projects.total_tasks/completed_tasks/progress 写一次永不更新 → 加 PB hook + 一次性 Python 修复脚本，3 个 stale 项目数据修对。
- **PB Realtime SSE idleTimeout**：默认 5 分钟改 30 分钟，降低重连频率。

### 测试套件

新增 6 个独立 E2E test suite（`scripts/e2e_*.py`）：
- `e2e_business_flow.py` — 6 scenario 任务全流程
- `e2e_blocker_flow.py` — 5 scenario 卡点 blocker
- `e2e_edit_flow.py` — 5 scenario 编辑 / sequence
- `e2e_notification_flow.py` — 9 case 通知投递正确性
- `e2e_concurrent_flow.py` — 5 case 并发竞态
- `e2e_responsive_diff.py` — 35 截图（5 viewport × 7 page）

最后 `scripts/full_production_test.py` 跑了 32 个真实场景截图，全部归档至 `docs/superpowers/qa-screenshots/full_production_test/REPORT.md`。

### 总数据

- **58 个 commit**（自夜间起点 `e24c69c` 开始）
- **30+ 个 bug 修复**
- **6 个 PB hook + 3 个新 migration**
- **6 个 E2E test suite + 132 个单元测试**
- **Bundle 减重 -90% (gzip 主 chunk)**
- **APK v3.04**（versionCode 44 / 6.94 MB）

