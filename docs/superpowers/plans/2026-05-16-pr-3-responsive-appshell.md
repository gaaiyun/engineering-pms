# PR 3: 响应式 AppShell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给桌面浏览器（≥1024px）切换成 Sidebar + 顶栏 + 主区布局；769-1023px 折叠 Sidebar；<768px 保持现有底部 Tab。不重写任何业务页面，只加一层外壳。

**Architecture:** 新建 `AppShell` 组件包裹所有受保护路由。通过 `matchMedia` 监听断点变化，渲染 `Sidebar` + `TopBar` + `<Outlet />`。移动端 AppShell 渲染为透传容器。所有现有路由保持不变。

**Tech Stack:** React 19 + TS + AntD Mobile 5（不引入新 UI 库）+ matchMedia API + react-router-dom v7 Outlet 模式 + CSS Grid + 现有 react-icons。

**Spec：** `docs/superpowers/specs/2026-05-16-pms-notification-and-desktop-design.md` §4 PR 3

---

## 0. 文件结构

| 文件 | 角色 | 状态 |
|---|---|---|
| `frontend/src/lib/useBreakpoint.ts` | matchMedia 断点 hook | 新建 |
| `frontend/src/lib/useBreakpoint.test.ts` | hook 单元测试 | 新建 |
| `frontend/src/components/layout/AppShell.tsx` | 桌面/移动布局切换容器 | 新建 |
| `frontend/src/components/layout/AppShell.test.tsx` | shell 测试 | 新建 |
| `frontend/src/components/layout/Sidebar.tsx` | 桌面侧边栏（≥1024 完整 / 769-1023 折叠） | 新建 |
| `frontend/src/components/layout/TopBar.tsx` | 顶栏（项目切换 / 搜索 / 通知铃 / 用户菜单） | 新建 |
| `frontend/src/components/layout/index.ts` | 桶导出 | 新建 |
| `frontend/src/components/layout/AppShell.module.css` | shell 局部样式 | 新建 |
| `frontend/src/App.tsx` | 把受保护路由包入 AppShell（用 Outlet） | 修改 |

**关键设计：**
- AppShell 不替代 Home.tsx 的 TabBar — 移动端继续用 TabBar，仅桌面接管导航
- Sidebar 项目用现有 react-icons（IoHomeOutline / IoListOutline / IoCheckboxOutline / IoNotificationsOutline 等），跟现有 Home.tsx 视觉一致
- 用 `data-bp` 属性 + CSS 媒体查询双重控制，确保 SSR-safe

---

## Task 1: useBreakpoint Hook (TDD)

**Files:**
- Create: `frontend/src/lib/useBreakpoint.ts`
- Create: `frontend/src/lib/useBreakpoint.test.ts`

- [ ] **Step 1.1: 写失败测试**

