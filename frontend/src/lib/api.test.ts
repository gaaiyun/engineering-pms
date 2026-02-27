import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock pocketbase 模块
vi.mock('./pocketbase', () => ({
  pb: {
    authStore: {
      isValid: false,
      model: null as Record<string, unknown> | null,
    },
  },
}))

import { isManagerRole } from './api'
import { pb } from './pocketbase'

describe('isManagerRole', () => {
  beforeEach(() => {
    pb.authStore.model = null
  })

  it('当 role 为 admin 时返回 true', () => {
    pb.authStore.model = { role: 'admin' } as any
    expect(isManagerRole()).toBe(true)
  })

  it('当 role 为 manager 时返回 true', () => {
    pb.authStore.model = { role: 'manager' } as any
    expect(isManagerRole()).toBe(true)
  })

  it('当 role 为 employee 时返回 false', () => {
    pb.authStore.model = { role: 'employee' } as any
    expect(isManagerRole()).toBe(false)
  })

  it('当 model 为 null 时返回 false', () => {
    pb.authStore.model = null
    expect(isManagerRole()).toBe(false)
  })
})
