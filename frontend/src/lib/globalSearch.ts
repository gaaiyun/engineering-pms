export type GlobalSearchKind = 'task' | 'project' | 'notification'

export interface GlobalSearchResult {
  id: string
  kind: GlobalSearchKind
  title: string
  subtitle?: string
  path: string
}

export function escapePocketBaseFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function normalizeGlobalSearchQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 80)
}
