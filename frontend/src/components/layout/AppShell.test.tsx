import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockSurface = vi.hoisted(() => vi.fn())
vi.mock('../../lib/useAppSurface', () => ({
  useAppSurface: mockSurface,
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

function renderShell(initialEntries: string[] = ['/app']) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/app" element={<div data-testid="content">CONTENT</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  mockSurface.mockReset()
})

describe('AppShell', () => {
  it('compact 端渲染唯一底部导航，不渲染侧栏与顶栏', () => {
    mockSurface.mockReturnValue('compact')
    renderShell()
    expect(screen.getByTestId('content')).toBeInTheDocument()
    expect(screen.getByLabelText('底部导航')).toBeInTheDocument()
    expect(screen.queryByLabelText('桌面主导航')).not.toBeInTheDocument()
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.getAllByRole('navigation')).toHaveLength(1)
    expect(screen.getByText('工作台')).toBeInTheDocument()
    expect(screen.getByText('任务')).toBeInTheDocument()
    expect(screen.getByText('项目')).toBeInTheDocument()
    expect(screen.getByText('通知')).toBeInTheDocument()
    expect(screen.getByText('我的')).toBeInTheDocument()
  })

  it('键鼠小窗口渲染折叠侧栏和顶栏', () => {
    mockSurface.mockReturnValue('sidebar-collapsed')
    renderShell()
    const nav = screen.getByLabelText('桌面主导航')
    expect(nav).toBeInTheDocument()
    expect(nav).toHaveAttribute('data-collapsed', 'true')
    expect(screen.getAllByRole('navigation')).toHaveLength(1)
  })

  it('桌面渲染完整侧栏和顶栏', () => {
    mockSurface.mockReturnValue('sidebar-expanded')
    renderShell()
    const nav = screen.getByLabelText('桌面主导航')
    expect(nav).toHaveAttribute('data-collapsed', 'false')
    expect(screen.getAllByRole('navigation')).toHaveLength(1)
  })

  it('shows notification badge with unread count', () => {
    mockSurface.mockReturnValue('sidebar-expanded')
    renderShell()
    expect(screen.getByTestId('badge')).toHaveAttribute('data-content', '3')
  })

  it('管理员显示审核中心和系统管理，不再显示管理后台', () => {
    mockSurface.mockReturnValue('sidebar-expanded')
    renderShell()
    expect(screen.getByText('审核中心')).toBeInTheDocument()
    expect(screen.getByText('系统管理')).toBeInTheDocument()
    expect(screen.queryByText('管理后台')).not.toBeInTheDocument()
  })
})
