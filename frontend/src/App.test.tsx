import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import React from 'react'

type AuthModel = { role?: string } | null

const mockAuthStore = vi.hoisted(() => ({
  isValid: false,
  model: null as AuthModel,
}))

vi.mock('./lib/pocketbase', () => ({
  pb: { authStore: mockAuthStore },
}))

import {
  AdminOnlyRoute,
  DefaultRedirect,
  LegacyAdminRedirect,
  ManagerRoute,
  PrivateRoute,
} from './components/auth/RouteGuards'

function renderGuard(element: React.ReactElement, initialPath = '/protected') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/app" element={<div>App Home</div>} />
        <Route path="/system/users" element={<div>System Users</div>} />
        <Route path="/system/ai" element={<div>System AI</div>} />
        <Route path="/my-projects" element={<div>Projects</div>} />
        <Route path="/me" element={<div>Me</div>} />
        <Route path="/protected" element={element} />
        <Route path="/admin" element={element} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockAuthStore.isValid = false
  mockAuthStore.model = null
})

describe('PrivateRoute', () => {
  it('未登录跳转登录页，已登录渲染内容', () => {
    const first = renderGuard(<PrivateRoute><div>Secret</div></PrivateRoute>)
    expect(screen.getByText('Login Page')).toBeInTheDocument()
    first.unmount()

    mockAuthStore.isValid = true
    renderGuard(<PrivateRoute><div>Secret</div></PrivateRoute>)
    expect(screen.getByText('Secret')).toBeInTheDocument()
  })
})

describe('角色守卫', () => {
  it('manager 和 admin 可访问经理页面', () => {
    mockAuthStore.isValid = true
    mockAuthStore.model = { role: 'manager' }
    const first = renderGuard(<ManagerRoute><div>Manager Area</div></ManagerRoute>)
    expect(screen.getByText('Manager Area')).toBeInTheDocument()
    first.unmount()

    mockAuthStore.model = { role: 'admin' }
    renderGuard(<ManagerRoute><div>Manager Area</div></ManagerRoute>)
    expect(screen.getByText('Manager Area')).toBeInTheDocument()
  })

  it('系统管理只允许 admin，manager 会回工作台', () => {
    mockAuthStore.isValid = true
    mockAuthStore.model = { role: 'manager' }
    const first = renderGuard(<AdminOnlyRoute><div>System Area</div></AdminOnlyRoute>)
    expect(screen.getByText('App Home')).toBeInTheDocument()
    first.unmount()

    mockAuthStore.model = { role: 'admin' }
    renderGuard(<AdminOnlyRoute><div>System Area</div></AdminOnlyRoute>)
    expect(screen.getByText('System Area')).toBeInTheDocument()
  })
})

describe('默认与旧链接跳转', () => {
  it.each(['employee', 'manager', 'admin'])('%s 登录后统一进入 /app', role => {
    mockAuthStore.isValid = true
    mockAuthStore.model = { role }
    renderGuard(<DefaultRedirect />, '/protected')
    expect(screen.getByText('App Home')).toBeInTheDocument()
  })

  it.each([
    ['/admin', 'App Home'],
    ['/admin?tab=dashboard', 'App Home'],
    ['/admin?tab=projects', 'Projects'],
    ['/admin?tab=timeline', 'Projects'],
    ['/admin?tab=users', 'System Users'],
    ['/admin?tab=ai', 'System AI'],
    ['/admin?tab=profile', 'Me'],
  ])('%s 兼容跳转到新页面', (path, expectedText) => {
    mockAuthStore.isValid = true
    mockAuthStore.model = { role: 'admin' }
    renderGuard(<LegacyAdminRedirect />, path)
    expect(screen.getByText(expectedText)).toBeInTheDocument()
  })
})
