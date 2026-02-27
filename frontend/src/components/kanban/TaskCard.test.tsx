import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock dnd-kit
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}))
vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => undefined } },
}))

import { TaskCard, TaskCardOverlay } from './TaskCard'
import type { Task } from '../../lib/api'

const baseTask: Task = {
  id: 't1',
  project: 'p1',
  stage_name: '设计首页',
  status: 'in_progress',
  collectionId: '',
  collectionName: 'tasks',
  created: '2026-01-01',
  updated: '2026-01-01',
} as Task

describe('TaskCard', () => {
  it('应渲染任务标题', () => {
    render(<TaskCard task={baseTask} />)
    expect(screen.getByText('设计首页')).toBeInTheDocument()
  })

  it('应渲染优先级标签', () => {
    render(<TaskCard task={{ ...baseTask, priority: 'high' }} />)
    expect(screen.getByText('高')).toBeInTheDocument()
  })

  it('应渲染 next_steps 描述', () => {
    render(<TaskCard task={{ ...baseTask, next_steps: '完成原型图' }} />)
    expect(screen.getByText('完成原型图')).toBeInTheDocument()
  })

  it('blocked 状态应显示卡点标记', () => {
    render(<TaskCard task={{ ...baseTask, status: 'blocked' }} />)
    expect(screen.getByText(/卡点/)).toBeInTheDocument()
  })

  it('里程碑任务应显示里程碑标记', () => {
    render(<TaskCard task={{ ...baseTask, is_milestone: true }} />)
    expect(screen.getByText(/里程碑/)).toBeInTheDocument()
  })

  it('应渲染负责人头像首字', () => {
    const task = {
      ...baseTask,
      expand: {
        assignees: [
          { id: 'u1', name: '张三', username: 'zs', role: 'employee' },
        ],
      },
    } as unknown as Task
    render(<TaskCard task={task} />)
    expect(screen.getByText('张')).toBeInTheDocument()
  })

  it('超过3人时显示 +N', () => {
    const task = {
      ...baseTask,
      expand: {
        assignees: [
          { id: 'u1', name: 'A', username: 'a', role: 'employee' },
          { id: 'u2', name: 'B', username: 'b', role: 'employee' },
          { id: 'u3', name: 'C', username: 'c', role: 'employee' },
          { id: 'u4', name: 'D', username: 'd', role: 'employee' },
        ],
      },
    } as unknown as Task
    render(<TaskCard task={task} />)
    expect(screen.getByText('+1')).toBeInTheDocument()
  })

  it('点击时触发 onClick', async () => {
    const onClick = vi.fn()
    render(<TaskCard task={baseTask} onClick={onClick} />)
    screen.getByText('设计首页').click()
    expect(onClick).toHaveBeenCalled()
  })
})

describe('TaskCardOverlay', () => {
  it('应渲染任务标题', () => {
    render(<TaskCardOverlay task={baseTask} />)
    expect(screen.getByText('设计首页')).toBeInTheDocument()
  })
})
