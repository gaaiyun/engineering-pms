# EngineeringPMS v2.97 → v3.0 设计文档

**日期：** 2026-05-16
**作者：** Claude (with @gaaiyun)
**状态：** Draft → 待用户 Review
**项目：** EngineeringPMS（工程资料员协同软件）
**当前版本：** v2.96 → 目标 v3.0
**仓库：** gaaiyun/engineering-pms

---

## 1. 背景与目标

### 1.1 现状
v2.96 已迭代至 React 19 + Capacitor 5.7 + PocketBase 0.22 架构，Android APK 已发布。但存在两类核心问题：

1. **Android 消息提醒不闭环**：前台通知（Toast / 振动 / 红闪 / 三音调）已实现，但 App 在后台 / 锁屏 / 被系统清理后无法收到通知。client 已写好 push token 注册流程，但因决定**不引入 Firebase**，FCM 路径作废。
2. **桌面 Web 体验差**：同一份 React 代码以 `antd-mobile`（375px 设计）渲染在 ≥1080p 桌面屏上，大片留白、底部 Tab 导航低效、无表格视图、批量编辑用手机抽屉、无键盘操作。无法支撑工程资料员日常多任务协同。

### 1.2 目标
- **G1**：Android 在后台 / 锁屏 / 网络抖动场景下仍能可靠收到通知，不依赖 Firebase
- **G2**：桌面浏览器（≥1024px）切换到 PC 友好布局（侧边栏 + 主区 + 表格 + 批量操作 + 拖拽）
- **G3**：每一步改造可独立验证、可回滚，不影响 v2.96 现网用户

### 1.3 非目标（明确不做）
- iOS 适配（无环境）
- 键盘快捷键 / Cmd-K 命令面板（用户明确不要）
- 通知偏好设置 UI（v3.1 再说）
- 自定义工作流 / column-as-status（v3.1+）
- FCM / APNs 接入（用户明确不走）

---

## 2. 决策：技术 Approach

**选择 Approach A（稳健分批）**。备选 B（激进合并）和 C（先桌面再安卓）已评估排除。理由：
- 用户已优先要求收尾通知一期 → 分批契合
- v2.96 有现网用户 → 稳定性优先
- superpowers `verification-before-completion` 要求每步可验证

---

## 3. 子项目分解（6 个 PR）

```
PR 1 通知一期收尾 ─→ v2.97 APK 验证   [基础，必须先合]
   │
   ├─→ PR 2 Android 前台服务 + SSE 长连接 ─→ v2.98 APK
   │
   └─→ PR 3 响应式 AppShell           [桌面地基]
          │
          ├─→ PR 4 任务表格 + 批量操作
          └─→ PR 5 看板/甘特拖拽增强

PR 6 文档收尾（架构图 + 保活引导）   [任意时间合]
```

依赖关系：
- **PR 1** 必须先合
- **PR 2 与 PR 3** 可并行（一个 Android、一个 Web，互不冲突）
- **PR 4、PR 5** 依赖 PR 3
- **PR 6** 任意时间

---

## 4. 各 PR 详细设计

### PR 1：通知一期收尾（v2.96 → v2.97）

**目标：** 把当前 working tree 的 11 个未提交文件整理收口、调试通过、打 v2.97 APK 真机验证。

**改动范围：**
| 文件 | 性质 |
|---|---|
| `frontend/src/lib/useNotificationAlerts.ts` | **新增** — 全局通知 Hook |
| `frontend/src/App.tsx` | 挂载 `<GlobalNotificationProvider />` |
| `frontend/src/index.css` | 红闪 overlay 动画收尾 |
| `frontend/src/lib/api.ts` | `audit_logs` 缓存失效（3 处 mutation） |
| `frontend/src/pages/Home.tsx` 等 6 个页面 | 去除散落的通知触发逻辑，统一由 Hook 处理 |
| `frontend/android/app/build.gradle` | versionCode 36 / versionName 2.97 |

**关键设计：** `useNotificationAlerts` 在路由根挂载一次，监听 `unreadCount` 的**增量**（避免登录后所有未读都响）：

```typescript
if (unreadCount > prevUnreadRef.current) {
  const newCount = unreadCount - prevUnreadRef.current
  playNotificationSound()         // Web Audio 三音调
  scheduleNewMessageNotification(newCount)  // LocalNotifications（Capacitor）
  Toast.show(...)                  // antd-mobile Toast
  if (Notification.permission === 'granted') new Notification(...)  // Web Notification API
  navigator.vibrate([200,100,200,100,200])  // Vibration API
  window.dispatchEvent(new CustomEvent('notify-flash'))  // 触发红闪 overlay
}
```

