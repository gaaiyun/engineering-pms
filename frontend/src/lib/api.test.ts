import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuthStore = vi.hoisted(() => ({
  isValid: false,
  model: null as Record<string, unknown> | null,
}))

vi.mock('./pocketbase', () => ({
  pb: {
    authStore: mockAuthStore,
  },
}))

import { getAddedAssigneeIds, isManagerRole } from './api'

describe('isManagerRole', () => {
  beforeEach(() => {
    mockAuthStore.model = null
  })

  it('当 role 为 admin 时返回 true', () => {
    mockAuthStore.model = { role: 'admin' } as any
    expect(isManagerRole()).toBe(true)
  })

  it('当 role 为 manager 时返回 true', () => {
    mockAuthStore.model = { role: 'manager' } as any
    expect(isManagerRole()).toBe(true)
  })

  it('当 role 为 employee 时返回 false', () => {
    mockAuthStore.model = { role: 'employee' } as any
    expect(isManagerRole()).toBe(false)
  })

  it('当 model 为 null 时返回 false', () => {
    mockAuthStore.model = null
    expect(isManagerRole()).toBe(false)
  })
})

describe('getAddedAssigneeIds', () => {
  it('返回新增的执行人 id', () => {
    expect(getAddedAssigneeIds(['u1', 'u2'], ['u2', 'u3', 'u4'])).toEqual(['u3', 'u4'])
  })

  it('忽略重复与空值', () => {
    expect(getAddedAssigneeIds(['u1'], ['u1', 'u2', 'u2', '' as any, undefined as any])).toEqual(['u2'])
  })

  it('没有新增时返回空数组', () => {
    expect(getAddedAssigneeIds(['u1', 'u2'], ['u2', 'u1'])).toEqual([])
  })
})
