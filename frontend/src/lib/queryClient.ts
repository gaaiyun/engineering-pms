/**
 * TanStack Query 配置
 */
import { QueryClient } from '@tanstack/react-query'

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
