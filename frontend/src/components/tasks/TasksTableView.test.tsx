import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const mockNavigate = vi.hoisted(() => vi.fn())
vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../lib/api', () => ({
  useMarkTaskComplete: () => ({ mutateAsync: vi.fn() }),
  useDeleteTask: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('antd-mobile', () => ({
  Tag: ({ children }: { children: React.ReactNode }) => <span data-testid="tag">{children}</span>,
  Toast: { show: vi.fn() },
  Dialog: { confirm: vi.fn().mockResolvedValue(false) },
}))

import { TasksTableView } from './TasksTableView'
import type { Task } from '../../lib/api'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    project: 'p1',
    stage_name: 'Task One',
    status: 'pending',
    sequence: 1,
    deadline: '2026-06-01',
    expand: {
      project: { id: 'p1', name: 'Project Alpha', code: 'P1' },
      assignees: [{ id: 'u1', username: 'alice', name: 'Alice', role: 'employee' }],
    },
    ...overrides,
  } as unknown as Task
}

function renderTable(tasks: Task[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TasksTableView tasks={tasks} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  mockNavigate.mockReset()
})

describe('TasksTableView', () => {
  it('shows empty state when no tasks', () => {
    renderTable([])
    expect(screen.getByText('暂无任务')).toBeInTheDocument()
  })

  it('renders task rows with title, project, status', () => {
    renderTable([
      makeTask({ stage_name: 'Build the table', status: 'in_progress' }),
      makeTask({ id: 't2', stage_name: 'Write tests' }),
    ])
    expect(screen.getByText('Build the table')).toBeInTheDocument()
    expect(screen.getByText('Write tests')).toBeInTheDocument()
    expect(screen.getAllByText('Project Alpha').length).toBeGreaterThan(0)
    expect(screen.getByText('进行中')).toBeInTheDocument()
  })

  it('navigates to task detail on row click', () => {
    renderTable([makeTask()])
    fireEvent.click(screen.getByText('Task One'))
    expect(mockNavigate).toHaveBeenCalledWith('/task/t1')
  })

  it('selecting a row shows the bulk bar', () => {
    renderTable([makeTask(), makeTask({ id: 't2', stage_name: 'Other' })])
    const checkboxes = screen.getAllByRole('checkbox')
    // first checkbox is "select all", second is row 1
    fireEvent.click(checkboxes[1])
    expect(screen.getByRole('toolbar', { name: '批量操作' })).toBeInTheDocument()
    expect(screen.getByText(/已选/)).toBeInTheDocument()
  })

  it('checkbox click does not trigger row navigation', () => {
    renderTable([makeTask()])
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1])
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('clears selection when bulk bar clear button clicked', () => {
    renderTable([makeTask()])
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1])
    const toolbar = screen.getByRole('toolbar', { name: '批量操作' })
    const clearBtn = within(toolbar).getByLabelText('清空选择')
    fireEvent.click(clearBtn)
    expect(screen.queryByRole('toolbar', { name: '批量操作' })).not.toBeInTheDocument()
  })

  it('select-all checkbox selects all rows', () => {
    renderTable([makeTask(), makeTask({ id: 't2' }), makeTask({ id: 't3' })])
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0]) // select all
    const toolbar = screen.getByRole('toolbar', { name: '批量操作' })
    // "已选 3 项" — number is in nested span; assert the span text directly
    expect(within(toolbar).getByText('3')).toBeInTheDocument()
  })
})
