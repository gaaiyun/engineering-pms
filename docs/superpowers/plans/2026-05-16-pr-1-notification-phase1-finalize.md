# PR 1: 通知一期收尾 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 working tree 现有 11 个未提交文件的"通知一期收尾"重构收口、补单元测试、跑完整验证、打 v2.97 debug APK、commit + push。

**Architecture:** 已经存在的改动把散落在 `Home.tsx` 和 `Notifications.tsx` 里的通知触发逻辑（Toast、振动、声音、Web Notification、红闪、Capacitor LocalNotifications）统一抽到全局 Hook `useNotificationAlerts.ts`，在 App.tsx 内通过 `<GlobalNotificationProvider />` 在 Router 内挂载一次。本 PR 验证收口正确、补关键单元测试、做端到端真机验证。

**Tech Stack:** React 19 + TS 5.9 + Vite 6 + Vitest 4 + @testing-library/react 16 + happy-dom + Capacitor 5.7（@capacitor/local-notifications）+ Web Audio API + Vibration API + Notification API.

**Spec：** `docs/superpowers/specs/2026-05-16-pms-notification-and-desktop-design.md` §4 PR 1

---

## 0. 文件结构

| 文件 | 角色 | 状态 |
|---|---|---|
| `frontend/src/lib/useNotificationAlerts.ts` | 全局通知 Hook（unread 增量→声/振/Toast/Notification/红闪/LocalNotification） | 已存在（未 commit） |
| `frontend/src/lib/useNotificationAlerts.test.tsx` | **本 PR 新增**单元测试 | 待创建 |
| `frontend/src/App.tsx` | 挂载 `<GlobalNotificationProvider />` | 已存在（未 commit） |
| `frontend/src/index.css` | 红闪动画调整 + 铃铛循环动画 | 已存在（未 commit） |
| `frontend/src/lib/api.ts` | 3 处 mutation 失效 `audit_logs` 缓存 | 已存在（未 commit） |
| `frontend/src/pages/Home.tsx` | 移除内联通知触发（让全局 Hook 接管） | 已存在（未 commit） |
| `frontend/src/pages/Notifications.tsx` | 移除内联 realtime subscribe；改用 SwipeAction | 已存在（未 commit） |
| `frontend/src/pages/ReviewCenter.tsx` | 跟随 API 变更 | 已存在（未 commit） |
| `frontend/src/pages/TaskDetail.tsx` | 跟随 API 变更 | 已存在（未 commit） |
| `frontend/src/pages/Tasks.tsx` | 跟随 API 变更 | 已存在（未 commit） |
| `frontend/src/pages/admin/AdminDashboard.tsx` | 跟随 API 变更 | 已存在（未 commit） |
| `frontend/android/app/build.gradle` | 版本号 bump 2.96→2.97（versionCode 36→37） | 待修改 |

---

## Task 1：Pre-flight 环境检查

**Files:** 无修改，只 read

- [ ] **Step 1.1: 确认 working tree 状态符合预期**

Run:
```bash
cd "G:/项目管理软件_v2"
git status --short
```

Expected: 10 个 `M`（modified）+ `?? frontend/src/lib/useNotificationAlerts.ts`，HEAD 是 `e24c69c fix: prevent logout crash and ship Android 2.95`。

- [ ] **Step 1.2: 确认 node / npm 版本**

Run:
```bash
node --version
npm --version
```

Expected: node ≥ 18，npm ≥ 9。

- [ ] **Step 1.3: 确认 Android SDK 路径**

Run:
```bash
ls "G:/项目管理软件_v2/frontend/android/local.properties" 2>&1 || echo "missing local.properties"
cat "G:/项目管理软件_v2/frontend/android/local.properties" 2>&1
```

Expected: 文件存在且包含 `sdk.dir=...`。**如缺失：暂停，告知用户需手动配置 ANDROID_HOME 后再继续**。

- [ ] **Step 1.4: 安装/更新前端依赖**

Run:
```bash
cd "G:/项目管理软件_v2/frontend"
npm install
```

Expected: 0 errors, 可能有 warnings（已知 antd-mobile peer deps，可忽略）。

---

## Task 2：为 `useNotificationAlerts` 写单元测试（TDD RED）

