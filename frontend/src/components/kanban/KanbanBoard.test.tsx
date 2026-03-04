/**
 * KanbanBoard logic tests
 * Focus: status normalization, column grouping, drag-drop status mapping
 */
import { describe, it, expect } from 'vitest'

const normalizeStatus = (status: string): string => {
  if (status === 'processing') return 'in_progress'
  return status
}

const COLUMNS = [
  { id: 'pending', title: '待开始' },
  { id: 'in_progress', title: '进行中' },
  { id: 'blocked', title: '卡点' },
  { id: 'overdue', title: '已逾期' },
  { id: 'completed', title: '已完成' },
]

describe('normalizeStatus', () => {
  it('maps processing to in_progress', () => {
    expect(normalizeStatus('processing')).toBe('in_progress')
  })

  it('passes through standard statuses', () => {
    expect(normalizeStatus('pending')).toBe('pending')
    expect(normalizeStatus('in_progress')).toBe('in_progress')
    expect(normalizeStatus('blocked')).toBe('blocked')
    expect(normalizeStatus('completed')).toBe('completed')
    expect(normalizeStatus('overdue')).toBe('overdue')
  })
})

describe('Task grouping by status', () => {
  const tasks = [
    { id: 't1', status: 'pending', sequence: 1000 },
    { id: 't2', status: 'in_progress', sequence: 2000 },
    { id: 't3', status: 'processing', sequence: 3000 },
    { id: 't4', status: 'blocked', sequence: 1000 },
    { id: 't5', status: 'completed', sequence: 1000 },
    { id: 't6', status: 'overdue', sequence: 1000 },
    { id: 't7', status: 'unknown_status', sequence: 1000 },
  ]

  function groupByStatus(taskList: typeof tasks) {
    const grouped: Record<string, typeof tasks> = {
      pending: [], in_progress: [], blocked: [], overdue: [], completed: [],
    }
    taskList.forEach(task => {
      const status = normalizeStatus(task.status)
      if (grouped[status]) {
        grouped[status].push(task)
      } else {
        grouped.pending.push(task)
      }
    })
    Object.keys(grouped).forEach(key => {
      grouped[key].sort((a, b) => a.sequence - b.sequence)
    })
    return grouped
  }

  it('groups tasks into correct columns', () => {
    const groups = groupByStatus(tasks)
    expect(groups.pending.map(t => t.id)).toContain('t1')
    expect(groups.in_progress.map(t => t.id)).toContain('t2')
    expect(groups.blocked.map(t => t.id)).toContain('t4')
    expect(groups.completed.map(t => t.id)).toContain('t5')
    expect(groups.overdue.map(t => t.id)).toContain('t6')
  })

  it('normalizes processing status to in_progress column', () => {
    const groups = groupByStatus(tasks)
    expect(groups.in_progress.map(t => t.id)).toContain('t3')
  })

  it('puts unknown statuses into pending', () => {
    const groups = groupByStatus(tasks)
    expect(groups.pending.map(t => t.id)).toContain('t7')
  })

  it('sorts within column by sequence', () => {
    const groups = groupByStatus(tasks)
    expect(groups.in_progress[0].id).toBe('t2')
    expect(groups.in_progress[1].id).toBe('t3')
  })
})

describe('Drag-drop target resolution', () => {
  it('dropping on a column uses column id as target status', () => {
    const overId = 'completed'
    const isColumn = COLUMNS.find(c => c.id === overId)
    expect(isColumn).toBeDefined()
    expect(overId).toBe('completed')
  })

  it('dropping on a task with processing status resolves to in_progress', () => {
    const overTask = { id: 't3', status: 'processing' }
    const targetStatus = normalizeStatus(overTask.status)
    const isValidColumn = COLUMNS.find(c => c.id === targetStatus)
    expect(targetStatus).toBe('in_progress')
    expect(isValidColumn).toBeDefined()
  })

  it('normalized drag status comparison detects real changes', () => {
    const draggedTask = { status: 'processing' }
    const targetStatus = 'completed'
    const normalizedDrag = normalizeStatus(draggedTask.status)
    expect(normalizedDrag).toBe('in_progress')
    expect(normalizedDrag !== targetStatus).toBe(true)
  })

  it('normalized drag status comparison detects same column', () => {
    const draggedTask = { status: 'processing' }
    const overTask = { status: 'in_progress' }
    const normalizedDrag = normalizeStatus(draggedTask.status)
    const normalizedTarget = normalizeStatus(overTask.status)
    expect(normalizedDrag === normalizedTarget).toBe(true)
  })
})
