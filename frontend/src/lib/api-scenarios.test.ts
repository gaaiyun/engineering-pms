/**
 * Real-world scenario tests for api.ts hooks
 * Covers: role filtering, task status transitions, notification triggers, data flow
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const mockGetFullList = vi.fn()
const mockGetOne = vi.fn()
const mockGetList = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()

const mockAuthStore = vi.hoisted(() => ({
  isValid: true,
  model: { id: 'u1', role: 'admin', name: '张经理', username: 'zhang_manager' } as any,
}))

vi.mock('./pocketbase', () => ({
  pb: {
    authStore: mockAuthStore,
    collection: () => ({
      getFullList: mockGetFullList,
      getOne: mockGetOne,
      getList: mockGetList,
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
    }),
  },
}))

import {
  useProjects, useTasks, useMyTasks, useNotifications,
  isManagerRole, isManager,
} from './api'

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

// --- Role-based filtering ---

describe('Role-based data visibility', () => {
  beforeEach(() => vi.clearAllMocks())

  it('admin sees all projects (no filter)', async () => {
    mockAuthStore.model = { id: 'u1', role: 'admin' }
    const projects = [
      { id: 'p1', name: '项目A', members: ['u1', 'u2'] },
      { id: 'p2', name: '项目B', members: ['u3'] },
    ]
    mockGetFullList.mockResolvedValueOnce(projects)

    const { result } = renderHook(() => useProjects(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(2)
  })

  it('manager sees all projects (no filter)', async () => {
    mockAuthStore.model = { id: 'u2', role: 'manager' }
    const projects = [{ id: 'p1', name: '项目A' }]
    mockGetFullList.mockResolvedValueOnce(projects)

    const { result } = renderHook(() => useProjects(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
  })

  it('employee useTasks filters by assignees', async () => {
    mockAuthStore.model = { id: 'u3', role: 'employee' }
    const tasks = [{ id: 't1', stage_name: '任务A', assignees: ['u3'] }]
    mockGetFullList.mockResolvedValueOnce(tasks)

    const { result } = renderHook(() => useTasks(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockGetFullList).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.stringContaining('assignees ~ "u3"'),
      })
    )
  })

  it('useMyTasks filters by userId', async () => {
    const tasks = [{ id: 't1', stage_name: '我的任务' }]
    mockGetFullList.mockResolvedValueOnce(tasks)

    const { result } = renderHook(() => useMyTasks('u3'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockGetFullList).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: 'assignees~"u3"',
      })
    )
  })

  it('useMyTasks disabled when userId is empty', () => {
    const { result } = renderHook(() => useMyTasks(''), { wrapper: createWrapper() })
    expect(result.current.isFetching).toBe(false)
  })

  it('useTasks with projectId includes project filter', async () => {
    mockAuthStore.model = { id: 'u1', role: 'admin' }
    mockGetFullList.mockResolvedValueOnce([])

    const { result } = renderHook(() => useTasks('p1'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockGetFullList).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: 'project="p1"',
      })
    )
  })

  it('useTasks disabled when projectId is empty string', () => {
    mockAuthStore.model = { id: 'u1', role: 'admin' }
    const { result } = renderHook(() => useTasks(''), { wrapper: createWrapper() })
    expect(result.current.isFetching).toBe(false)
  })
})

// --- Role check functions ---

describe('isManagerRole / isManager', () => {
  it('admin is manager', () => {
    mockAuthStore.model = { role: 'admin' }
    expect(isManagerRole()).toBe(true)
    expect(isManager()).toBe(true)
  })

  it('manager is manager', () => {
    mockAuthStore.model = { role: 'manager' }
    expect(isManagerRole()).toBe(true)
  })

  it('employee is not manager', () => {
    mockAuthStore.model = { role: 'employee' }
    expect(isManagerRole()).toBe(false)
    expect(isManager()).toBe(false)
  })

  it('null model is not manager', () => {
    mockAuthStore.model = null
    expect(isManagerRole()).toBe(false)
  })

  it('role check is case sensitive (Manager != manager)', () => {
    mockAuthStore.model = { role: 'Manager' }
    expect(isManagerRole()).toBe(false)
  })
})

// --- Notification hooks ---

describe('useNotifications', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches notifications for specific user', async () => {
    const notifications = [
      { id: 'n1', title: '新任务', user: 'u1', is_read: false },
      { id: 'n2', title: '卡点上报', user: 'u1', is_read: true },
    ]
    mockGetFullList.mockResolvedValueOnce(notifications)

    const { result } = renderHook(() => useNotifications('u1'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(2)
    expect(mockGetFullList).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: 'user="u1"',
        sort: '-created',
      })
    )
  })

  it('disabled when userId empty', () => {
    const { result } = renderHook(() => useNotifications(''), { wrapper: createWrapper() })
    expect(result.current.isFetching).toBe(false)
  })

  it('disabled when auth invalid', () => {
    mockAuthStore.isValid = false
    const { result } = renderHook(() => useNotifications('u1'), { wrapper: createWrapper() })
    expect(result.current.isFetching).toBe(false)
    mockAuthStore.isValid = true
  })
})

// --- Auth guard edge cases ---

describe('Auth-gated queries', () => {
  it('all queries disabled when auth invalid', () => {
    mockAuthStore.isValid = false
    const wrapper = createWrapper()

    const p = renderHook(() => useProjects(), { wrapper })
    const t = renderHook(() => useTasks(), { wrapper })
    const m = renderHook(() => useMyTasks('u1'), { wrapper })

    expect(p.result.current.isFetching).toBe(false)
    expect(t.result.current.isFetching).toBe(false)
    expect(m.result.current.isFetching).toBe(false)

    mockAuthStore.isValid = true
  })
})