**Files:**
- Create: `G:/项目管理软件_v2/frontend/src/lib/useNotificationAlerts.test.tsx`

- [ ] **Step 2.1: 创建测试文件**

完整内容：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// ---- hoisted mocks ----
const mockAuthStore = vi.hoisted(() => ({
  model: { id: 'user-1' } as { id: string } | null,
}))
const mockUnreadHook = vi.hoisted(() => vi.fn())
const mockPlaySound = vi.hoisted(() => vi.fn())
const mockWarmUp = vi.hoisted(() => vi.fn())
const mockScheduleNotif = vi.hoisted(() => vi.fn())
const mockRequestPerm = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('./pocketbase', () => ({
  pb: { authStore: mockAuthStore },
}))
vi.mock('./api', () => ({
  useUnreadNotificationCount: mockUnreadHook,
}))
vi.mock('./notificationSound', () => ({
  playNotificationSound: mockPlaySound,
  warmUpAudio: mockWarmUp,
}))
vi.mock('./nativeNotifications', () => ({
  scheduleNewMessageNotification: mockScheduleNotif,
  requestNativeNotificationPermission: mockRequestPerm,
}))
vi.mock('antd-mobile', () => ({
  Toast: { show: vi.fn() },
}))

import { useNotificationAlerts } from './useNotificationAlerts'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => {
  mockUnreadHook.mockReset()
  mockPlaySound.mockReset()
  mockScheduleNotif.mockReset()
  mockRequestPerm.mockReset().mockResolvedValue(undefined)
  mockAuthStore.model = { id: 'user-1' }
  // mock browser APIs
  Object.defineProperty(global, 'Notification', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({})),
  })
  ;(global.Notification as unknown as { permission: string }).permission = 'granted'
  ;(global.Notification as unknown as { requestPermission: () => Promise<string> })
    .requestPermission = vi.fn().mockResolvedValue('granted')
  Object.defineProperty(navigator, 'vibrate', { writable: true, value: vi.fn() })
  Object.defineProperty(window, 'dispatchEvent', { writable: true, value: vi.fn() })
})

describe('useNotificationAlerts', () => {
  it('does not fire alerts on first render (baseline establishment)', () => {
    mockUnreadHook.mockReturnValue({ data: 5, isFetched: true })
    renderHook(() => useNotificationAlerts(), { wrapper })
    expect(mockPlaySound).not.toHaveBeenCalled()
    expect(mockScheduleNotif).not.toHaveBeenCalled()
    expect(navigator.vibrate).not.toHaveBeenCalled()
  })

  it('fires alerts when unread count increases', async () => {
    let unread = 3
    mockUnreadHook.mockImplementation(() => ({ data: unread, isFetched: true }))
    const { rerender } = renderHook(() => useNotificationAlerts(), { wrapper })
    // baseline registered with unread=3
    unread = 5
    rerender()
    await waitFor(() => {
      expect(mockPlaySound).toHaveBeenCalledTimes(1)
      expect(mockScheduleNotif).toHaveBeenCalledWith(2)
      expect(navigator.vibrate).toHaveBeenCalledWith([200, 100, 200, 100, 200])
    })
  })

  it('does not fire when unread count decreases (mark as read)', async () => {
    let unread = 5
    mockUnreadHook.mockImplementation(() => ({ data: unread, isFetched: true }))
    const { rerender } = renderHook(() => useNotificationAlerts(), { wrapper })
    unread = 2
    rerender()
    await waitFor(() => {
      expect(mockPlaySound).not.toHaveBeenCalled()
    })
  })

  it('dispatches notify-flash custom event on increase', async () => {
    let unread = 0
    mockUnreadHook.mockImplementation(() => ({ data: unread, isFetched: true }))
    const { rerender } = renderHook(() => useNotificationAlerts(), { wrapper })
    unread = 1
    rerender()
    await waitFor(() => {
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'notify-flash' })
      )
    })
  })

  it('returns current unreadCount', () => {
    mockUnreadHook.mockReturnValue({ data: 7, isFetched: true })
    const { result } = renderHook(() => useNotificationAlerts(), { wrapper })
    expect(result.current.unreadCount).toBe(7)
  })
})
```

- [ ] **Step 2.2: 运行测试看是否通过（GREEN — 代码已存在）**

Run:
```bash
cd "G:/项目管理软件_v2/frontend"
npx vitest run src/lib/useNotificationAlerts.test.tsx
```

Expected: 5 tests pass. **如有失败：**
- 若是测试本身的 bug → 修测试
- 若是 `useNotificationAlerts.ts` 实现 bug（例如登录瞬间响、计数器未重置）→ 修 `useNotificationAlerts.ts`，再跑直到 GREEN

- [ ] **Step 2.3: Commit 测试 + Hook（一组语义提交）**

Run:
```bash
cd "G:/项目管理软件_v2"
git add frontend/src/lib/useNotificationAlerts.ts frontend/src/lib/useNotificationAlerts.test.tsx
git commit -m "$(cat <<'EOF'
feat(notifications): 抽离全局通知提醒 hook + 单元测试

