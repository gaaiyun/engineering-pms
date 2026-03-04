/**
 * Store tests - Zustand state management
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore, useHandoffDraftStore, useBlockerDraftStore } from './store'

describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      kanbanView: 'board',
      sidebarCollapsed: false,
      draggingTaskId: null,
      filters: { status: [], priority: [], assignee: null },
    })
  })

  it('default kanban view is board', () => {
    expect(useUIStore.getState().kanbanView).toBe('board')
  })

  it('can change kanban view', () => {
    useUIStore.getState().setKanbanView('timeline')
    expect(useUIStore.getState().kanbanView).toBe('timeline')
  })

  it('can toggle sidebar', () => {
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)
    useUIStore.getState().toggleSidebar()
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)
    useUIStore.getState().toggleSidebar()
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)
  })

  it('can set dragging task', () => {
    useUIStore.getState().setDraggingTaskId('t1')
    expect(useUIStore.getState().draggingTaskId).toBe('t1')
    useUIStore.getState().setDraggingTaskId(null)
    expect(useUIStore.getState().draggingTaskId).toBeNull()
  })

  it('can set and reset filters', () => {
    useUIStore.getState().setFilters({ status: ['pending', 'blocked'] })
    expect(useUIStore.getState().filters.status).toEqual(['pending', 'blocked'])
    expect(useUIStore.getState().filters.assignee).toBeNull()

    useUIStore.getState().resetFilters()
    expect(useUIStore.getState().filters.status).toEqual([])
  })
})

describe('useHandoffDraftStore', () => {
  beforeEach(() => {
    useHandoffDraftStore.getState().clearDraft()
  })

  it('starts with null draft', () => {
    expect(useHandoffDraftStore.getState().draft).toBeNull()
  })

  it('can set and clear draft', () => {
    const draft = {
      fromTaskId: 't1',
      proposedTitle: '下一步任务',
      proposedDescription: '描述',
      proposedAssignees: ['u1'],
      proposedDueDate: '2026-04-01',
    }
    useHandoffDraftStore.getState().setDraft(draft)
    expect(useHandoffDraftStore.getState().draft).toEqual(draft)

    useHandoffDraftStore.getState().clearDraft()
    expect(useHandoffDraftStore.getState().draft).toBeNull()
  })

  it('can update draft partially', () => {
    useHandoffDraftStore.getState().setDraft({
      fromTaskId: 't1',
      proposedTitle: '原标题',
      proposedDescription: '',
      proposedAssignees: [],
      proposedDueDate: '',
    })
    useHandoffDraftStore.getState().updateDraft({ proposedTitle: '新标题' })
    expect(useHandoffDraftStore.getState().draft?.proposedTitle).toBe('新标题')
    expect(useHandoffDraftStore.getState().draft?.fromTaskId).toBe('t1')
  })

  it('update on null draft does nothing', () => {
    useHandoffDraftStore.getState().updateDraft({ proposedTitle: '新标题' })
    expect(useHandoffDraftStore.getState().draft).toBeNull()
  })
})

describe('useBlockerDraftStore', () => {
  beforeEach(() => {
    useBlockerDraftStore.getState().clearDraft()
  })

  it('can set blocker draft', () => {
    const draft = {
      taskId: 't1',
      reasonType: 'other' as const,
      reasonDetail: '等待甲方审批',
      needHelpFrom: ['u2'],
      expectedResolve: '2026-04-01',
    }
    useBlockerDraftStore.getState().setDraft(draft)
    expect(useBlockerDraftStore.getState().draft?.reasonDetail).toBe('等待甲方审批')
  })
})
