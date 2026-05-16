/**
 * TanStack Query 配置
 */
import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query'
import { Toast } from 'antd-mobile'

// Bug fix E1（Agent L Round 4）：PB 服务器不可达时缺 user-facing 错误提示。
// 原版只有 console.error 和 pageerror，用户看不到。改加全局 onError 触发 Toast。
// 仅在"网络/服务器"类错误显示，业务 4xx 不打扰（业务错误由各 mutation 自己处理）。
let lastNetworkErrorAt = 0
const NETWORK_ERROR_TOAST_COOLDOWN_MS = 5000

function shouldShowNetworkToast(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false
    const e = err as { status?: number; isAbort?: boolean; message?: string; originalError?: { name?: string } }
    if (e.isAbort) return false
    // PB 网络问题或服务器错误
    if (e.status === 0 || (typeof e.status === 'number' && e.status >= 500)) return true
    if (e.originalError?.name === 'TypeError') return true // fetch failed
    if (e.message?.includes('Failed to fetch')) return true
    if (e.message?.includes('NetworkError')) return true
    return false
}

function showNetworkErrorToast() {
    const now = Date.now()
    if (now - lastNetworkErrorAt < NETWORK_ERROR_TOAST_COOLDOWN_MS) return
    lastNetworkErrorAt = now
    try {
        Toast.show({ icon: 'fail', content: '服务器连接失败，请检查网络后重试', duration: 3000 })
    } catch {
        // ignore (e.g. SSR or before antd-mobile mounted)
    }
}

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 15, // 15 秒内数据视为新鲜（多人协作需要更快刷新）
            gcTime: 1000 * 60 * 10, // 10 分钟后垃圾回收
            retry: 2,
            refetchOnWindowFocus: true, // 切回窗口时自动刷新
        },
        mutations: {
            retry: 0,
        },
    },
    queryCache: new QueryCache({
        onError: (err) => {
            if (shouldShowNetworkToast(err)) showNetworkErrorToast()
        },
    }),
    mutationCache: new MutationCache({
        onError: (err) => {
            if (shouldShowNetworkToast(err)) showNetworkErrorToast()
        },
    }),
})

// Query Keys 统一管理
export const queryKeys = {
    // 项目相关
    projects: ['projects'] as const,
    project: (id: string) => ['projects', id] as const,
    projectTasks: (projectId: string) => ['projects', projectId, 'tasks'] as const,

    // 任务相关
    tasks: ['tasks'] as const,
    task: (id: string) => ['tasks', id] as const,
    myTasks: (userId: string) => ['tasks', 'user', userId] as const,

    // 交接相关
    handoffs: ['handoffs'] as const,
    handoff: (id: string) => ['handoffs', id] as const,
    pendingHandoffs: ['handoffs', 'pending'] as const,

    // 审计日志
    auditLogs: (taskId: string) => ['audit_logs', taskId] as const,

    // 评论
    comments: (taskId: string) => ['comments', taskId] as const,

    // 用户相关
    users: ['users'] as const,
    user: (id: string) => ['users', id] as const,
    currentUser: ['currentUser'] as const,

    // 通知
    notifications: (userId: string) => ['notifications', userId] as const,
    unreadCount: (userId: string) => ['notifications', userId, 'unread'] as const,

    // AI
    aiSummaries: (userId: string) => ['ai_summaries', userId] as const,
}