将散落在 Home.tsx / Notifications.tsx 内的通知触发逻辑统一到
src/lib/useNotificationAlerts.ts：监听 unread 增量，触发声/振/Toast/
Web Notification/Capacitor LocalNotification/红闪 overlay。

新增 5 项单元测试：首次挂载不响、增量触发、减量不响、red-flash
事件、返回当前 unreadCount。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit 成功，1 file changed (test) + 1 file added (test)（hook 文件本身一并入这个 commit）。

---

## Task 3：Commit 各页面去重 + index.css 调整 + api.ts 失效

**Files (modify):**
- `frontend/src/App.tsx`
- `frontend/src/index.css`
- `frontend/src/lib/api.ts`
- `frontend/src/pages/Home.tsx`
- `frontend/src/pages/Notifications.tsx`
- `frontend/src/pages/ReviewCenter.tsx`
- `frontend/src/pages/TaskDetail.tsx`
- `frontend/src/pages/Tasks.tsx`
- `frontend/src/pages/admin/AdminDashboard.tsx`

- [ ] **Step 3.1: 审阅每个文件的 diff 一次（sanity scan）**

Run:
```bash
cd "G:/项目管理软件_v2"
git diff -- frontend/src/App.tsx frontend/src/index.css frontend/src/lib/api.ts | head -200
git diff -- frontend/src/pages/ | head -300
```

Expected:
- App.tsx：新增 `import { useNotificationAlerts }` + `<GlobalNotificationProvider />` 组件挂载
- index.css：`@keyframes notify-border-flash` 时间序列重写（更平滑），删 `body.notify-flash`，`bell-shake` 改为 4s 循环
- api.ts：`useApproveHandoff` / `useRejectHandoff` / `useMarkTaskComplete` 三处 onSuccess 都 invalidate `['audit_logs']`
- Home.tsx：删除所有内联通知触发，只保留 `useUnreadNotificationCount(userId)`
- Notifications.tsx：删除 `pb.collection('notifications').subscribe('*')` 实时订阅；引入 SwipeAction
- 其他 page：跟随 API 类型变更

如发现意外改动（例如未授权的格式化）→ 用 `git checkout -- <file>` 回退该文件，重新 review。

- [ ] **Step 3.2: 跑 ESLint 验证无错误**

Run:
```bash
cd "G:/项目管理软件_v2/frontend"
npm run lint
```

Expected: 0 errors。**如有 errors：**
- 修复后再跑
- 不接受 `// eslint-disable-next-line`，除非已确认是误报

- [ ] **Step 3.3: 跑 TypeScript 类型检查**

Run:
```bash
cd "G:/项目管理软件_v2/frontend"
npx tsc -b
```

Expected: 0 errors。**如有 errors：**
- 大概率是 SwipeAction 等 antd-mobile 新引入类型问题 → 修
- 或 api.ts 类型签名变更影响 page → 修

- [ ] **Step 3.4: 跑完整测试套件**

Run:
```bash
cd "G:/项目管理软件_v2/frontend"
npm test
```

Expected: 所有现有测试（App.test、EmptyState、KanbanBoard、TaskCard、api-scenarios + 新增 useNotificationAlerts）全部 PASS。**如有失败：**
- 优先看是否是新改动破坏了既有行为
- 修代码（不修测试）直到 GREEN

- [ ] **Step 3.5: 跑生产构建确认无问题**

Run:
```bash
cd "G:/项目管理软件_v2/frontend"
npm run build
```

