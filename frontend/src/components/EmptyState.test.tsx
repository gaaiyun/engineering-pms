import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmptyState, EmptyTasks, EmptyProjects, EmptyNotifications } from './EmptyState'

describe('EmptyState', () => {
  it('应渲染标题', () => {
    render(<EmptyState title="没有数据" />)
    expect(screen.getByText('没有数据')).toBeInTheDocument()
  })

  it('应渲染描述', () => {
    render(<EmptyState title="标题" description="这是描述" />)
    expect(screen.getByText('这是描述')).toBeInTheDocument()
  })

  it('应渲染图标', () => {
    render(<EmptyState title="标题" icon="--" />)
    expect(screen.getByText('--')).toBeInTheDocument()
  })

  it('应渲染操作按钮并响应点击', async () => {
    const onClick = vi.fn()
    render(<EmptyState title="标题" actionText="点击我" onAction={onClick} />)
    await userEvent.click(screen.getByText('点击我'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('无 actionText 时不渲染按钮', () => {
    render(<EmptyState title="标题" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('EmptyState 预设组件', () => {
  it('EmptyTasks 渲染正确文案', () => {
    render(<EmptyTasks />)
    expect(screen.getByText('还没有任务')).toBeInTheDocument()
  })

  it('EmptyProjects 渲染正确文案', () => {
    render(<EmptyProjects />)
    expect(screen.getByText('暂无项目')).toBeInTheDocument()
  })

  it('EmptyNotifications 渲染正确文案', () => {
    render(<EmptyNotifications />)
    expect(screen.getByText('暂无通知')).toBeInTheDocument()
  })
})