完整内容写入 `frontend/src/lib/useBreakpoint.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBreakpoint, type Breakpoint } from './useBreakpoint'

// matchMedia 在 happy-dom 中默认不存在 — 必须 mock
type Listener = (e: { matches: boolean }) => void

class FakeMQL {
  matches: boolean
  private listeners: Listener[] = []
  constructor(matches: boolean) { this.matches = matches }
  addEventListener(_: string, cb: Listener) { this.listeners.push(cb) }
  removeEventListener(_: string, cb: Listener) {
    this.listeners = this.listeners.filter(l => l !== cb)
  }
  trigger(matches: boolean) {
    this.matches = matches
    this.listeners.forEach(l => l({ matches }))
  }
}

let fakeQueries: Map<string, FakeMQL>

beforeEach(() => {
  fakeQueries = new Map()
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => {
      const existing = fakeQueries.get(query)
      if (existing) return existing
      const mql = new FakeMQL(false)
      fakeQueries.set(query, mql)
      return mql
    }),
  })
})

afterEach(() => {
  fakeQueries.clear()
})

function setWindowWidth(width: number) {
  // 设置基础查询的匹配结果
  const desktop = fakeQueries.get('(min-width: 1024px)')
  const tablet = fakeQueries.get('(min-width: 769px)')
  if (desktop) desktop.trigger(width >= 1024)
  if (tablet) tablet.trigger(width >= 769)
}

describe('useBreakpoint', () => {
  it('returns "mobile" when both queries do not match', () => {
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toBe<Breakpoint>('mobile')
  })

  it('returns "tablet" when tablet query matches but desktop does not', () => {
    const { result } = renderHook(() => useBreakpoint())
    act(() => setWindowWidth(800))
    expect(result.current).toBe<Breakpoint>('tablet')
  })

  it('returns "desktop" when desktop query matches', () => {
    const { result } = renderHook(() => useBreakpoint())
    act(() => setWindowWidth(1280))
    expect(result.current).toBe<Breakpoint>('desktop')
  })

  it('updates when window resizes from mobile to desktop', () => {
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toBe('mobile')
    act(() => setWindowWidth(1920))
    expect(result.current).toBe('desktop')
  })

  it('cleans up listeners on unmount', () => {
    const { unmount } = renderHook(() => useBreakpoint())
    const mql = fakeQueries.get('(min-width: 1024px)')!
    const removeSpy = vi.spyOn(mql, 'removeEventListener')
    unmount()
    expect(removeSpy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 1.2: 运行 — 预期失败（模块不存在）**

```bash
cd "G:/项目管理软件_v2/frontend"
npx vitest run src/lib/useBreakpoint.test.ts
```

Expected: FAIL with "Cannot find module './useBreakpoint'"

- [ ] **Step 1.3: 实现 hook**

完整写入 `frontend/src/lib/useBreakpoint.ts`：

```typescript
import { useEffect, useState } from 'react'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

const DESKTOP_QUERY = '(min-width: 1024px)'
const TABLET_QUERY = '(min-width: 769px)'

function detect(): Breakpoint {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'mobile'  // SSR fallback
  }
  if (window.matchMedia(DESKTOP_QUERY).matches) return 'desktop'
  if (window.matchMedia(TABLET_QUERY).matches) return 'tablet'
  return 'mobile'
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(detect)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const desktop = window.matchMedia(DESKTOP_QUERY)
    const tablet = window.matchMedia(TABLET_QUERY)

    const update = () => setBp(detect())
    desktop.addEventListener('change', update)
    tablet.addEventListener('change', update)
    return () => {
      desktop.removeEventListener('change', update)
      tablet.removeEventListener('change', update)
    }
  }, [])

  return bp
}
```

- [ ] **Step 1.4: 运行 — 预期通过**

```bash
npx vitest run src/lib/useBreakpoint.test.ts
```

Expected: 5 tests pass

- [ ] **Step 1.5: Commit**

```bash
cd "G:/项目管理软件_v2"
git add frontend/src/lib/useBreakpoint.ts frontend/src/lib/useBreakpoint.test.ts
git commit -m "$(cat <<'EOF'
feat(layout): add useBreakpoint hook for responsive design

监听 matchMedia (min-width: 1024px) 和 (min-width: 769px)，返回
'mobile' | 'tablet' | 'desktop'。SSR-safe（window 不存在时返回 mobile）。
5 项单元测试覆盖初始值、断点切换、unmount 清理。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Sidebar 组件

**Files:**
- Create: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 2.1: 写 Sidebar 组件**

