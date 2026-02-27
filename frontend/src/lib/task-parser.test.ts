import { describe, it, expect } from 'vitest'
import {
  parseThreeColumnTasks,
  findUserByName,
  parseFlexibleDate,
  formatDate,
} from './task-parser'
import type { User } from './api'

// 测试用 mock 用户
const mockUsers: User[] = [
  { id: 'u1', name: '张三', username: 'zhangsan', email: 'zhangsan@test.com', role: 'employee', collectionId: '', collectionName: 'users', created: '', updated: '' },
  { id: 'u2', name: '李四', username: 'lisi', email: 'lisi@test.com', role: 'manager', collectionId: '', collectionName: 'users', created: '', updated: '' },
] as User[]

const BASE_DATE = '2026-03-01'

// ========== formatDate ==========
describe('formatDate', () => {
  it('应正确格式化日期为 YYYY-MM-DD', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('应正确补零', () => {
    expect(formatDate(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

// ========== findUserByName ==========
describe('findUserByName', () => {
  it('应通过 name 精确匹配', () => {
    expect(findUserByName('张三', mockUsers)?.id).toBe('u1')
  })

  it('应通过 username 匹配（大小写不敏感）', () => {
    expect(findUserByName('ZhangSan', mockUsers)?.id).toBe('u1')
  })

  it('应通过 email 匹配', () => {
    expect(findUserByName('lisi@test.com', mockUsers)?.id).toBe('u2')
  })

  it('应通过部分 name 匹配', () => {
    expect(findUserByName('张', mockUsers)?.id).toBe('u1')
  })

  it('未匹配时返回 undefined', () => {
    expect(findUserByName('不存在', mockUsers)).toBeUndefined()
  })
})

// ========== parseFlexibleDate ==========
describe('parseFlexibleDate', () => {
  it('应解析完整日期 YYYY-MM-DD', () => {
    const d = parseFlexibleDate('2026-06-15', BASE_DATE)
    expect(d?.getFullYear()).toBe(2026)
    expect(d?.getMonth()).toBe(5) // 0-indexed
    expect(d?.getDate()).toBe(15)
  })

  it('应解析斜杠格式 YYYY/MM/DD', () => {
    const d = parseFlexibleDate('2026/06/15', BASE_DATE)
    expect(d?.getMonth()).toBe(5)
  })

  it('应解析简短日期 MM-DD（使用 baseDate 年份）', () => {
    const d = parseFlexibleDate('06-15', BASE_DATE)
    expect(d?.getFullYear()).toBe(2026)
    expect(d?.getMonth()).toBe(5)
  })

  it('应解析相对天数 +7', () => {
    const d = parseFlexibleDate('+7', BASE_DATE)
    expect(d?.getDate()).toBe(new Date(BASE_DATE).getDate() + 7)
  })

  it('应解析相对周 +2w', () => {
    const d = parseFlexibleDate('+2w', BASE_DATE)
    const expected = new Date(BASE_DATE)
    expected.setDate(expected.getDate() + 14)
    expect(d?.getTime()).toBe(expected.getTime())
  })

  it('应解析相对月 +1m', () => {
    const d = parseFlexibleDate('+1m', BASE_DATE)
    expect(d?.getMonth()).toBe(new Date(BASE_DATE).getMonth() + 1)
  })

  it('应解析中文日期 2月20日', () => {
    const d = parseFlexibleDate('2月20日', BASE_DATE)
    expect(d?.getMonth()).toBe(1)
    expect(d?.getDate()).toBe(20)
  })

  it('应解析中文日期（无"日"）6月15', () => {
    const d = parseFlexibleDate('6月15', BASE_DATE)
    expect(d?.getMonth()).toBe(5)
  })

  it('非法字符串返回 undefined', () => {
    expect(parseFlexibleDate('abc', BASE_DATE)).toBeUndefined()
    expect(parseFlexibleDate('', BASE_DATE)).toBeUndefined()
  })
})

// ========== parseThreeColumnTasks ==========
describe('parseThreeColumnTasks', () => {
  it('应正确解析 Tab 分隔的多行文本', () => {
    const text = '设计首页\t张三\t2026-06-15\n开发后端\t李四\t2026-07-01'
    const result = parseThreeColumnTasks(text, mockUsers, BASE_DATE)
    expect(result.tasks).toHaveLength(2)
    expect(result.validTasks).toBe(2)
    expect(result.tasks[0].taskName).toBe('设计首页')
    expect(result.tasks[0].matchedUser?.id).toBe('u1')
    expect(result.tasks[0].parsedDate?.getMonth()).toBe(5)
    expect(result.tasks[1].taskName).toBe('开发后端')
  })

  it('应正确解析多空格分隔', () => {
    const text = '设计首页  张三  2026-06-15'
    const result = parseThreeColumnTasks(text, mockUsers, BASE_DATE)
    expect(result.tasks[0].taskName).toBe('设计首页')
    expect(result.tasks[0].matchedUser?.id).toBe('u1')
  })

  it('应跳过空行', () => {
    const text = '设计首页\t张三\t2026-06-15\n\n开发后端\t李四\t2026-07-01'
    const result = parseThreeColumnTasks(text, mockUsers, BASE_DATE)
    expect(result.tasks).toHaveLength(2)
  })

  it('缺少负责人时应产生 warning', () => {
    const text = '设计首页'
    const result = parseThreeColumnTasks(text, mockUsers, BASE_DATE)
    expect(result.tasks[0].warnings.length).toBeGreaterThan(0)
    expect(result.tasks[0].isValid).toBe(true) // 缺负责人不算 error
  })

  it('缺少日期时应产生 warning', () => {
    const text = '设计首页\t张三'
    const result = parseThreeColumnTasks(text, mockUsers, BASE_DATE)
    expect(result.tasks[0].warnings.some(w => w.includes('截止日期'))).toBe(true)
  })

  it('日期格式错误时应产生 error', () => {
    const text = '设计首页\t张三\tabc'
    const result = parseThreeColumnTasks(text, mockUsers, BASE_DATE)
    expect(result.tasks[0].errors.some(e => e.includes('日期格式错误'))).toBe(true)
    expect(result.tasks[0].isValid).toBe(false)
  })

  it('未找到用户时应产生 warning', () => {
    const text = '设计首页\t不存在的人\t2026-06-15'
    const result = parseThreeColumnTasks(text, mockUsers, BASE_DATE)
    expect(result.tasks[0].warnings.some(w => w.includes('未找到用户'))).toBe(true)
    expect(result.tasks[0].matchedUser).toBeUndefined()
  })
})