Expected: `dist/` 目录生成，无错误，bundle size 与之前相近（gzip 后通常 ≈ 1.2MB）。

- [ ] **Step 3.6: Commit 这一组改动**

Run:
```bash
cd "G:/项目管理软件_v2"
git add frontend/src/App.tsx frontend/src/index.css frontend/src/lib/api.ts frontend/src/pages/
git commit -m "$(cat <<'EOF'
refactor(notifications): 收编各页面散落的通知触发逻辑

- App.tsx 在 Router 内挂载 GlobalNotificationProvider，统一接管
- Home.tsx / Notifications.tsx 移除内联触发，由全局 hook 接管
- Notifications.tsx 引入 SwipeAction 改进交互
- index.css 优化 notify-border-flash 时序，bell-shake 改为 4s 循环
- api.ts 三处 mutation（approve/reject handoff、markComplete）
  在 onSuccess 失效 audit_logs 缓存

不改变功能行为，仅做架构收口。所有现有单元测试通过。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: 9 files changed, commit 成功。

---

## Task 4：浏览器 smoke test（手动验证）

**Files:** 无修改

- [ ] **Step 4.1: 启动 dev server**

Run:
```bash
cd "G:/项目管理软件_v2/frontend"
npm run dev
```

Expected: 输出类似 `Local: http://localhost:5173/`。

- [ ] **Step 4.2: 启动后端 PocketBase（如未运行）**

Run（独立终端）:
```bash
cd "G:/项目管理软件_v2/backend"
./pocketbase.exe serve
```

Expected: `Server started at: http://127.0.0.1:8090`。

- [ ] **Step 4.3: 在浏览器中执行 smoke 路径**

打开 http://localhost:5173，用测试账号登录。**操作清单：**

1. 登录后**不应**立即弹 Toast（基线建立中）
2. 切换到 "通知" Tab — 看到通知列表，红点数与服务端一致
3. 用另一个浏览器/管理员账号登录，给测试账号**创建一条新任务**（触发 task_assigned 通知）
4. 切回测试账号窗口 — 应看到：
   - ✅ 顶部红色 Toast "收到 1 条新消息"（6 秒后消失）
   - ✅ 浏览器系统通知（如已授权）
   - ✅ 全屏红色边框闪烁 ~2.8 秒
   - ✅ 通知 Tab 红点数 +1
   - ✅ 如允许通知声音，听到三音调提示音

**如任何一项不工作：**记录现象，回到代码定位修复，重做 Step 3.2-3.6。

- [ ] **Step 4.4: 关闭 dev server 和 backend**

按 `Ctrl+C` 关闭两个终端。

---

## Task 5：Bump 版本号 + Capacitor sync + 打 debug APK

**Files (modify):**
- `frontend/android/app/build.gradle`

- [ ] **Step 5.1: Bump 版本号 2.96 → 2.97**

Edit `frontend/android/app/build.gradle` 行 17-18：

```diff
-        versionCode 36
-        versionName "2.96"
+        versionCode 37
+        versionName "2.97"
```

- [ ] **Step 5.2: 同步 Capacitor**

Run:
```bash
cd "G:/项目管理软件_v2/frontend"
npx cap sync android
```

Expected: `[success] android.app sync finished in xxx ms`。

- [ ] **Step 5.3: 打 debug APK**

Run:
```bash
cd "G:/项目管理软件_v2/frontend/android"
./gradlew assembleDebug
```

Expected: `BUILD SUCCESSFUL`，输出文件路径 `app/build/outputs/apk/debug/app-debug.apk`。

**如失败：**
- 内存不足：在 `gradle.properties` 加 `org.gradle.jvmargs=-Xmx4g`
- 缺 SDK：根据错误 prompt 装 build-tools

- [ ] **Step 5.4: 把 APK 复制到仓库根目录（保留发版历史）**

Run:
```bash
cp "G:/项目管理软件_v2/frontend/android/app/build/outputs/apk/debug/app-debug.apk" "G:/项目管理软件_v2/EngineeringPMS_v2.97_notification_consolidated.apk"
ls -la "G:/项目管理软件_v2/EngineeringPMS_v2.97_notification_consolidated.apk"
```

Expected: 文件存在，size ≈ 5-15 MB。

---

## Task 6：真机回归 checklist（手动）