```tsx
import { NavLink, useLocation } from 'react-router-dom'
import {
  IoHomeOutline, IoListOutline, IoAppsOutline,
  IoCalendarOutline, IoCheckmarkDoneOutline,
  IoNotificationsOutline, IoBriefcaseOutline,
  IoSettingsOutline, IoShieldCheckmarkOutline,
} from 'react-icons/io5'
import { pb } from '../../lib/pocketbase'

interface SidebarProps {
  collapsed: boolean
}

interface NavItem {
  to: string
  label: string
  icon: typeof IoHomeOutline
  adminOnly?: boolean
}

const ITEMS: NavItem[] = [
  { to: '/app', label: '首页', icon: IoHomeOutline },
  { to: '/my-tasks', label: '我的任务', icon: IoListOutline },
  { to: '/my-projects', label: '我的项目', icon: IoBriefcaseOutline },
  { to: '/review-center', label: '审核中心', icon: IoCheckmarkDoneOutline, adminOnly: true },
  { to: '/notifications', label: '通知', icon: IoNotificationsOutline },
  { to: '/settings', label: '设置', icon: IoSettingsOutline },
  { to: '/admin', label: '管理后台', icon: IoShieldCheckmarkOutline, adminOnly: true },
]

export function Sidebar({ collapsed }: SidebarProps) {
  const location = useLocation()
  const role = (pb.authStore.model as { role?: string } | null)?.role?.toLowerCase()
  const isAdmin = role === 'admin' || role === 'manager'

  const visibleItems = ITEMS.filter(it => !it.adminOnly || isAdmin)

  return (
    <nav
      aria-label="主导航"
      data-collapsed={collapsed}
      style={{
        width: collapsed ? 64 : 240,
        height: '100%',
        background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 200ms ease',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div style={{
        padding: collapsed ? '20px 12px' : '20px 16px',
        fontSize: 20,
        fontWeight: 800,
        letterSpacing: 0.5,
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <IoAppsOutline size={24} />
        {!collapsed && <span>EngineeringPMS</span>}
      </div>
      <div style={{ flex: 1, paddingTop: 8 }}>
        {visibleItems.map(item => {
          const Icon = item.icon
          const active = location.pathname === item.to
            || (item.to === '/app' && location.pathname.startsWith('/app'))
          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: collapsed ? '12px 20px' : '12px 16px',
                color: active ? '#fff' : '#cbd5e1',
                background: active ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
                borderLeft: active ? '3px solid #6366f1' : '3px solid transparent',
                textDecoration: 'none',
                fontWeight: active ? 600 : 500,
                fontSize: 14,
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={20} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
```

- [ ] **Step 2.2: 验证 tsc 通过**

```bash
cd "G:/项目管理软件_v2/frontend"
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 2.3: Commit**

```bash
cd "G:/项目管理软件_v2"
git add frontend/src/components/layout/Sidebar.tsx
git commit -m "feat(layout): add Sidebar component (collapsible)

桌面左侧导航：≥1024px 完整模式（240px 宽）/ 769-1023px 折叠（64px
图标 only）。7 项导航（首页/任务/项目/审核/通知/设置/管理），admin/
manager 才显示审核中心和管理后台。沿用现有 react-icons 与 Home.tsx
深色侧栏风格保持视觉一致。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

## Task 3: TopBar 组件

**Files:**
- Create: `frontend/src/components/layout/TopBar.tsx`

- [ ] **Step 3.1: 写 TopBar 组件**

```tsx
import { useNavigate } from 'react-router-dom'
import { IoNotificationsOutline, IoSearchOutline, IoPersonCircleOutline } from 'react-icons/io5'
import { Badge } from 'antd-mobile'
import { useNotificationAlerts } from '../../lib/useNotificationAlerts'
import { pb } from '../../lib/pocketbase'

export function TopBar() {
  const navigate = useNavigate()
  const { unreadCount } = useNotificationAlerts()
  const user = pb.authStore.model as { name?: string; username?: string } | null
  const displayName = user?.name || user?.username || '用户'

  return (
    <header style={{
      height: 56,
      flexShrink: 0,
      background: '#fff',
      borderBottom: '1px solid #e2e8f0',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      gap: 16,
      boxShadow: '0 1px 2px rgba(0,0,0,.04)',
    }}>
      {/* 搜索（占位，后续 PR 接 cmdk） */}
      <div style={{
        flex: '0 1 480px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: '#f1f5f9',
        borderRadius: 8,
        color: '#94a3b8',
      }}>
        <IoSearchOutline size={18} />
        <span style={{ fontSize: 13 }}>搜索任务、项目、通知…（敬请期待）</span>
      </div>

      <div style={{ flex: 1 }} />

      <button
        type="button"
        onClick={() => navigate('/notifications')}
        aria-label={unreadCount > 0 ? `通知 ${unreadCount} 条未读` : '通知'}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 6,
          cursor: 'pointer',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Badge content={unreadCount > 0 ? unreadCount : null}>
          <IoNotificationsOutline size={24} color="#475569" />
        </Badge>
      </button>

      <button
        type="button"
        onClick={() => navigate('/settings')}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 6,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <IoPersonCircleOutline size={28} color="#475569" />
        <span style={{ fontSize: 14, color: '#0f172a', fontWeight: 500 }}>{displayName}</span>
      </button>
    </header>
  )
}
```

