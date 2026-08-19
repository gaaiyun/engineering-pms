import { describe, expect, it } from 'vitest'
import {
  canAccessSystem,
  getPostLoginPath,
  getVisibleNavigation,
  isNavigationItemActive,
  resolveAppSurface,
  resolveLegacyAdminPath,
  type AppRole,
} from './navigation'

const ids = (role: AppRole, surface: 'compact' | 'sidebar-collapsed' | 'sidebar-expanded') =>
  getVisibleNavigation(role, surface).map(item => item.id)

describe('统一导航模型', () => {
  it('只有 admin 能进入系统管理', () => {
    expect(canAccessSystem('employee')).toBe(false)
    expect(canAccessSystem('manager')).toBe(false)
    expect(canAccessSystem('admin')).toBe(true)
  })

  it.each([
    ['/task/task-1', 'tasks'],
    ['/project/project-1/kanban', 'projects'],
    ['/settings', 'me'],
    ['/system/ai', 'system'],
  ])('%s 激活 %s 导航', (pathname, routeId) => {
    const item = getVisibleNavigation('admin', 'sidebar-expanded').find(candidate => candidate.id === routeId)
    expect(item && isNavigationItemActive(pathname, item)).toBe(true)
  })

  it('手机、App 和未来小程序固定为五个主入口', () => {
    expect(ids('employee', 'compact')).toEqual(['workbench', 'tasks', 'projects', 'notifications', 'me'])
    expect(ids('manager', 'compact')).toEqual(['workbench', 'tasks', 'projects', 'notifications', 'me'])
    expect(ids('admin', 'compact')).toEqual(['workbench', 'tasks', 'projects', 'notifications', 'me'])
  })

  it('桌面按 employee、manager、admin 分层显示权限入口', () => {
    expect(ids('employee', 'sidebar-expanded')).not.toContain('reviews')
    expect(ids('employee', 'sidebar-expanded')).not.toContain('system')
    expect(ids('manager', 'sidebar-expanded')).toContain('reviews')
    expect(ids('manager', 'sidebar-expanded')).not.toContain('system')
    expect(ids('admin', 'sidebar-expanded')).toContain('reviews')
    expect(ids('admin', 'sidebar-expanded')).toContain('system')
  })

  it('经理和管理员看到项目管理，员工看到我的项目', () => {
    const employeeProject = getVisibleNavigation('employee', 'sidebar-expanded').find(item => item.id === 'projects')
    const managerProject = getVisibleNavigation('manager', 'sidebar-expanded').find(item => item.id === 'projects')
    expect(employeeProject?.label).toBe('我的项目')
    expect(managerProject?.label).toBe('项目管理')
  })
})

describe('跨端 surface', () => {
  it('Capacitor 原生与触控设备始终使用 compact 导航', () => {
    expect(resolveAppSurface({ width: 1440, isNative: true, pointerCoarse: false })).toBe('compact')
    expect(resolveAppSurface({ width: 1180, isNative: false, pointerCoarse: true })).toBe('compact')
  })

  it('键鼠设备按宽度使用完整、折叠或 compact 导航', () => {
    expect(resolveAppSurface({ width: 1440, isNative: false, pointerCoarse: false })).toBe('sidebar-expanded')
    expect(resolveAppSurface({ width: 900, isNative: false, pointerCoarse: false })).toBe('sidebar-collapsed')
    expect(resolveAppSurface({ width: 768, isNative: false, pointerCoarse: false })).toBe('compact')
  })
})

describe('旧管理后台链接兼容', () => {
  it.each(['employee', 'manager', 'admin'] as const)('%s 登录后进入统一工作台', role => {
    expect(getPostLoginPath(role)).toBe('/app')
  })

  it.each([
    [null, '/app'],
    ['dashboard', '/app'],
    ['projects', '/my-projects'],
    ['timeline', '/my-projects'],
    ['users', '/system/users'],
    ['ai', '/system/ai'],
    ['profile', '/me'],
    ['unknown', '/app'],
  ])('tab=%s 跳转到 %s', (tab, expected) => {
    expect(resolveLegacyAdminPath(tab)).toBe(expected)
  })
})
