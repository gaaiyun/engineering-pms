import { describe, expect, it } from 'vitest'
import source from './AdminDashboard.tsx?raw'

describe('AdminDashboard navigation ownership', () => {
  it('后台内容页不再渲染主级 TabBar', () => {
    expect(source).not.toMatch(/\bTabBar\b/)
  })

  it('后台内容页服从 AppShell 高度，不再自行占满 viewport', () => {
    expect(source).not.toContain("height: '100dvh'")
  })

  it('后台内容页自身也只允许 admin 角色', () => {
    expect(source).toContain("role !== 'admin'")
    expect(source).not.toContain("role !== 'admin' && role !== 'manager'")
  })
})
