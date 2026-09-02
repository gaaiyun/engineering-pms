import { describe, expect, it } from 'vitest'
import { DEPARTMENTS, DEPARTMENT_OPTIONS } from './departments'

describe('department options', () => {
  it('应包含全部七个正式部门且选项值唯一', () => {
    expect(DEPARTMENTS).toEqual(['工程部', '财务部', '综合部', '审计部', '设计院', '监理部', '管理层'])
    expect(new Set(DEPARTMENTS).size).toBe(DEPARTMENTS.length)
    expect(DEPARTMENT_OPTIONS.map((option) => option.value)).toEqual(DEPARTMENTS)
  })
})
