import { describe, expect, it } from 'vitest'
import { buildProjectMetrics } from './project-metrics'
import type { Task } from './api'

describe('buildProjectMetrics', () => {
  it('使用项目任务实时计算完成率', () => {
    const tasks = [
      ...Array.from({ length: 6 }, () => ({ project: 'project-a', status: 'completed' as const })),
      ...Array.from({ length: 2 }, () => ({ project: 'project-a', status: 'pending' as const })),
    ] as Array<Pick<Task, 'project' | 'status'>>

    expect(buildProjectMetrics(tasks)['project-a']).toEqual({ total: 8, completed: 6, progress: 75 })
  })

  it('分别统计多个项目且忽略无项目任务', () => {
    const tasks = [
      { project: 'a', status: 'completed' },
      { project: 'b', status: 'pending' },
      { project: '', status: 'completed' },
    ] as Array<Pick<Task, 'project' | 'status'>>

    expect(buildProjectMetrics(tasks)).toEqual({
      a: { total: 1, completed: 1, progress: 100 },
      b: { total: 1, completed: 0, progress: 0 },
    })
  })
})
