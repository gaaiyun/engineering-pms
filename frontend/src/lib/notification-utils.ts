export type CollapsibleNotification = {
  id: string
  user: string
  type: string
  title: string
  content: string
  created: string
  is_read: boolean
  link_type?: string
  link_id?: string
}

export type CollapsedNotification<T extends CollapsibleNotification> = T & {
  duplicateCount?: number
  duplicateIds?: string[]
}

/**
 * 历史批处理曾给同一用户重复写入相同通知。保留最新记录并显示合并数量，
 * 既不删除审计历史，也避免通知中心被同一条消息刷屏。
 */
export function collapseDuplicateNotifications<T extends CollapsibleNotification>(items: T[]): Array<CollapsedNotification<T>> {
  const result: Array<CollapsedNotification<T>> = []
  const bySignature = new Map<string, CollapsedNotification<T>>()

  for (const item of items) {
    const day = item.created.slice(0, 10)
    const signature = [item.user, item.type, item.title, item.content, item.link_type || '', item.link_id || '', day].join('\u0001')
    const existing = bySignature.get(signature)
    if (!existing) {
      const collapsed: CollapsedNotification<T> = { ...item }
      bySignature.set(signature, collapsed)
      result.push(collapsed)
      continue
    }

    existing.duplicateCount = (existing.duplicateCount || 1) + 1
    existing.duplicateIds = [...(existing.duplicateIds || []), item.id]
    existing.is_read = existing.is_read && item.is_read
  }

  return result
}
