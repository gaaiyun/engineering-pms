import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'
import React from 'react'

const mockAuthStore = vi.hoisted(() => ({
  isValid: false,
  model: null as Record<string, unknown> | null,
}))

vi.mock('./lib/pocketbase', () => ({
  pb: {
    authStore: mockAuthStore,
  },
}))

vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn() },
}))

import { pb } from './lib/pocketbase'

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
    mockAuthStore.isValid = false
    mockAuthStore.model = null
  })

  it('未登录时重定向到 /login', () => {
    renderWithRouter('/protected', <PrivateRoute><div>Secret</div></PrivateRoute>)
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('已登录时渲染子组件', () => {
    mockAuthStore.isValid = true
    renderWithRouter('/protected', <PrivateRoute><div>Secret</div></PrivateRoute>)
    expect(screen.getByText('Secret')).toBeInTheDocument()
  })
})

describe('AdminRoute', () => {
  beforeEach(() => {
    mockAuthStore.isValid = false
    mockAuthStore.model = null
  })

  it('未登录时重定向到 /login', () => {
    renderWithRouter('/protected', <AdminRoute><div>Admin</div></AdminRoute>)
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('employee 访问时重定向到 /app', () => {
    mockAuthStore.isValid = true
    mockAuthStore.model = { role: 'employee' } as any
    renderWithRouter('/protected', <AdminRoute><div>Admin</div></AdminRoute>)
    expect(screen.getByText('App Home')).toBeInTheDocument()
  })

  it('admin 可以访问', () => {
    mockAuthStore.isValid = true
    mockAuthStore.model = { role: 'admin' } as any
    renderWithRouter('/protected', <AdminRoute><div>Admin</div></AdminRoute>)
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('manager 可以访问', () => {
    mockAuthStore.isValid = true
    mockAuthStore.model = { role: 'manager' } as any
    renderWithRouter('/protected', <AdminRoute><div>Admin</div></AdminRoute>)
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })
})

describe('ManagerRoute', () => {
  beforeEach(() => {
    mockAuthStore.isValid = false
    mockAuthStore.model = null
  })

  it('未登录时重定向到 /login', () => {
    renderWithRouter('/protected', <ManagerRoute><div>Manager</div></ManagerRoute>)
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('employee 访问时重定向到 /app', () => {
    mockAuthStore.isValid = true
    mockAuthStore.model = { role: 'employee' } as any
    renderWithRouter('/protected', <ManagerRoute><div>Manager</div></ManagerRoute>)
    expect(screen.getByText('App Home')).toBeInTheDocument()
  })

  it('admin 可以访问', () => {
    mockAuthStore.isValid = true
    mockAuthStore.model = { role: 'admin' } as any
    renderWithRouter('/protected', <ManagerRoute><div>Manager</div></ManagerRoute>)
    expect(screen.getByText('Manager')).toBeInTheDocument()
  })

  it('manager 可以访问', () => {
    mockAuthStore.isValid = true
    mockAuthStore.model = { role: 'manager' } as any
    renderWithRouter('/protected', <ManagerRoute><div>Manager</div></ManagerRoute>)
    expect(screen.getByText('Manager')).toBeInTheDocument()
  })
})