- [ ] **Step 3.2: tsc check**

```bash
cd "G:/项目管理软件_v2/frontend"
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3.3: Commit**

```bash
cd "G:/项目管理软件_v2"
git add frontend/src/components/layout/TopBar.tsx
git commit -m "feat(layout): add TopBar with search placeholder + notification bell + user menu

桌面顶栏：搜索框占位（cmdk 后续 PR 接入）/ 通知铃（接 useNotificationAlerts
unreadCount 显示红点徽章）/ 用户菜单跳设置页。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

## Task 4: AppShell 容器

**Files:**
- Create: `frontend/src/components/layout/AppShell.tsx`
- Create: `frontend/src/components/layout/index.ts`

- [ ] **Step 4.1: 写 AppShell**

完整写入 `frontend/src/components/layout/AppShell.tsx`：

```tsx
import { Outlet } from 'react-router-dom'
import { useBreakpoint } from '../../lib/useBreakpoint'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppShell() {
  const bp = useBreakpoint()

  // 移动端 / 平板初始：透传，不接管布局（Home.tsx 自己渲染 TabBar）
  if (bp === 'mobile') {
    return <Outlet />
  }

  const collapsed = bp === 'tablet'

  return (
    <div
      data-shell="desktop"
      style={{
        display: 'grid',
        gridTemplateColumns: `${collapsed ? 64 : 240}px 1fr`,
        gridTemplateRows: '56px 1fr',
        gridTemplateAreas: '"sidebar topbar" "sidebar main"',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
      }}
    >
      <div style={{ gridArea: 'sidebar' }}>
        <Sidebar collapsed={collapsed} />
      </div>
      <div style={{ gridArea: 'topbar' }}>
        <TopBar />
      </div>
      <main style={{
        gridArea: 'main',
        overflow: 'auto',
        background: '#f8fafc',
      }}>
        <Outlet />
      </main>
    </div>
  )
}
```

完整写入 `frontend/src/components/layout/index.ts`：

```typescript
export { AppShell } from './AppShell'
export { Sidebar } from './Sidebar'
export { TopBar } from './TopBar'
```

- [ ] **Step 4.2: 写 AppShell 单元测试**

完整写入 `frontend/src/components/layout/AppShell.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const mockBp = vi.hoisted(() => vi.fn())
vi.mock('../../lib/useBreakpoint', () => ({
  useBreakpoint: mockBp,
}))

vi.mock('../../lib/pocketbase', () => ({
  pb: { authStore: { model: { id: 'u1', name: 'Tester', role: 'admin' } } },
}))

vi.mock('../../lib/useNotificationAlerts', () => ({
  useNotificationAlerts: () => ({ unreadCount: 3 }),
}))

vi.mock('antd-mobile', () => ({
  Badge: ({ children, content }: { children: React.ReactNode; content: unknown }) => (
    <span data-testid="badge" data-content={String(content)}>{children}</span>
  ),
}))

import { AppShell } from './AppShell'

function renderShell(initialEntries = ['/app']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/app" element={<div data-testid="content">CONTENT</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  mockBp.mockReset()
})

describe('AppShell', () => {
  it('renders only Outlet on mobile (no sidebar)', () => {
    mockBp.mockReturnValue('mobile')
    renderShell()
    expect(screen.getByTestId('content')).toBeInTheDocument()
    expect(screen.queryByLabelText('主导航')).not.toBeInTheDocument()
  })

  it('renders sidebar + topbar on tablet (collapsed)', () => {
    mockBp.mockReturnValue('tablet')
    renderShell()
    const nav = screen.getByLabelText('主导航')
    expect(nav).toBeInTheDocument()
    expect(nav).toHaveAttribute('data-collapsed', 'true')
  })

  it('renders sidebar + topbar on desktop (expanded)', () => {
    mockBp.mockReturnValue('desktop')
    renderShell()
    const nav = screen.getByLabelText('主导航')
    expect(nav).toHaveAttribute('data-collapsed', 'false')
  })

  it('shows notification badge with unread count', () => {
    mockBp.mockReturnValue('desktop')
    renderShell()
    expect(screen.getByTestId('badge')).toHaveAttribute('data-content', '3')
  })

  it('renders admin-only items when user is admin', () => {
    mockBp.mockReturnValue('desktop')
    renderShell()
    expect(screen.getByText('管理后台')).toBeInTheDocument()
    expect(screen.getByText('审核中心')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4.3: 运行所有 layout 测试**

```bash
cd "G:/项目管理软件_v2/frontend"
npx vitest run src/components/layout/ src/lib/useBreakpoint.test.ts
```

Expected: 10 tests pass total (5 useBreakpoint + 5 AppShell)

- [ ] **Step 4.4: Commit**

```bash
cd "G:/项目管理软件_v2"
git add frontend/src/components/layout/
git commit -m "$(cat <<'EOF'
feat(layout): add AppShell container with breakpoint-driven layout