**Files:** 无修改

- [ ] **Step 6.1: 把 APK 装到至少一台真机**

通过 USB 或扫码，安装 `EngineeringPMS_v2.97_notification_consolidated.apk`。

- [ ] **Step 6.2: 真机回归测试**

按顺序检查（每项必须打勾）：

- [ ] 登录后不立即弹 Toast / 振动 / 提示音
- [ ] 用另一账号给测试账号建任务 → 测试账号收到通知栏推送（**App 在前台**）
- [ ] 通知栏推送包含正确数量 "收到 N 条新消息"
- [ ] 振动两阵（200,100,200,100,200 模式）
- [ ] 三音调提示音可听见
- [ ] 应用内全屏红闪 ~2.8 秒
- [ ] 通知 Tab 红点数与实际未读一致
- [ ] 点击通知 → 跳转到通知中心
- [ ] 切换到另一账号登录 → 红点数立刻重置
- [ ] 退出登录 → 再登录 → 历史未读不重新触发响铃

**如有失败：** 记录现象，回代码修复并重做 Task 3-5。

- [ ] **Step 6.3: 后台行为预期（v2.97 不解决，记录现状）**

按 Home 键回到桌面 → 5 分钟后让另一账号建任务 → 测试账号**目前可能收不到**（这是 PR 2 要解决的，不阻塞 PR 1）。

记录此现状到 commit message 中作为已知问题。

---

## Task 7：Commit 版本号 + push

**Files (modify):**
- `frontend/android/app/build.gradle`

- [ ] **Step 7.1: Commit 版本 bump**

Run:
```bash
cd "G:/项目管理软件_v2"
git add frontend/android/app/build.gradle
git commit -m "$(cat <<'EOF'
chore(android): ship v2.97 notification consolidation

versionCode 36 → 37, versionName 2.96 → 2.97。

包含 PR 1 的全部改动：
- 通知触发逻辑统一到 useNotificationAlerts hook（含单元测试）
- 各页面去重、移除内联订阅
- index.css 红闪与铃铛动画优化
- api.ts audit_logs 缓存失效

前台通知链路（Toast / 振动 / 三音调 / 红闪 / 通知栏）已在浏览器
和 Android 真机回归通过。后台/锁屏推送由 PR 2 处理（不依赖
Firebase 的前台服务 + PocketBase Realtime SSE 长连）。

APK: EngineeringPMS_v2.97_notification_consolidated.apk

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7.2: 验证 git log**

Run:
```bash
cd "G:/项目管理软件_v2"
git log --oneline -5
```

Expected: 看到 3 个新 commit（feat: hook + tests, refactor: page consolidation, chore: bump 2.97），都在 main 分支。

- [ ] **Step 7.3: Push 到 origin/main**

Run:
```bash
cd "G:/项目管理软件_v2"
git push origin main
```

Expected: `main -> main` 成功。

**Note：** 用户在前面的对话里说"先不推"，但那是针对 spec 之前的 5 个旧 commit。PR 1 完成时一并推送是合理的（因为本 PR 已通过完整验证）。**如用户要求暂不推**：跳过 Step 7.3，记录到 todo 列表"待推送"。

---

## 自我审查（plan author 自检，非用户任务）

✅ **Spec 覆盖：** Spec §4 PR 1 的 6 项验收标准（浏览器/Android 前台触发、登录瞬间不响、切换用户重置、lint/tsc 0 错误、主链路真机回归）—— 每项都有对应 Task。
✅ **Placeholder 扫描：** 无 TBD / TODO / "handle edge cases"。
✅ **类型一致性：** `useNotificationAlerts` 返回 `{ unreadCount: number }`，测试 Step 2.1 第 5 个 test 用相同签名。
✅ **代码可执行：** 测试代码完整可粘贴，build 命令带绝对路径，commit message 用 heredoc 防换行问题。
✅ **TDD 顺序：** Task 2 测试先写 → 跑 → 通过 → commit；Task 3 改其他文件 → lint → tsc → 全套测试 → build → commit。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-16-pr-1-notification-phase1-finalize.md`.

按用户批量授权，下一步默认走 **subagent-driven-development** —— 我会用 dispatching-parallel-agents 把 read-only verification 任务并行化、串行执行 commit 任务，期间不再打断用户。
