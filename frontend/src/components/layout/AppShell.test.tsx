import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import React from 'react'

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

function renderShell(initialEntries: string[] = ['/app']) {
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