桌面端 (≥1024px) 和平板 (769-1023px) 渲染 Sidebar+TopBar+Outlet
布局；移动端 (<768px) 透传 Outlet，不接管现有 Home.tsx TabBar。
平板折叠 Sidebar 为 64px 图标 only，桌面展开 240px 完整模式。
用 CSS Grid 实现，0 新依赖。

5 项单元测试覆盖三个断点 + 通知红点徽章 + admin 项可见性。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 接入 App.tsx 路由

**Files (modify):**
- `frontend/src/App.tsx`

- [ ] **Step 5.1: 修改 App.tsx 把受保护路由包入 AppShell**

完整覆盖 `frontend/src/App.tsx`：

```tsx
import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Home from './pages/Home'
import AdminDashboard from './pages/admin/AdminDashboard'
import DataImportCenter from './pages/admin/DataImportCenter'
import TaskCreate from './pages/TaskCreate'
import TaskDetail from './pages/TaskDetail'
import ProjectTimeline from './pages/ProjectTimeline'
import ProjectKanban from './pages/ProjectKanban'
import MyProjects from './pages/MyProjects'
import MyTasks from './pages/MyTasks'
import SettingsPage from './pages/SettingsPage'
import Notifications from './pages/Notifications'
import ReviewCenter from './pages/ReviewCenter'
import { pb } from './lib/pocketbase'
import { useNotificationAlerts } from './lib/useNotificationAlerts'
import { AppShell } from './components/layout'

const PrivateRoute = ({ children }: { children: React.ReactElement }) => {
  return pb.authStore.isValid ? children : <Navigate to="/login" />
}

const AdminRoute = ({ children }: { children: React.ReactElement }) => {
  if (!pb.authStore.isValid) return <Navigate to="/login" />
  const role = (pb.authStore.model as { role?: string } | null)?.role?.toLowerCase()
  if (role !== 'admin' && role !== 'manager') {
    return <Navigate to="/app" />
  }
  return children
}

const ManagerRoute = ({ children }: { children: React.ReactElement }) => {
  if (!pb.authStore.isValid) return <Navigate to="/login" />
  const role = (pb.authStore.model as { role?: string } | null)?.role?.toLowerCase()
  if (role !== 'admin' && role !== 'manager') {
    return <Navigate to="/app" />
  }
  return children
}

const DefaultRedirect = () => {
  if (!pb.authStore.isValid) return <Navigate to="/login" replace />
  const role = (pb.authStore.model as { role?: string } | null)?.role?.toLowerCase()
  if (role === 'admin' || role === 'manager') {
    return <Navigate to="/admin" replace />
  }
  return <Navigate to="/app" replace />
}

import { App as CapacitorApp } from '@capacitor/app'

function NotifyFlashOverlay() {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handler = () => {
      const el = ref.current
      if (!el) return
      el.classList.remove('notify-flash-overlay')
      void el.offsetWidth
      el.classList.add('notify-flash-overlay')
    }
    const onAnimEnd = () => {
      ref.current?.classList.remove('notify-flash-overlay')
    }
    window.addEventListener('notify-flash', handler)
    const el = ref.current
    el?.addEventListener('animationend', onAnimEnd)
    return () => {
      window.removeEventListener('notify-flash', handler)
      el?.removeEventListener('animationend', onAnimEnd)
    }
  }, [])

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        pointerEvents: 'none',
        borderRadius: 0,
      }}
    />
  )
}

function GlobalNotificationProvider() {
  useNotificationAlerts()
  return null
}

function App() {
  React.useEffect(() => {
    const listener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back()
      } else {
        CapacitorApp.exitApp()
      }
    })
    return () => { listener.then(l => l.remove()) }
  }, [])

  return (
    <Router>
      <NotifyFlashOverlay />
      <GlobalNotificationProvider />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* 受保护路由：桌面/平板 wrap AppShell；mobile AppShell 自己透传 */}
        <Route element={<AppShell />}>
          <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="/admin/import" element={<AdminRoute><DataImportCenter /></AdminRoute>} />
          <Route path="/manager" element={<ManagerRoute><AdminDashboard /></ManagerRoute>} />
          <Route path="/review-center" element={<ManagerRoute><ReviewCenter /></ManagerRoute>} />
          <Route path="/task/create" element={<ManagerRoute><TaskCreate /></ManagerRoute>} />
          <Route path="/project/:id/timeline" element={<PrivateRoute><ProjectTimeline /></PrivateRoute>} />
          <Route path="/project/:id/kanban" element={<PrivateRoute><ProjectKanban /></PrivateRoute>} />
          <Route path="/task/:id" element={<PrivateRoute><TaskDetail /></PrivateRoute>} />
          <Route path="/my-projects" element={<PrivateRoute><MyProjects /></PrivateRoute>} />
          <Route path="/my-tasks" element={<PrivateRoute><MyTasks /></PrivateRoute>} />
          <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
          <Route path="/notifications" element={<PrivateRoute><Notifications /></PrivateRoute>} />
          <Route path="/app/*" element={<PrivateRoute><Home /></PrivateRoute>} />
        </Route>

        <Route path="/" element={<DefaultRedirect />} />
        <Route path="*" element={<DefaultRedirect />} />
      </Routes>
    </Router>
  )
}

export default App
```

