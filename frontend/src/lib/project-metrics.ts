import type { Task } from './api'

export type ProjectMetrics = {
  total: number
  completed: number
  progress: number
}

export function buildProjectMetrics(tasks: Array<Pick<Task, 'project' | 'status'>>): Record<string, ProjectMetrics> {
  const result: Record<string, ProjectMetrics> = {}

  for (const task of tasks) {
    if (!task.project) continue
    const metrics = result[task.project] || { total: 0, completed: 0, progress: 0 }
    metrics.total += 1
    if (task.status === 'completed') metrics.completed += 1
    metrics.progress = Math.round((metrics.completed / metrics.total) * 1000) / 10
    result[task.project] = metrics
  }

  return result
}