**验收标准：**
- [ ] 浏览器：新通知触发 Toast + Web Notification + 红闪（振动取决于设备）
- [ ] Android 前台：触发系统通知 + 振动 + 三音调 + 红闪
- [ ] 登录瞬间不响（避开历史未读）
- [ ] 切换用户后计数器重置
- [ ] `npm run lint` 0 错误，`tsc --noEmit` 0 错误
- [ ] 主链路真机回归：登录 → 创建任务 → 指派 → 接收通知

**风险：**
- React StrictMode 双调用导致提示音播两次 → useEffect cleanup 处理
- AudioContext 在 iOS Safari 需用户手势激活 → 已有 `warmUpAudio` 兜底

---

### PR 2：Android 前台服务 + PocketBase Realtime 长连（v2.97 → v2.98）

> **⚠️ 2026-05-16 更新**：基于 `docs/superpowers/research/2026-05-16-pr2-tech-reference.md` 调研，本节设计已做 **6 处关键调整**（详见研究报告末尾"PR 2 设计调整建议"章节）：
> - **A. FGS 类型选 `dataSync`**（非 `specialUse`），承认 Android 15 的 6 小时上限
> - **B. 原生 OkHttp SSE**，不能在 WebView/JS SDK 里跑（Capacitor 5 在 STOPPED 时冻结 JS engine）
> - **C. 重连策略明确化**：1/2/4/8/16/30s + ±20% jitter + NetworkCallback 即时重连 + ≥10 次失败停服推通知
> - **D. 服务端配套不可省**：PB hooks 设 `idleTimeout=30min` + Nginx `proxy_read_timeout 1h; proxy_buffering off`
> - **E. 国产 ROM 引导独立流程**：12 家 OEM ComponentName 表 + 诊断按钮（见研究报告 §5）
> - **F. 前台 30s 轮询作 secondary 链路兜底**（SSE 静默断开时不漏消息）

**目标：** App 在后台 / 锁屏 / 被杀（部分）场景下仍能收到通知。完全不依赖 Firebase。

**架构：**
```
[PocketBase Server] ──SSE──→ [Capacitor Plugin: BackgroundListener]
       ↑                              │
       │ realtime subscribe            ▼
       │ collection: notifications    [Android ForegroundService.kt]
                                      │ holds long-lived SSE connection
                                      │ + WakeLock + 持久通知图标
                                      ▼
                                  收到事件 → LocalNotifications.schedule()
                                            → 振动 + 声音 + 弹通知栏
```

**实现要点：**

1. **新建 Capacitor Plugin** `frontend/android/app/src/main/java/com/engineering/pms/plugins/BackgroundListenerPlugin.kt`
   - 暴露 `start(userId, pbUrl, authToken)` / `stop()` 给 JS
   - 启动 `Intent` 拉起前台服务

2. **新建 ForegroundService** `BackgroundListenerService.kt`
   - 启动时 `startForeground(NOTIFICATION_ID, persistentNotification)` — 显示一个"运行中"持久通知图标，让系统 OOM killer 优先级降到最低
   - 使用 OkHttp EventSource 维持 SSE 长连，订阅 PocketBase Realtime API `/api/realtime`
   - 指数退避重连：1s → 2s → 4s → 8s → 30s（上限）
   - 收到 `notifications.create` 事件 → 通过 LocalNotifications 弹出系统通知
   - WakeLock 仅在收到事件后 30s 内持有，避免耗电

3. **JS 端整合**
   - 修改 `frontend/src/lib/pushNotifications.ts`：移除 FCM 注册分支，改为登录后调 `BackgroundListener.start()`，登出调 `stop()`
   - 移除 `VITE_ENABLE_PUSH_REGISTRATION` 环境变量（不再需要）

4. **AndroidManifest 权限**：
   ```xml
   <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
   <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" /> <!-- API 34+ -->
   <uses-permission android:name="android.permission.WAKE_LOCK" />
   <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" /> <!-- 开机自启 -->
   <service android:name=".plugins.BackgroundListenerService"
            android:foregroundServiceType="dataSync" />
   <receiver android:name=".plugins.BootReceiver" />
   ```

5. **国产 ROM 保活引导文档** `docs/android-background-keepalive.md`
   - 小米：MIUI → 应用信息 → 省电策略 → 无限制 + 自启动管理
   - 华为：EMUI → 应用启动管理 → 允许后台活动
   - OPPO/vivo：电池 → 后台运行管理 → 允许
   - 同时在 `Settings` 页面加一个"通知保活"卡片，点击跳转引导

