import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'
import React from 'react'

// Mock pocketbase
vi.mock('./lib/pocketbase', () => ({
  pb: {
    authStore: {
      isValid: false,
      model: null as Record<string, unknown> | null,
    },
  },
}))

// Mock Capacitor
vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn() },
}))

import { pb } from './lib/pocketbase'

// 从 App.tsx 中提取路由守卫逻辑进行测试（避免导入所有页面组件）
const PrivateRoute = ({ children }: { children: React.ReactElement }) => {
  return pb.authStore.isValid ? children : <Navigate to="/login" />
}

const AdminRoute = ({ children }: { children: React.ReactElement }) => {
  if (!pb.authStore.isValid) return <Navigate to="/login" />
  const role = (pb.authStore.model as any)?.role?.toLowerCase()
  if (role !== 'admin' && role !== 'manager') return <Navigate to="/app" />
  return children
}

const ManagerRoute = ({ children }: { children: React.ReactElement }) => {
  if (!pb.authStore.isValid) return <Navigate to="/login" />
  const role = (pb.authStore.model as any)?.role?.toLowerCase()
  if (role !== 'admin' && role !== 'manager') return <Navigate to="/app" />
  return children
}

// 辅助：渲染带路由的测试组件
function renderWithRouter(initialPath: string, guardedElement: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/app" element={<div>App Home</div>} />
        <Route path="/protected" element={guardedElement} />
      </Routes>
    </MemoryRouter>
  )
}

describe('PrivateRoute', () => {
  beforeEach(() => {
    pb.authStore.isValid = false
    pb.authStore.model = null
  })

  it('未登录时重定向到 /login', () => {
    renderWithRouter('/protected', <PrivateRoute><div>Secret</div></PrivateRoute>)
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('已登录时渲染子组件', () => {
    pb.authStore.isValid = true
    renderWithRouter('/protected', <PrivateRoute><div>Secret</div></PrivateRoute>)
    expect(screen.getByText('Secret')).toBeInTheDocument()
  })
})

describe('AdminRoute', () => {
  beforeEach(() => {
    pb.authStore.isValid = false
    pb.authStore.model = null
  })

  it('未登录时重定向到 /login', () => {
    renderWithRouter('/protected', <AdminRoute><div>Admin</div></AdminRoute>)
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('employee 访问时重定向到 /app', () => {
    pb.authStore.isValid = true
    pb.authStore.model = { role: 'employee' } as any
    renderWithRouter('/protected', <AdminRoute><div>Admin</div></AdminRoute>)
    expect(screen.getByText('App Home')).toBeInTheDocument()
  })

  it('admin 可以访问', () => {
    pb.authStore.isValid = true
    pb.authStore.model = { role: 'admin' } as any
    renderWithRouter('/protected', <AdminRoute><div>Admin</div></AdminRoute>)
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('manager 可以访问', () => {
    pb.authStore.isValid = true
    pb.authStore.model = { role: 'manager' } as any
    renderWithRouter('/protected', <AdminRoute><div>Admin</div></AdminRoute>)
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })
})

describe('ManagerRoute', () => {
  beforeEach(() => {
    pb.authStore.isValid = false
    pb.authStore.model = null
  })

  it('未登录时重定向到 /login', () => {
    renderWithRouter('/protected', <ManagerRoute><div>Manager</div></ManagerRoute>)
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('employee 访问时重定向到 /app', () => {
    pb.authStore.isValid = true
    pb.authStore.model = { role: 'employee' } as any
    renderWithRouter('/protected', <ManagerRoute><div>Manager</div></ManagerRoute>)
    expect(screen.getByText('App Home')).toBeInTheDocument()
  })

  it('admin 可以访问', () => {
    pb.authStore.isValid = true
    pb.authStore.model = { role: 'admin' } as any
    renderWithRouter('/protected', <ManagerRoute><div>Manager</div></ManagerRoute>)
    expect(screen.getByText('Manager')).toBeInTheDocument()
  })

  it('manager 可以访问', () => {
    pb.authStore.isValid = true
    pb.authStore.model = { role: 'manager' } as any
    renderWithRouter('/protected', <ManagerRoute><div>Manager</div></ManagerRoute>)
    expect(screen.getByText('Manager')).toBeInTheDocument()
  })
})