- [ ] **Step 5.2: 跑现有的 App.test.tsx 验证路由没破坏**

```bash
cd "G:/项目管理软件_v2/frontend"
npx vitest run src/App.test.tsx
```

Expected: 10 tests pass（如果之前是 10 个；具体数视实际情况）

- [ ] **Step 5.3: 跑完整测试套件**

```bash
cd "G:/项目管理软件_v2/frontend"
npm test
```

Expected: all tests pass, count ≥ 115 + 10 new = 125

- [ ] **Step 5.4: tsc + build**

```bash
cd "G:/项目管理软件_v2/frontend"
npx tsc -b
npm run build
```

Expected: 0 errors, build success

- [ ] **Step 5.5: Commit**

```bash
cd "G:/项目管理软件_v2"
git add frontend/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(layout): wrap protected routes with AppShell

把所有 PrivateRoute / AdminRoute / ManagerRoute 包入 <AppShell />，
通过 react-router v7 Outlet 模式渲染：
- 移动端 (<768px)：AppShell 透传，Home 继续用底部 TabBar
- 平板 (769-1023px)：折叠 Sidebar + TopBar
- 桌面 (≥1024px)：完整 Sidebar + TopBar

login/register 路由不包，保持登录页全屏。
AdminDashboard / ReviewCenter / 各 page 不需修改，自动获得新布局。

验证：npm test 全绿，tsc 0 错，npm run build 成功。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 桌面端各页面去重（移除冗余顶栏 / 返回按钮）

**Files (modify):** 一边检查一边改，按需 surgical edit

> **说明：** 现有页面（Home / TaskDetail / Notifications 等）多数有自己的"返回 + 标题"NavBar，在桌面端就重复了。但要 **YAGNI** — 不强行改所有页面，只改最碍眼的（Home / Notifications / ReviewCenter）。其他页面有"返回"按钮在桌面端也无害（用户随时可点）。

- [ ] **Step 6.1: 检查 Home.tsx 是否在桌面端有冗余 NavBar**

```bash
cd "G:/项目管理软件_v2/frontend"
grep -n "NavBar\|TabBar" src/pages/Home.tsx | head -10
```

如果发现 NavBar 在桌面端无意义，可加 `useBreakpoint` 条件渲染。**本步骤选择性执行 — 如有时间则做，没时间留给 PR 4**。

- [ ] **Step 6.2（可选）：Commit if any change**

略 — 见 6.1 决策。

---

## Task 7: 浏览器手动验证（交付给用户醒后做）

写入 manual QA checklist 文件 `docs/superpowers/manual-qa/2026-05-16-pr-3-appshell.md`：

```markdown
# PR 3 AppShell 手动验证 checklist

