/**
 * Zustand 全局状态管理
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ========== UI 状态 Store ==========
interface UIState {
    // 看板视图模式
    kanbanView: 'board' | 'timeline' | 'list'
    setKanbanView: (view: 'board' | 'timeline' | 'list') => void

    // 侧边栏状态（桌面端）
    sidebarCollapsed: boolean
    toggleSidebar: () => void

    // 正在拖拽的任务
    draggingTaskId: string | null
    setDraggingTaskId: (id: string | null) => void

    // 过滤器
    filters: {
        status: string[]
        priority: string[]
        assignee: string | null
    }
    setFilters: (filters: Partial<UIState['filters']>) => void
    resetFilters: () => void
}

export const useUIStore = create<UIState>()(
    persist(
        (set) => ({
            kanbanView: 'board',
            setKanbanView: (view) => set({ kanbanView: view }),

            sidebarCollapsed: false,
            toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

            draggingTaskId: null,
            setDraggingTaskId: (id) => set({ draggingTaskId: id }),

            filters: {
                status: [],
                priority: [],
                assignee: null,
            },
            setFilters: (filters) => set((state) => ({
                filters: { ...state.filters, ...filters }
            })),
            resetFilters: () => set({
                filters: { status: [], priority: [], assignee: null }
            }),
        }),
        {
            name: 'ui-storage',
            partialize: (state) => ({
                kanbanView: state.kanbanView,
                sidebarCollapsed: state.sidebarCollapsed,
            }),
        }
    )
)

// ========== 交接草稿 Store ==========
interface HandoffDraft {
    fromTaskId: string
    proposedTitle: string
    proposedDescription: string
    proposedAssignees: string[]
    proposedDueDate: string
}

interface HandoffDraftState {
    draft: HandoffDraft | null
    setDraft: (draft: HandoffDraft | null) => void
    updateDraft: (updates: Partial<HandoffDraft>) => void
    clearDraft: () => void
}

export const useHandoffDraftStore = create<HandoffDraftState>()((set) => ({
    draft: null,
    setDraft: (draft) => set({ draft }),
    updateDraft: (updates) => set((state) => ({
        draft: state.draft ? { ...state.draft, ...updates } : null
    })),
    clearDraft: () => set({ draft: null }),
}))

// ========== 卡点上报 Store ==========
interface BlockerDraft {
    taskId: string
    reasonType: 'waiting_materials' | 'waiting_approval' | 'technical_issue' | 'external_dependency' | 'other'
    reasonDetail: string
    needHelpFrom: string[]
    expectedResolve: string
}

interface BlockerDraftState {
    draft: BlockerDraft | null
    setDraft: (draft: BlockerDraft | null) => void
    updateDraft: (updates: Partial<BlockerDraft>) => void
    clearDraft: () => void
}

export const useBlockerDraftStore = create<BlockerDraftState>()((set) => ({
    draft: null,
    setDraft: (draft) => set({ draft }),
    updateDraft: (updates) => set((state) => ({
        draft: state.draft ? { ...state.draft, ...updates } : null
    })),
    clearDraft: () => set({ draft: null }),
}))

// ========== 实时通知 Store ==========
interface NotificationState {
    unreadCount: number
    setUnreadCount: (count: number) => void
    incrementUnread: () => void
    decrementUnread: () => void
}

export const useNotificationStore = create<NotificationState>()((set) => ({
    unreadCount: 0,
    setUnreadCount: (count) => set({ unreadCount: count }),
    incrementUnread: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),
    decrementUnread: () => set((state) => ({ unreadCount: Math.max(0, state.unreadCount - 1) })),
}))
