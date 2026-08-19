import { describe, expect, it } from 'vitest'
import { clampNotificationPage, collapseDuplicateNotifications, resolveNotificationPath, type CollapsibleNotification } from './notification-utils'

const base: CollapsibleNotification = {
  id: 'n1',
  user: 'u1',
  type: 'task_update',
  title: '任务批量更新',
  content: '批量编辑了 8 个任务',
  created: '2026-05-18 10:00:00.000Z',
  is_read: true,
  link_type: 'project',
  link_id: 'p1',
}

describe('collapseDuplicateNotifications', () => {
  it('合并同一天、同内容、同关联对象的重复通知', () => {
    const result = collapseDuplicateNotifications([
      base,
      { ...base, id: 'n2', created: '2026-05-18 10:03:00.000Z', is_read: false },
    ])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'n1', duplicateCount: 2, duplicateIds: ['n2'], is_read: false })
  })

  it('不同日期或关联对象的通知保持独立', () => {
    const result = collapseDuplicateNotifications([
      base,
      { ...base, id: 'n2', created: '2026-05-19 10:00:00.000Z' },
      { ...base, id: 'n3', link_id: 'p2' },
    ])

    expect(result).toHaveLength(3)
  })
})

describe('resolveNotificationPath', () => {
  it('员工和管理角色分别进入可访问的交接页面', () => {
    const handoff = { type: 'handoff_pending', link_type: 'handoff', link_id: 'h1' }
    expect(resolveNotificationPath(handoff, 'employee')).toBe('/my-tasks')
    expect(resolveNotificationPath(handoff, 'manager')).toBe('/review-center')
    expect(resolveNotificationPath(handoff, 'admin')).toBe('/review-center')
  })

  it('任务、项目和无关联通知使用稳定深链', () => {
    expect(resolveNotificationPath({ type: 'task_update', link_type: 'task', link_id: 't1' }, 'employee')).toBe('/task/t1')
    expect(resolveNotificationPath({ type: 'project_update', link_type: 'project', link_id: 'p1' }, 'employee')).toBe('/project/p1')
    expect(resolveNotificationPath({ type: 'system' }, 'employee')).toBe('/notifications')
  })
})

describe('clampNotificationPage', () => {
  it('在通知删除导致总页数减少时回退到有效页码', () => {
    expect(clampNotificationPage(3, 2)).toBe(2)
    expect(clampNotificationPage(0, 2)).toBe(1)
    expect(clampNotificationPage(4, 0)).toBe(1)
  })
})
