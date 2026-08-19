import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import React from 'react'

type AuthModel = { role?: string; must_change_password?: boolean } | null

const mockAuthStore = vi.hoisted(() => ({
  isValid: false,
  model: null as AuthModel,
  clear: vi.fn(),
}))

const mockAuthRefresh = vi.hoisted(() => vi.fn())

vi.mock('./lib/pocketbase', () => ({
  pb: {
    authStore: mockAuthStore,
    collection: () => ({ authRefresh: mockAuthRefresh }),
  },
}))

import {
  AdminOnlyRoute,
  AUTH_MODEL_REFRESH_INTERVAL_MS,
  DefaultRedirect,
  LegacyAdminRedirect,
  ManagerRoute,
  PasswordChangeRoute,
  PrivateRoute,
} from './components/auth/RouteGuards'

function renderGuard(element: React.ReactElement, initialPath = '/protected') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/change-password" element={<div>Change Password</div>} />
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
  vi.useRealTimers()
  mockAuthRefresh.mockReset()
  mockAuthStore.clear.mockReset()
  mockAuthStore.clear.mockImplementation(() => {
    mockAuthStore.isValid = false
    mockAuthStore.model = null
  })
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

  it('首次登录必须先修改密码', () => {
    mockAuthStore.isValid = true
    mockAuthStore.model = { role: 'employee', must_change_password: true }
    renderGuard(<PrivateRoute><div>Secret</div></PrivateRoute>)
    expect(screen.getByText('Change Password')).toBeInTheDocument()
  })

  it('管理员重置在线账号密码后定时刷新并跳转改密页', async () => {
    vi.useFakeTimers()
    mockAuthStore.isValid = true
    mockAuthStore.model = { role: 'employee', must_change_password: false }
    mockAuthRefresh.mockImplementation(async () => {
      mockAuthStore.model = { role: 'employee', must_change_password: true }
    })

    renderGuard(<PrivateRoute><div>Secret</div></PrivateRoute>)
    expect(screen.getByText('Secret')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTH_MODEL_REFRESH_INTERVAL_MS)
    })

    expect(mockAuthRefresh).toHaveBeenCalledOnce()
    expect(screen.getByText('Change Password')).toBeInTheDocument()
  })

  it('定时刷新被服务端拒绝时清理无效会话', async () => {
    vi.useFakeTimers()
    mockAuthStore.isValid = true
    mockAuthStore.model = { role: 'employee', must_change_password: false }
    mockAuthRefresh.mockRejectedValue({ status: 401 })

    renderGuard(<PrivateRoute><div>Secret</div></PrivateRoute>)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTH_MODEL_REFRESH_INTERVAL_MS)
    })

    expect(mockAuthStore.clear).toHaveBeenCalledOnce()
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })
})

describe('PasswordChangeRoute', () => {
  it('未登录跳转登录页', () => {
    renderGuard(<PasswordChangeRoute><div>Change Form</div></PasswordChangeRoute>)
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('强制改密账号可渲染改密页面', () => {
    mockAuthStore.isValid = true
    mockAuthStore.model = { role: 'employee', must_change_password: true }
    renderGuard(<PasswordChangeRoute><div>Change Form</div></PasswordChangeRoute>)
    expect(screen.getByText('Change Form')).toBeInTheDocument()
  })

  it('无需改密账号跳转工作台', () => {
    mockAuthStore.isValid = true
    mockAuthStore.model = { role: 'employee', must_change_password: false }
    renderGuard(<PasswordChangeRoute><div>Change Form</div></PasswordChangeRoute>)
    expect(screen.getByText('App Home')).toBeInTheDocument()
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

  it('强制改密账号不会被默认跳转带入工作台', () => {
    mockAuthStore.isValid = true
    mockAuthStore.model = { role: 'admin', must_change_password: true }
    renderGuard(<DefaultRedirect />, '/protected')
    expect(screen.getByText('Change Password')).toBeInTheDocument()
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