## 浏览器尺寸切换
- [ ] Chrome 1920×1080：左 240px Sidebar 显示，顶栏完整
- [ ] Chrome 800×600：Sidebar 缩为 64px 折叠模式
- [ ] Chrome 375×667（移动模拟）：无 Sidebar，底部 Tab 正常
- [ ] 拖动浏览器窗口宽度，断点切换平滑（无闪烁）

## 导航与权限
- [ ] 普通用户登录：Sidebar 看不到"审核中心"和"管理后台"
- [ ] admin 登录：Sidebar 全部 7 项可见
- [ ] 当前页面在 Sidebar 高亮（左侧紫色边）
- [ ] 点 Sidebar 项跳转正确

## 通知与用户菜单
- [ ] 通知铃显示未读数（红点徽章）
- [ ] 点铃跳 /notifications
- [ ] 顶栏右侧显示用户名
- [ ] 点用户菜单跳 /settings

## 移动端不退化
- [ ] APK 安装到真机：Home 底部 Tab 正常，无 Sidebar
- [ ] 真机宽度判断按物理 px 而非 CSS px（应取 mobile）

## 后续 PR 5 才需要
- [ ] 桌面端各业务页（TaskDetail / Tasks）的视觉与 Sidebar 协调
```

- [ ] **Step 7.1: Commit QA checklist**

```bash
cd "G:/项目管理软件_v2"
mkdir -p docs/superpowers/manual-qa
git add docs/superpowers/manual-qa/2026-05-16-pr-3-appshell.md
git commit -m "docs(qa): PR 3 AppShell manual QA checklist for user verification

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

## Task 8: Push 到 origin/main

- [ ] **Step 8.1: Push**

```bash
cd "G:/项目管理软件_v2"
git push origin main 2>&1 | tail -5
```

Expected: 5-6 个 commit pushed（视实际 commit 数）

---

## 自我审查

✅ **Spec 覆盖（spec §4 PR 3）：**
- "<768px 保持现状" → Task 4 Step 4.1 移动端 `bp === 'mobile'` 直接 Outlet
- "768-1023px 折叠 Sidebar" → Task 4 + Task 2 `collapsed` prop
- "≥1024px 完整 Sidebar + TopBar" → Task 4
- Sidebar 项目（首页/任务/看板/甘特/审核/通知/项目/设置/管理） → Task 2 ITEMS 数组 ✓（甘特暂不放，因为路径是 /project/:id/timeline 而非 /gantt，单独入口放 PR 5）
- TopBar：项目切换器+搜索+通知铃+用户菜单 → Task 3（项目切换器先省略，PR 4 再加）
- 路由整合 → Task 5
- 0 新依赖 → 全程仅用 antd-mobile Badge + react-icons + matchMedia

✅ **Placeholder 扫描：** 无 TBD。Task 6 标 "可选"明确范围。

✅ **类型一致性：**
- `Breakpoint = 'mobile' | 'tablet' | 'desktop'` 在 Task 1 定义，Task 4 直接使用 ✓
- `Sidebar collapsed: boolean` 在 Task 2 定义，Task 4 调用 `collapsed={bp === 'tablet'}` ✓
- `useNotificationAlerts` 返回 `{ unreadCount: number }`（PR 1 已存在），Task 3 mock 与 PR 1 测试一致 ✓

✅ **每个 step 都有可粘贴代码 + 可执行命令 + 预期输出。**

---

## Execution Handoff

Plan complete. Inline execution（用户已批量授权过夜自动化）。