**验收标准：**
- [ ] 锁屏 30 min 后服务端创建任务 → 手机收到通知
- [ ] 飞行模式 10 min → 恢复网络 → 补送期间通知
- [ ] 小米 / 华为 至少一台真机过：连续 8h 后台后仍能收
- [ ] 电量消耗：8h 后台 ≤ 5%（实测）

**风险与缓解：**
- ❗ 国产 ROM 强杀后台 → 用户必须配合加白名单；持久通知图标可挡 ~85% 杀进程
- ❗ Android 14+ FOREGROUND_SERVICE_DATA_SYNC 限制单次最长运行时间 → SSE 心跳超过限制时主动 stop + restart
- ❗ PocketBase Realtime 当前未限速 → 大量并发推送时需在 server hook 里 throttle（v3.1 处理）

---

### PR 3：响应式 AppShell（桌面地基）

**目标：** 同一份 React 代码，根据浏览器宽度切换 mobile / desktop 布局。不重写任何业务页面。

**关键文件：** 新增 `frontend/src/components/layout/AppShell.tsx`

**布局策略：**
```
< 768px (手机)        : 现有底部 Tab + 全屏页面
768-1023px (平板)     : 折叠 Sidebar（图标 only，64px 宽）+ 主区
≥ 1024px (桌面)       : 完整 Sidebar（240px 宽）+ 顶栏 + 主区
```

**Sidebar 项（≥1024px）：**
- 首页 · 任务 · 看板 · 甘特 · 审核中心 · 通知中心 · 我的项目 · 设置 · 管理后台（admin 显示）

**顶栏：** 项目切换器（左）· 全局搜索框（中）· 通知铃铛（红点未读数）· 用户头像菜单（右）

**实现要点：**
- 用 CSS Grid + `@media (min-width: 1024px)` 做布局，**不引入新依赖**
- 用 `window.matchMedia('(min-width: 1024px)').addEventListener('change', ...)` 监听断点变化
- 各业务页面（Home / Tasks / TaskDetail 等）在 AppShell 内渲染。**桌面端隐藏现有的顶部 NavBar 和返回按钮**（由 Sidebar 接管导航）
- 移动端 AppShell 渲染为透传容器（不改现状）

**验收标准：**
- [ ] 桌面 Chrome / Edge 1920×1080：Sidebar + 主区显示正常，无 1px 错位
- [ ] 拖动窗口宽度，布局在 768 / 1024 平滑切换
- [ ] 移动端真机：底部 Tab 仍工作，无视觉退化
- [ ] 现有 admin / settings / login 等所有路由可正常访问

**风险：**
- 现有页面有 `window.innerWidth > 768` 硬编码（如 Home.tsx）→ 收编到统一的 `useBreakpoint` Hook

---

### PR 4：任务表格视图 + 批量操作

**目标：** 桌面端默认表格视图，多选 + 批量改状态 / 指派 / 标签 / 导出。

**关键文件：**
- 新增 `frontend/src/pages/TasksTableView.tsx`
- 新增 `frontend/src/components/tasks/TasksBulkBar.tsx`
- 修改 `frontend/src/pages/Tasks.tsx`：桌面 fallback 到 TasksTableView，移动端保留卡片

**依赖：** `@tanstack/react-table` v8（bundle +~50KB）

**功能：**
- 列：编号 / 标题 / 项目 / 负责人 / 状态 / 起止日 / 操作
- 列头排序、列宽拖动
- 多选 checkbox（行首列）
- 内联编辑：状态 / 负责人下拉直接改
- 右键菜单：编辑 / 复制链接 / 删除 / 标记完成
- URL 同步过滤条件：`?status=in_progress&assignee=xxx&page=2`（参考 Kaneo）
- 顶部 Bulk Bar（多选后自动显示）：批量改状态、批量指派、批量打标签、导出 Excel（用 xlsx skill）

**验收标准：**
- [ ] 50 条任务批量改状态 < 2 秒
- [ ] 过滤条件可被 URL 持久化、可分享
- [ ] 内联改状态后实时同步 TanStack Query 缓存
- [ ] 移动端 Tasks.tsx 无退化

---

### PR 5：看板 / 甘特拖拽增强

**目标：** 提升 ProjectKanban 和 ProjectTimeline 的桌面操作体验。

**改动：**

