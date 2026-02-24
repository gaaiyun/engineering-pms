/**
 * 任务解析工具
 * 支持三列文本格式的任务批量导入
 */

import type { User } from './api'

// 解析后的任务行
export interface ParsedTaskRow {
  lineNumber: number
  taskName: string
  assigneeName: string
  deadline: string
  
  // 验证状态
  isValid: boolean
  errors: string[]
  warnings: string[]
  
  // 匹配结果
  matchedUser?: User
  parsedDate?: Date
}

// 解析结果
export interface ParseResult {
  tasks: ParsedTaskRow[]
  totalLines: number
  validTasks: number
  errors: string[]
  warnings: string[]
}

/**
 * 解析三列文本格式的任务列表
 * @param text 多行文本，每行格式：任务名 \t 负责人 \t 日期
 * @param users 用户列表（用于匹配负责人）
 * @param projectStartDate 项目开始日期（用于相对日期计算）
 */
export function parseThreeColumnTasks(
  text: string,
  users: User[],
  projectStartDate: string
): ParseResult {
  const lines = text.split('\n')
  const tasks: ParsedTaskRow[] = []
  const globalErrors: string[] = []
  const globalWarnings: string[] = []
  
  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) return // 跳过空行
    
    const lineNumber = index + 1
    const errors: string[] = []
    const warnings: string[] = []
    
    // 1. 分割列（支持 Tab 或多个空格）
    const columns = trimmed.split(/\t+|\s{2,}/).map(c => c.trim())
    
    if (columns.length < 1 || !columns[0]) {
      errors.push('任务名称不能为空')
    }
    if (columns.length < 2 || !columns[1]) {
      warnings.push('未指定负责人，将使用项目经理')
    }
    if (columns.length < 3 || !columns[2]) {
      warnings.push('未指定截止日期，将使用项目截止日期')
    }
    
    const taskName = columns[0] || ''
    const assigneeName = columns[1] || ''
    const deadlineStr = columns[2] || ''
    
    // 2. 匹配负责人
    let matchedUser: User | undefined
    if (assigneeName) {
      matchedUser = findUserByName(assigneeName, users)
      if (!matchedUser) {
        warnings.push(`未找到用户"${assigneeName}"`)
      }
    }
    
    // 3. 解析日期
    let parsedDate: Date | undefined
    if (deadlineStr) {
      parsedDate = parseFlexibleDate(deadlineStr, projectStartDate)
      if (!parsedDate) {
        errors.push(`日期格式错误: "${deadlineStr}"`)
      }
    }
    
    tasks.push({
      lineNumber,
      taskName,
      assigneeName,
      deadline: deadlineStr,
      isValid: errors.length === 0,
      errors,
      warnings,
      matchedUser,
      parsedDate
    })
  })
  
  return {
    tasks,
    totalLines: lines.length,
    validTasks: tasks.filter(t => t.isValid).length,
    errors: globalErrors,
    warnings: globalWarnings
  }
}

/**
 * 智能匹配用户
 * 支持：姓名、用户名、邮箱
 */
export function findUserByName(name: string, users: User[]): User | undefined {
  const lowerName = name.toLowerCase()
  
  return users.find(u => 
    u.name?.toLowerCase() === lowerName ||
    u.username?.toLowerCase() === lowerName ||
    u.email?.toLowerCase() === lowerName ||
    u.name?.includes(name) ||
    name.includes(u.name || '')
  )
}

/**
 * 灵活的日期解析
 * 支持多种格式
 */
export function parseFlexibleDate(
  dateStr: string, 
  baseDate: string
): Date | undefined {
  const base = new Date(baseDate)
  
  // 格式1: 完整日期 2026-02-20, 2026/02/20
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(dateStr)) {
    const date = new Date(dateStr.replace(/\//g, '-'))
    if (!isNaN(date.getTime())) return date
  }
  
  // 格式2: 简短日期 02-20, 2/20 (使用项目年份)
  if (/^\d{1,2}[-/]\d{1,2}$/.test(dateStr)) {
    const [month, day] = dateStr.split(/[-/]/).map(Number)
    const year = base.getFullYear()
    const date = new Date(year, month - 1, day)
    if (!isNaN(date.getTime())) return date
  }
  
  // 格式3: 相对日期 +7 (7天后), +2w (2周后), +1m (1个月后)
  if (/^\+\d+[dwm]?$/.test(dateStr)) {
    const match = dateStr.match(/^\+(\d+)([dwm]?)$/)
    if (match) {
      const value = parseInt(match[1])
      const unit = match[2] || 'd'
      const date = new Date(base)
      
      if (unit === 'd') date.setDate(date.getDate() + value)
      else if (unit === 'w') date.setDate(date.getDate() + value * 7)
      else if (unit === 'm') date.setMonth(date.getMonth() + value)
      
      return date
    }
  }
  
  // 格式4: 中文日期 2月20日
  if (/^\d{1,2}月\d{1,2}日?$/.test(dateStr)) {
    const match = dateStr.match(/^(\d{1,2})月(\d{1,2})/)
    if (match) {
      const month = parseInt(match[1])
      const day = parseInt(match[2])
      const year = base.getFullYear()
      const date = new Date(year, month - 1, day)
      if (!isNaN(date.getTime())) return date
    }
  }
  
  return undefined
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}


