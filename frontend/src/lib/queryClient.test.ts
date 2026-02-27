import { describe, it, expect } from 'vitest'
import { queryKeys } from './queryClient'

describe('queryKeys', () => {
  it('projects 应为 ["projects"]', () => {
    expect(queryKeys.projects).toEqual(['projects'])
  })

  it('project(id) 应为 ["projects", id]', () => {
    expect(queryKeys.project('p1')).toEqual(['projects', 'p1'])
  })

  it('projectTasks(id) 应为 ["projects", id, "tasks"]', () => {
    expect(queryKeys.projectTasks('p1')).toEqual(['projects', 'p1', 'tasks'])
  })

  it('tasks 应为 ["tasks"]', () => {
    expect(queryKeys.tasks).toEqual(['tasks'])
  })

  it('task(id) 应为 ["tasks", id]', () => {
    expect(queryKeys.task('t1')).toEqual(['tasks', 't1'])
  })

  it('myTasks(userId) 应为 ["tasks", "user", userId]', () => {
    expect(queryKeys.myTasks('u1')).toEqual(['tasks', 'user', 'u1'])
  })

  it('handoffs 应为 ["handoffs"]', () => {
    expect(queryKeys.handoffs).toEqual(['handoffs'])
  })

  it('pendingHandoffs 应为 ["handoffs", "pending"]', () => {
    expect(queryKeys.pendingHandoffs).toEqual(['handoffs', 'pending'])
  })

  it('notifications(userId) 应包含 userId', () => {
    expect(queryKeys.notifications('u1')).toEqual(['notifications', 'u1'])
  })

  it('unreadCount(userId) 应包含 "unread"', () => {
    expect(queryKeys.unreadCount('u1')).toEqual(['notifications', 'u1', 'unread'])
  })

  it('auditLogs(taskId) 应为 ["audit_logs", taskId]', () => {
    expect(queryKeys.auditLogs('t1')).toEqual(['audit_logs', 't1'])
  })

  it('comments(taskId) 应为 ["comments", taskId]', () => {
    expect(queryKeys.comments('t1')).toEqual(['comments', 't1'])
  })

  it('aiSummaries(userId) 应为 ["ai_summaries", userId]', () => {
    expect(queryKeys.aiSummaries('u1')).toEqual(['ai_summaries', 'u1'])
  })
})
