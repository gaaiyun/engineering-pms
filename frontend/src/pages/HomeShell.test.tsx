import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../lib/useAppSurface', () => ({
  useAppSurface: () => 'sidebar-expanded',
}))

vi.mock('../lib/pocketbase', () => ({
  pb: {
    authStore: { model: { id: 'u1', role: 'admin', name: '管理员' } },
  },
}))

vi.mock('../lib/useNotificationAlerts', () => ({
  useNotificationAlerts: () => ({ unreadCount: 0 }),
}))

vi.mock('../lib/api', () => ({
  useUnreadNotificationCount: () => ({ data: 0 }),
  useTasks: () => ({ data: [] }),
  useVisibleTasks: () => ({ data: [] }),
  useNotifications: () => ({ data: [] }),
  useProjects: () => ({ data: [] }),
}))

vi.mock('./Tasks', () => ({ default: () => <div>工作内容</div> }))
vi.mock('./Profile', () => ({ default: () => <div>个人资料</div> }))

vi.mock('antd-mobile', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  TabBar: ({ children }: { children: React.ReactNode }) => <nav aria-label="旧页面底栏">{children}</nav>,
}))

import { AppShell } from '../components/layout/AppShell'
import Home from './Home'

describe('Home in AppShell', () => {
  it('桌面端只保留 AppShell 侧栏，不渲染 Home 内部旧侧栏', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/app']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/app" element={<Home />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.getByLabelText('桌面主导航')).toBeInTheDocument()
    expect(screen.queryByText('工程结算')).not.toBeInTheDocument()
    expect(screen.queryByText('消息通知')).not.toBeInTheDocument()
    expect(screen.getAllByRole('navigation')).toHaveLength(1)
  })
})
