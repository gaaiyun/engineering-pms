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
import { initRealtimeBridge } from './lib/realtimeBridge'
import { useQueryClient } from '@tanstack/react-query'

// 简单的路由保护组件
const PrivateRoute = ({ children }: { children: React.ReactElement }) => {
  return pb.authStore.isValid ? children : <Navigate to="/login" />
}

// 管理员路由保护 - 只允许 admin 角色访问
const AdminRoute = ({ children }: { children: React.ReactElement }) => {
  if (!pb.authStore.isValid) return <Navigate to="/login" />
  const role = (pb.authStore.model as { role?: string } | null)?.role?.toLowerCase()
  // Manager 也是管理员
  if (role !== 'admin' && role !== 'manager') {
    return <Navigate to="/app" />
  }
  return children
}

// 经理路由保护 - 只允许 manager 和 admin 角色访问
const ManagerRoute = ({ children }: { children: React.ReactElement }) => {
  if (!pb.authStore.isValid) return <Navigate to="/login" />
  const role = (pb.authStore.model as { role?: string } | null)?.role?.toLowerCase()
  if (role !== 'admin' && role !== 'manager') {
    return <Navigate to="/app" />
  }
  return children
}

// 智能默认跳转 - 根据角色跳转到对应首页
const DefaultRedirect = () => {
  if (!pb.authStore.isValid) return <Navigate to="/login" replace />
  const role = (pb.authStore.model as { role?: string } | null)?.role?.toLowerCase()
  if (role === 'admin' || role === 'manager') {
    return <Navigate to="/admin" replace />
  }
  return <Navigate to="/app" replace />
}

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
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* 受保护路由：桌面/平板 wrap AppShell；mobile AppShell 自己透传 */}
        <Route element={<AppShell />}>
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            }
          />

          {/* 数据导入中心 */}
          <Route
            path="/admin/import"
            element={
              <AdminRoute>
                <DataImportCenter />
              </AdminRoute>
            }
          />

          {/* 经理工作台 - 统一使用 AdminDashboard（manager + admin 均可访问） */}
          <Route
            path="/manager"
            element={
              <ManagerRoute>
                <AdminDashboard />
              </ManagerRoute>
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
    </Router>
  )
}

export default App
