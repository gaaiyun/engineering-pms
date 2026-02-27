import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// Mock pocketbase
const mockGetFullList = vi.fn()
const mockGetOne = vi.fn()

vi.mock('./pocketbase', () => ({
  pb: {
    authStore: {
      isValid: true,
      model: { id: 'u1', role: 'admin' },
    },
    collection: () => ({
      getFullList: mockGetFullList,
      getOne: mockGetOne,
    }),
  },
}))

import { useProjects, useTask, useUsers } from './api'

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('useProjects', () => {
  beforeEach(() => vi.clearAllMocks())

  it('应调用 getFullList 并返回项目列表', async () => {
    const projects = [{ id: 'p1', name: '项目A' }]
    mockGetFullList.mockResolvedValueOnce(projects)

    const { result } = renderHook(() => useProjects(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(projects)
    expect(mockGetFullList).toHaveBeenCalled()
  })
})

describe('useTask', () => {
  beforeEach(() => vi.clearAllMocks())

  it('应通过 id 获取单个任务', async () => {
    const task = { id: 't1', stage_name: '设计' }
    mockGetOne.mockResolvedValueOnce(task)

    const { result } = renderHook(() => useTask('t1'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(task)
    expect(mockGetOne).toHaveBeenCalledWith('t1', expect.any(Object))
  })

  it('id 为空时不应发起请求', () => {
    const { result } = renderHook(() => useTask(''), { wrapper: createWrapper() })
    expect(result.current.isFetching).toBe(false)
  })
})

describe('useUsers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('应返回用户列表', async () => {
    const users = [{ id: 'u1', name: '张三' }]
    mockGetFullList.mockResolvedValueOnce(users)

    const { result } = renderHook(() => useUsers(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(users)
  })
})
