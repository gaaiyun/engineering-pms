import { describe, expect, it } from 'vitest'
import { collapseDuplicateNotifications, type CollapsibleNotification } from './notification-utils'

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
