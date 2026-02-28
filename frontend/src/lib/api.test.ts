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

import { isManagerRole } from './api'

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
