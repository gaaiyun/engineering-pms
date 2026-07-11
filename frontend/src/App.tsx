import React, { Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Home from './pages/Home'
import { useNotificationAlerts } from './lib/useNotificationAlerts'
import { AppShell } from './components/layout'
import {
  AdminOnlyRoute,
  DefaultRedirect,
  LegacyAdminRedirect,
  ManagerRoute,
  PrivateRoute,
} from './components/auth/RouteGuards'
import { initRealtimeBridge } from './lib/realtimeBridge'
import { useQueryClient } from '@tanstack/react-query'

// ⚠️ Bundle optimization（Agent D 建议 — 路由级 React.lazy）：
// 把 admin-only / 低频访问的页面切成动态 chunk，员工端首屏不再白载这些代码。
// 预估 gzip 减少约 100-200 KB（依实际 chunk 体积）。
// Login/Register/Home 保持同步 import（首屏关键路径）。
const AdminDashboard = React.lazy(() => import('./pages/admin/AdminDashboard'))
const DataImportCenter = React.lazy(() => import('./pages/admin/DataImportCenter'))
const TaskCreate = React.lazy(() => import('./pages/TaskCreate'))
const TaskDetail = React.lazy(() => import('./pages/TaskDetail'))
const ProjectTimeline = React.lazy(() => import('./pages/ProjectTimeline'))
const ProjectKanban = React.lazy(() => import('./pages/ProjectKanban'))
const MyProjects = React.lazy(() => import('./pages/MyProjects'))
const MyTasks = React.lazy(() => import('./pages/MyTasks'))
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'))
const Notifications = React.lazy(() => import('./pages/Notifications'))
const ReviewCenter = React.lazy(() => import('./pages/ReviewCenter'))
const Profile = React.lazy(() => import('./pages/Profile'))

// 路由 Suspense fallback — 简洁的加载指示
const PageFallback = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '60dvh',
    color: '#94a3b8',
    fontSize: 14,
  }}>
    加载中...
  </div>
)

import { App as CapacitorApp } from '@capacitor/app'

/** 全屏通知闪烁 overlay — 监听 notify-flash 自定义事件 */
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

/** 全局通知提醒挂载点 — 需要在 Router 内使用 */
function GlobalNotificationProvider() {
  useNotificationAlerts()
  return null
}

/** Android 原生 Realtime 服务桥接 — 仅在 native 平台启用 */
function RealtimeBridgeProvider() {
  const queryClient = useQueryClient()
  React.useEffect(() => {
    const handle = initRealtimeBridge(queryClient)
    return () => handle.stop()
  }, [queryClient])
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
      <RealtimeBridgeProvider />
      <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* 受保护路由统一由 AppShell 提供桌面侧栏或 compact 底栏 */}
        <Route element={<AppShell />}>
          <Route
            path="/admin"
            element={<LegacyAdminRedirect />}
          />

          <Route
            path="/admin/import"
            element={
              <AdminOnlyRoute>
                <Navigate to="/system/import" replace />
              </AdminOnlyRoute>
            }
          />

          <Route
            path="/manager"
            element={<DefaultRedirect />}
          />

          <Route
            path="/system"
            element={
              <AdminOnlyRoute>
                <Navigate to="/system/users" replace />
              </AdminOnlyRoute>
            }
          />
          <Route
            path="/system/users"
            element={
              <AdminOnlyRoute>
                <AdminDashboard section="users" />
              </AdminOnlyRoute>
            }
          />
          <Route
            path="/system/ai"
            element={
              <AdminOnlyRoute>
                <AdminDashboard section="ai" />
              </AdminOnlyRoute>
            }
          />
          <Route
            path="/system/import"
            element={
              <AdminOnlyRoute>
                <DataImportCenter />
              </AdminOnlyRoute>
            }
          />
          <Route
            path="/system/settings"
            element={
              <AdminOnlyRoute>
                <SettingsPage />
              </AdminOnlyRoute>
            }
          />

          {/* 审核中心 */}
          <Route
            path="/review-center"
            element={
              <ManagerRoute>
                <ReviewCenter />
              </ManagerRoute>
            }
          />

          <Route
            path="/task/create"
            element={
              <ManagerRoute>
                <TaskCreate />
              </ManagerRoute>
            }
          />

          <Route
            path="/project/:id/timeline"
            element={
              <PrivateRoute>
                <ProjectTimeline />
              </PrivateRoute>
            }
          />

          {/* 项目看板 */}
          <Route
            path="/project/:id/kanban"
            element={
              <PrivateRoute>
                <ProjectKanban />
              </PrivateRoute>
            }
          />

          <Route
            path="/task/:id"
            element={
              <PrivateRoute>
                <TaskDetail />
              </PrivateRoute>
            }
          />

          <Route
            path="/my-projects"
            element={
              <PrivateRoute>
                <MyProjects />
              </PrivateRoute>
            }
          />
          <Route
            path="/my-tasks"
            element={
              <PrivateRoute>
                <MyTasks />
              </PrivateRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <PrivateRoute>
                <SettingsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/me"
            element={
              <PrivateRoute>
                <Profile />
              </PrivateRoute>
            }
          />
          <Route
            path="/notifications"
            element={
              <PrivateRoute>
                <Notifications />
              </PrivateRoute>
            }
          />

          <Route
            path="/app/*"
            element={
              <PrivateRoute>
                <Home />
              </PrivateRoute>
            }
          />
        </Route>

        {/* 默认跳转 */}
        <Route path="/" element={<DefaultRedirect />} />
        <Route path="*" element={<DefaultRedirect />} />
      </Routes>
      </Suspense>
    </Router>
  )
}

export default App