1. **ProjectKanban.tsx：**
   - 拖卡片→改状态：增加落点高亮、乐观更新、失败回滚
   - 列内拖卡片：改优先级顺序（需后端 `tasks.sort_order` 字段，已存在则直接用）
   - 右键菜单：编辑 / 删除 / 复制链接 / 改优先级
   - Shift 多选 + 一起拖

2. **ProjectTimeline.tsx（甘特）：**
   - 拖左 / 右边缘 → 改起止日（实时回写 PB）
   - 拖整条 → 平移日期
   - 双击空白 → 创建任务

**全部基于 `@dnd-kit`**（已有依赖，不新增）。

**验收标准：**
- [ ] 桌面 Chrome / Edge 顺畅拖
- [ ] 触摸屏（pad）仍可拖（pointer events 兼容）
- [ ] 拖到一半网络失败 → 自动回滚 + Toast 提示

---

### PR 6：文档收尾

- 重写 `docs/notification-push-phase2.md`：移除 FCM / APNs 章节，替换为"前台服务 + SSE"架构图
- 新增 `docs/android-background-keepalive.md`：国产 ROM 保活引导（截图后补）
- 更新 `docs/产品完整文档_v2.3.md` → v3.0
- 更新 `docs/代码架构文档.md`：加 AppShell + ForegroundService 章节
- README 加 v3.0 badge

---

## 5. 测试策略

| 层级 | 工具 | 覆盖 |
|---|---|---|
| 单元测试 | Vitest | `useNotificationAlerts`、`pushNotifications`、`useBreakpoint` Hook |
| 集成测试 | Playwright（webapp-testing skill） | 登录 → 创建任务 → 接收通知主链路；表格批量操作；侧边栏切换 |
| Android 真机 | 手动 | PR 1 / PR 2 完成后各打一个 debug APK，至少一台小米 + 一台华为 |
| Lint / 类型 | ESLint + tsc --noEmit | 每个 PR 0 错误 |

**按 superpowers TDD skill：** PR 1 / PR 4 / PR 5 在写实现前先写测试（RED → GREEN → REFACTOR）。PR 2（原生层）写完后追加 mock 测试。PR 3 主要靠 Playwright 视觉回归。

---

## 6. 验证门禁（superpowers `verification-before-completion`）

每个 PR 在合并前必须：

```bash
cd frontend
npm run lint              # 0 errors
npx tsc --noEmit          # 0 errors
npm test                  # all green
npm run build             # success
# PR 涉及 android/ 的还要：
cd android && ./gradlew assembleDebug
```

任一项失败不准合 / 不准声称完成。

---

## 7. 时间线（粗估）

| 周次 | 任务 |
|---|---|
| W1 上半周 | PR 1 通知一期收尾 + v2.97 APK 真机回归 |
| W1 下半周 | PR 3 AppShell 完成（用户在浏览器尝鲜） |
| W2 | PR 2 Android 前台服务（并行进行）+ PR 4 任务表格 |
| W3 | PR 5 拖拽增强 + PR 6 文档收尾 + v3.0 总集成 |

总周期 ≈ 3 周。

---

## 8. 回滚策略

- 每个 PR 单独 commit + 打 tag（`v2.97` / `v2.98` / `v3.0-rc1` …）
- Android APK 全部保留（已有历史的 v2.90 → v2.96 都在仓库根目录）
- PocketBase migrations 不在本次设计内引入破坏性变更（无 down migration 需求）
- 出问题：回退到 `git reset --hard <last-good-tag>` + 重新打 APK

---

## 9. Spec → Plan 拆分约定

本文档是 **master design spec**，覆盖 6 个 PR。按 superpowers 流程，**每个 PR 独立由 `writing-plans` skill 产出自己的 implementation plan**（`docs/superpowers/plans/2026-05-XX-pr-N-<topic>.md`）。

执行顺序：
1. 用户 review 本 spec → 批准
2. invoke `writing-plans` → 为 PR 1 产出 plan
3. invoke `executing-plans`（或 `subagent-driven-development`）→ 执行 PR 1
4. PR 1 合并后回到 step 2，处理 PR 2，依次类推

---

## 10. 开放问题（v3.1+）

- 通知偏好 UI（全开 / 仅声音 / 仅振动 / 关闭）
- 自定义工作流（Kaneo column-as-status 模式）
- iOS 适配 + APNs
- PocketBase Realtime 限速 / 鉴权加固
- 桌面端 Cmd-K 命令面板（用户明确暂不要）

---

**End of design.**
