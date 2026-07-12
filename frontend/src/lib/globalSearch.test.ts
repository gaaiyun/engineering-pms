import { describe, expect, it } from 'vitest'
import { escapePocketBaseFilterValue, normalizeGlobalSearchQuery } from './globalSearch'

describe('globalSearch', () => {
  it('normalizes whitespace and limits the query length', () => {
    expect(normalizeGlobalSearchQuery('  项目   结算  ')).toBe('项目 结算')
    expect(normalizeGlobalSearchQuery('a'.repeat(100))).toHaveLength(80)
  })

  it('escapes PocketBase filter string values', () => {
    expect(escapePocketBaseFilterValue('a"b\\c')).toBe('a\\"b\\\\c')
  })
})
