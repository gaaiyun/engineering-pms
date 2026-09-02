import type { Task } from '../../lib/api'

export function normalizeKanbanStatus(status: string): string {
  return status === 'processing' ? 'in_progress' : status
}

export function buildCrossColumnSequence(
  tasks: Pick<Task, 'id' | 'status'>[],
  draggedTask: Pick<Task, 'id' | 'status'>,
  targetStatus: string,
  targetTaskId?: string,
) {
  const targetColumn = tasks.filter(task => (
    task.id !== draggedTask.id && normalizeKanbanStatus(task.status) === targetStatus
  ))
  const targetTaskIndex = targetTaskId
    ? targetColumn.findIndex(task => task.id === targetTaskId)
    : -1
  const targetIndex = targetTaskIndex >= 0 ? targetTaskIndex : targetColumn.length
  const reordered = targetColumn.slice()
  reordered.splice(targetIndex, 0, { ...draggedTask, status: targetStatus as Task['status'] })
  return reordered.map((task, index) => ({ id: task.id, sequence: index * 1000 }))
}
