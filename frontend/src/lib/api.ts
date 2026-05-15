/**
 * PocketBase API Hooks
 * 使用 TanStack Query 封装所有数据请求
 */
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { pb, getPocketBaseErrorMessage } from './pocketbase'
import { queryKeys } from './queryClient'
import type { RecordModel } from 'pocketbase'

// ========== 类型定义 ==========
export interface Project extends RecordModel {
    name: string
    status: 'active' | 'completed' | 'archived'
    description?: string
    progress?: number
    manager?: string
    members?: string[]
    start_date?: string
    deadline?: string
    total_tasks?: number
    completed_tasks?: number
}

// ========== 统一状态枚举 ==========
export const TaskStatusEnum = {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    BLOCKED: 'blocked',
    COMPLETED: 'completed',
    OVERDUE: 'overdue',
} as const;

export type TaskStatus = typeof TaskStatusEnum[keyof typeof TaskStatusEnum];

export interface Task extends RecordModel {
    project: string
    stage_name: string
    description?: string
    completed_steps?: string
    next_steps?: string
    deadline?: string
    status: TaskStatus
    assignees?: string[]
    created_by?: string
    start_date?: string
    completed_at?: string
    sequence?: number
    blocker?: {
        reason_type: string
        reason_detail: string
        need_help_from: string[]
        expected_resolve: string
    }
    predecessor_tasks?: string[]
    next_assignees?: string[]
    is_milestone?: boolean
    priority?: 'low' | 'normal' | 'high'
    expand?: {
        project?: Project
        assignees?: User[]
        created_by?: User
    }
}

export interface User extends RecordModel {
    username: string
    name: string
    email?: string
    avatar?: string
    role: 'admin' | 'manager' | 'employee'
}

export interface Handoff extends RecordModel {
    project: string
    from_task: string
    proposed_title: string
    proposed_description?: string
    proposed_assignees?: string[]
    proposed_start_date?: string
    proposed_due_date: string
    status: 'pending' | 'approved' | 'rejected'
    submitter: string
    reviewer?: string
    review_note?: string
    approved_task?: string
    expand?: {
        project?: Project
        from_task?: Task
        submitter?: User
        proposed_assignees?: User[]
    }
}

export interface AuditLog extends RecordModel {
    project?: string
    task?: string
    action_type: string
    operator: string
    before_data?: Record<string, unknown>
    after_data?: Record<string, unknown>
    note?: string
    review_status?: 'unread' | 'read' | 'approved' | 'rejected'
    reviewed_by?: string
    expand?: {
        operator?: User
        project?: Project
        task?: Task
    }
}

export interface Comment extends RecordModel {
    project?: string
    step?: string
    author: string
    content: string
    mentions?: string[]
    expand?: {
        author?: User
    }
}

export interface Notification extends RecordModel {
    user: string
    type: string
    title: string
    content?: string
    link_type?: string
    link_id?: string
    is_read: boolean
    read_at?: string
}

export interface AISummary extends RecordModel {
    project?: string
    target_user: string
    date: string
    content: string
    risk_level: 'low' | 'medium' | 'high'
    model_used?: string
    expand?: {
        project?: Project
    }
}

// ========== 权限工具函数 ==========
export const isManagerRole = () => {
    const role = pb.authStore.model?.role
    return role === 'admin' || role === 'manager'
}
// 别名：兼容页面中 import { isManager } 的写法
export const isManager = isManagerRole

type NotificationCreateInput = {
    user: string
    type: string
    title: string
    content: string
    link_type?: string
    link_id?: string
    is_read?: boolean
    read_at?: string
}

type CreateTaskSideEffectOptions = {
    createAuditLog?: boolean
    notifyProjectAudience?: boolean
    notifyAssignees?: boolean
    projectNotificationTitle?: string
    projectNotificationContent?: string
    projectNotificationType?: string
    assigneeNotificationTitle?: string
    assigneeNotificationContent?: string
}

function getCurrentActorName() {
    return pb.authStore.model?.name || pb.authStore.model?.username || '系统'
}

function uniqueUserIds(ids: Array<string | null | undefined>) {
    return [...new Set(ids.filter((id): id is string => !!id))]
}

export function getAddedAssigneeIds(before: string[] = [], after: string[] = []) {
    const prev = new Set(before.filter(Boolean))
    return uniqueUserIds(after).filter((id) => !prev.has(id))
}

async function createNotificationRecord(input: NotificationCreateInput) {
    try {
        await pb.collection('notifications').create({
            ...input,
            is_read: input.is_read ?? false,
        })
        return true
    } catch (error) {
        console.warn('通知创建失败', {
            user: input.user,
            type: input.type,
            title: input.title,
            error: getPocketBaseErrorMessage(error),
        })
        return false
    }
}

export function invalidateNotificationQueries(queryClient: QueryClient, userIds: string[] = []) {
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
    for (const userId of uniqueUserIds(userIds)) {
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications(userId) })
        queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount(userId) })
    }
}

export async function notifyTaskAssignees(params: {
    assigneeIds: string[]
    taskId: string
    stageName: string
    title?: string
    content?: string
    excludeUserId?: string
}) {
    const title = params.title || '你有新任务'
    const content = params.content || `${getCurrentActorName()} 给你分配了任务「${params.stageName}」`

    for (const uid of uniqueUserIds(params.assigneeIds)) {
        if (uid === params.excludeUserId) continue
        await createNotificationRecord({
            user: uid,
            type: 'task_assigned',
            title,
            content,
            link_type: 'task',
            link_id: params.taskId,
        })
    }
}

export async function notifyManagersAboutTaskProgress(params: {
    managerIds: string[]
    taskId: string
    stageName: string
    statusLabel: string
    excludeUserId?: string
}) {
    const actorName = getCurrentActorName()
    for (const uid of uniqueUserIds(params.managerIds)) {
        if (uid === params.excludeUserId) continue
        await createNotificationRecord({
            user: uid,
            type: 'progress_update',
            title: '进度更新',
            content: `${actorName} 更新了「${params.stageName}」的进度: ${params.statusLabel}`,
            link_type: 'task',
            link_id: params.taskId,
        })
    }
}

export async function createTaskWithSideEffects(
    data: Partial<Task>,
    options: CreateTaskSideEffectOptions = {},
) {
    const result = await pb.collection('tasks').create<Task>(data)
    const assignees = uniqueUserIds(data.assignees || [])
    const currentUserId = pb.authStore.model?.id

    if (options.createAuditLog !== false) {
        await pb.collection('audit_logs').create({
            project: data.project,
            task: result.id,
            action_type: 'create_task',
            operator: currentUserId,
            after_data: { stage_name: data.stage_name, assignees: data.assignees },
        }).catch((error) => {
            console.warn('创建任务审计失败', getPocketBaseErrorMessage(error))
        })
    }

    if (options.notifyProjectAudience !== false && data.project) {
        await notifyProjectMembers(
            data.project,
            options.projectNotificationTitle || '新任务创建',
            options.projectNotificationContent || `${getCurrentActorName()} 创建了任务「${data.stage_name}」`,
            options.projectNotificationType || 'task_update',
            currentUserId,
            result.id,
        ).catch(() => {})
    }

    if (options.notifyAssignees !== false) {
        await notifyTaskAssignees({
            assigneeIds: assignees,
            taskId: result.id,
            stageName: data.stage_name || '未命名任务',
            title: options.assigneeNotificationTitle,
            content: options.assigneeNotificationContent,
            excludeUserId: currentUserId,
        })
    }

    return result
}

// ========== 项目 Hooks ==========
export function useProjects() {
    return useQuery({
        queryKey: queryKeys.projects,
        enabled: pb.authStore.isValid,
        queryFn: async () => {
            const userId = pb.authStore.model?.id
            const role = pb.authStore.model?.role
            
            // 管理员/经理看所有项目
            if (role === 'admin' || role === 'manager') {
                return await pb.collection('projects').getFullList<Project>({
                    sort: '-created',
                    expand: 'manager,members'
                })
            }
            
            // 普通员工：优先按 members 过滤，回退按 assignees 反查
            try {
                const byMembers = await pb.collection('projects').getFullList<Project>({
                    filter: `members ~ "${userId}"`,
                    sort: '-created',
                    expand: 'manager,members'
                })
                if (byMembers.length > 0) return byMembers
            } catch { /* members 字段可能不存在 */ }
            
            // 回退：通过任务反查项目
            const myTasks = await pb.collection('tasks').getFullList<Task>({
                filter: `assignees ~ "${userId}"`,
                fields: 'project',
            })
            const projectIds = [...new Set(myTasks.map(t => t.project))].filter(Boolean)
            if (projectIds.length === 0) return []
            
            const filter = projectIds.map(id => `id="${id}"`).join(' || ')
            return await pb.collection('projects').getFullList<Project>({
                filter,
                sort: '-created',
                expand: 'manager,members'
            })
        },
    })
}

export function useProject(id: string) {
    return useQuery({
        queryKey: queryKeys.project(id),
        queryFn: async () => {
            const record = await pb.collection('projects').getOne<Project>(id, {
                expand: 'manager',
            })
            return record
        },
        enabled: !!id && pb.authStore.isValid,
    })
}

// ========== 任务 Hooks ==========
export function useTasks(projectId?: string) {
    return useQuery({
        queryKey: projectId ? queryKeys.projectTasks(projectId) : queryKeys.tasks,
        enabled: pb.authStore.isValid && (projectId === undefined || !!projectId),
        queryFn: async () => {
            const userId = pb.authStore.model?.id
            const role = pb.authStore.model?.role
            
            let filter = projectId ? `project="${projectId}"` : ''
            
            // 普通员工且未指定项目时：只拉自己的任务
            // 指定了 projectId 时：拉整个项目的任务（时间轴需要展示所有人）
            if (!projectId && role !== 'admin' && role !== 'manager') {
                const assigneeFilter = `assignees ~ "${userId}"`
                filter = filter ? `${filter} && ${assigneeFilter}` : assigneeFilter
            }
            
            return await pb.collection('tasks').getFullList<Task>({
                filter,
                sort: 'sequence,created',
                expand: 'project,assignees',
            })
        },
    })
}

// 获取用户可见的所有任务（员工看到所属项目全部任务，用于时间轴概览）
export function useVisibleTasks() {
    return useQuery({
        queryKey: ['visible_tasks'],
        enabled: pb.authStore.isValid,
        queryFn: async () => {
            return await pb.collection('tasks').getFullList<Task>({
                sort: 'sequence,created',
                expand: 'project,assignees',
            })
        },
    })
}

export function useTask(id: string) {
    return useQuery({
        queryKey: queryKeys.task(id),
        queryFn: async () => {
            const record = await pb.collection('tasks').getOne<Task>(id, {
                expand: 'project,assignees,predecessor_tasks',
            })
            return record
        },
        enabled: !!id && pb.authStore.isValid,
    })
}

export function useMyTasks(userId: string) {
    return useQuery({
        queryKey: queryKeys.myTasks(userId),
        queryFn: async () => {
            const records = await pb.collection('tasks').getFullList<Task>({
                filter: `assignees~"${userId}"`,
                sort: '-deadline',
                expand: 'project',
            })
            return records
        },
        enabled: !!userId && pb.authStore.isValid,
    })
}

// ========== 任务 Mutations ==========
export function useUpdateTask() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: Partial<Task> }) => {
            const before = await pb.collection('tasks').getOne<Task>(id)
            const result = await pb.collection('tasks').update<Task>(id, data)
            // 审计日志
            await pb.collection('audit_logs').create({
                project: before.project,
                task: id,
                action_type: 'update_task',
                operator: pb.authStore.model?.id,
                before_data: { status: before.status, stage_name: before.stage_name, assignees: before.assignees, deadline: before.deadline },
                after_data: data,
            }).catch(() => {})
            // 通知项目全员
            const userName = pb.authStore.model?.name || pb.authStore.model?.username
            const changes = []
            if (data.status && data.status !== before.status) changes.push(`状态→${data.status}`)
            if (data.stage_name && data.stage_name !== before.stage_name) changes.push(`名称→${data.stage_name}`)
            if (data.assignees) changes.push('人员变更')
            if (data.deadline) changes.push('时间变更')
            if (changes.length > 0) {
                notifyProjectMembers(
                    before.project,
                    '任务变更',
                    `${userName} 修改了「${before.stage_name}」: ${changes.join('、')}`,
                    'task_update',
                    pb.authStore.model?.id,
                    id,
                ).catch(() => {})
            }
            return result
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.task(data.id) })
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks })
            queryClient.invalidateQueries({ queryKey: queryKeys.projects })
            queryClient.invalidateQueries({ queryKey: ['notifications'] })
            if (data.project) {
                queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(data.project) })
                queryClient.invalidateQueries({ queryKey: queryKeys.project(data.project) })
            }
        },
    })
}

export function useUpdateTaskSequence() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (updates: { id: string; sequence: number }[]) => {
            const promises = updates.map(({ id, sequence }) =>
                pb.collection('tasks').update(id, { sequence })
            )
            return await Promise.all(promises)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks })
            queryClient.invalidateQueries({ queryKey: queryKeys.projects })
        },
    })
}

export function useCreateTask() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (data: Partial<Task>) => {
            return createTaskWithSideEffects(data)
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks })
            queryClient.invalidateQueries({ queryKey: queryKeys.projects })
            if (data.project) {
                queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(data.project) })
                queryClient.invalidateQueries({ queryKey: queryKeys.project(data.project) })
            }
            invalidateNotificationQueries(queryClient, variables.assignees || [])
        },
    })
}

// ========== 交接 Hooks ==========
export function useHandoffs(status?: 'pending' | 'approved' | 'rejected') {
    return useQuery({
        queryKey: status ? [...queryKeys.handoffs, status] : queryKeys.handoffs,
        enabled: pb.authStore.isValid,
        queryFn: async () => {
            const filter = status ? `status="${status}"` : ''
            const records = await pb.collection('handoffs').getFullList<Handoff>({
                filter,
                sort: '-created',
                expand: 'project,from_task,submitter,proposed_assignees',
            })
            return records
        },
    })
}

export function usePendingHandoffs() {
    return useQuery({
        queryKey: queryKeys.pendingHandoffs,
        enabled: pb.authStore.isValid,
        queryFn: async () => {
            const records = await pb.collection('handoffs').getFullList<Handoff>({
                filter: 'status="pending"',
                sort: '-created',
                expand: 'project,from_task,submitter,proposed_assignees',
            })
            return records
        },
    })
}

export function useCreateHandoff() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (data: Partial<Handoff>) => {
            return await pb.collection('handoffs').create<Handoff>(data)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.handoffs })
            queryClient.invalidateQueries({ queryKey: queryKeys.pendingHandoffs })
        },
    })
}

export function useApproveHandoff() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, reviewNote }: { id: string; reviewNote?: string }) => {
            // 获取 handoff 详情
            const handoff = await pb.collection('handoffs').getOne<Handoff>(id)

            // 创建新任务，并给新执行人发送统一的 task_assigned 通知
            const newTask = await createTaskWithSideEffects({
                project: handoff.project,
                stage_name: handoff.proposed_title,
                next_steps: handoff.proposed_description,
                assignees: handoff.proposed_assignees,
                start_date: handoff.proposed_start_date,
                deadline: handoff.proposed_due_date,
                status: 'pending',
                sequence: Date.now(),
                predecessor_tasks: [handoff.from_task],
            }, {
                createAuditLog: false,
            })

            // 更新 handoff 状态
            await pb.collection('handoffs').update(id, {
                status: 'approved',
                reviewer: pb.authStore.model?.id,
                review_note: reviewNote,
                approved_task: newTask.id,
            })

            // ⚠️ Bug fix #1（与 useRejectHandoff Bug A 镜像）：
            // 批准 handoff 意味着接受"前序任务完成"，强制把 from_task.status
            // 同步为 completed + 写 completed_at。
            // 必要性：useMarkTaskComplete 通常已经把 from_task 设为 completed，
            // 但若中途状态被 useUpdateAuditLogStatus 拒绝过 mark_complete 而回滚成
            // in_progress / 或 from_task 经历过 blocker → 此时还残留 pending handoff，
            // 批准时必须把 from_task 强制设回 completed，否则会产生 "前序任务进行中
            // + 下游任务已创建" 的幽灵状态。
            try {
                await pb.collection('tasks').update(handoff.from_task, {
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                })
            } catch (e) {
                console.warn('sync from_task to completed failed', e)
            }

            // 记录审计日志
            await pb.collection('audit_logs').create({
                project: handoff.project,
                task: newTask.id,
                action_type: 'approve_handoff',
                operator: pb.authStore.model?.id,
                after_data: { handoff_id: id, new_task_id: newTask.id },
                note: reviewNote,
            }).catch(console.error)

            // 通知提交人
            const reviewer = pb.authStore.model
            if (handoff.submitter && handoff.submitter !== reviewer?.id) {
                await createNotificationRecord({
                    user: handoff.submitter,
                    title: '交接审核通过',
                    content: `${reviewer?.name || reviewer?.username} 批准了您的交接提报「${handoff.proposed_title}」`,
                    type: 'task_update',
                    link_type: 'task',
                    link_id: newTask.id,
                })
            }

            return newTask
        },
        onSuccess: (newTask) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.handoffs })
            queryClient.invalidateQueries({ queryKey: queryKeys.pendingHandoffs })
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks })
            queryClient.invalidateQueries({ queryKey: queryKeys.projects })
            queryClient.invalidateQueries({ queryKey: ['audit_logs'] })
            invalidateNotificationQueries(queryClient, newTask.assignees || [])
        },
    })
}

export function useRejectHandoff() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, reviewNote }: { id: string; reviewNote: string }) => {
            await pb.collection('handoffs').update(id, {
                status: 'rejected',
                reviewer: pb.authStore.model?.id,
                review_note: reviewNote,
            })

            const handoff = await pb.collection('handoffs').getOne<Handoff>(id)

            // ⚠️ Bug fix（E2E 测试发现）：回滚 from_task 状态。
            // 员工标完成时 useMarkTaskComplete 把 task.status 设为 'completed'。
            // 如果交接被驳回，意味着完成不被认可 — 任务必须回到 in_progress，
            // 否则会卡在"已完成"列表里，员工不知道要重做。
            try {
                await pb.collection('tasks').update(handoff.from_task, {
                    status: 'in_progress',
                    completed_at: null,
                })
            } catch (e) {
                console.warn('rollback from_task status failed', e)
            }

            // 记录审计日志
            await pb.collection('audit_logs').create({
                project: handoff.project,
                task: handoff.from_task,
                action_type: 'reject_handoff',
                operator: pb.authStore.model?.id,
                note: reviewNote,
            }).catch(() => {})

            // 通知提交人
            const reviewer = pb.authStore.model
            if (handoff.submitter && handoff.submitter !== reviewer?.id) {
                await createNotificationRecord({
                    user: handoff.submitter,
                    title: '交接审核驳回',
                    content: `${reviewer?.name || reviewer?.username} 驳回了您的交接提报「${handoff.proposed_title}」，原因：${reviewNote}`,
                    type: 'audit_rejected',
                    link_type: 'task',
                    link_id: handoff.from_task,
                })
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.handoffs })
            queryClient.invalidateQueries({ queryKey: queryKeys.pendingHandoffs })
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks })
            queryClient.invalidateQueries({ queryKey: ['audit_logs'] })
            invalidateNotificationQueries(queryClient)
        },
    })
}

// ========== 单任务审计日志 ==========
export function useTaskAuditLogs(taskId: string) {
    return useQuery({
        queryKey: queryKeys.auditLogs(taskId),
        queryFn: async () => {
            const records = await pb.collection('audit_logs').getFullList<AuditLog>({
                filter: `task="${taskId}"`,
                sort: '-created',
                expand: 'operator',
            })
            return records
        },
        enabled: !!taskId && pb.authStore.isValid,
    })
}

// ========== 评论 Hooks ==========
export function useComments(taskId: string) {
    return useQuery({
        queryKey: queryKeys.comments(taskId),
        queryFn: async () => {
            const records = await pb.collection('comments').getFullList<Comment>({
                filter: `step="${taskId}"`,
                sort: 'created',
                expand: 'author',
            })
            return records
        },
        enabled: !!taskId && pb.authStore.isValid,
    })
}

export function useCreateComment() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (data: { step: string; content: string; mentions?: string[] }) => {
            return await pb.collection('comments').create<Comment>({
                ...data,
                author: pb.authStore.model?.id,
            })
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.comments(data.step!) })
        },
    })
}

// ========== 用户 Hooks ==========
export function useUsers() {
    return useQuery({
        queryKey: queryKeys.users,
        enabled: pb.authStore.isValid,
        queryFn: async () => {
            const records = await pb.collection('users').getFullList<User>({
                sort: 'name',
            })
            return records
        },
    })
}

export function useCurrentUser() {
    return useQuery({
        queryKey: queryKeys.currentUser,
        enabled: pb.authStore.isValid && !!pb.authStore.model?.id,
        queryFn: async () => {
            if (!pb.authStore.isValid || !pb.authStore.model?.id) {
                return null
            }
            const record = await pb.collection('users').getOne<User>(pb.authStore.model.id)
            return record
        },
    })
}

// ========== 通知 Hooks ==========
export function useNotifications(userId: string) {
    return useQuery({
        queryKey: queryKeys.notifications(userId),
        queryFn: async () => {
            const records = await pb.collection('notifications').getFullList<Notification>({
                filter: `user="${userId}"`,
                sort: '-created',
            })
            return records
        },
        enabled: !!userId && pb.authStore.isValid,
    })
}

export function useUnreadNotificationCount(userId: string) {
    return useQuery({
        queryKey: queryKeys.unreadCount(userId),
        queryFn: async () => {
            const result = await pb.collection('notifications').getList<Notification>(1, 1, {
                filter: `user="${userId}" && is_read=false`,
            })
            return result.totalItems
        },
        enabled: !!userId && pb.authStore.isValid,
    })
}

export function useMarkNotificationRead() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (id: string) => {
            return await pb.collection('notifications').update(id, {
                is_read: true,
                read_at: new Date().toISOString(),
            })
        },
        onSuccess: () => {
            const userId = pb.authStore.model?.id
            if (userId) {
                queryClient.invalidateQueries({ queryKey: queryKeys.notifications(userId) })
                queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount(userId) })
            }
        },
    })
}

// ========== 标记任务完成（带强制交接） ==========
export function useMarkTaskComplete() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            taskId,
            handoffData
        }: {
            taskId: string
            handoffData: {
                proposedTitle: string
                proposedDescription?: string
                proposedAssignees: string[]
                proposedDueDate: string
            }
        }) => {
            const task = await pb.collection('tasks').getOne<Task>(taskId)

            // 1. 更新任务状态为完成
            await pb.collection('tasks').update(taskId, {
                status: 'completed',
            })

            // 2. 创建交接记录
            const handoff = await pb.collection('handoffs').create<Handoff>({
                project: task.project,
                from_task: taskId,
                proposed_title: handoffData.proposedTitle,
                proposed_description: handoffData.proposedDescription,
                proposed_assignees: handoffData.proposedAssignees,
                proposed_due_date: handoffData.proposedDueDate,
                status: 'pending',
                submitter: pb.authStore.model?.id,
            })

            // 3. 记录审计日志
            await pb.collection('audit_logs').create({
                project: task.project,
                task: taskId,
                action_type: 'mark_complete',
                operator: pb.authStore.model?.id,
                after_data: { handoff_id: handoff.id },
            }).catch(console.error)

            // 4. 通知项目全员
            const userName = pb.authStore.model?.name || pb.authStore.model?.username
            notifyProjectMembers(
                task.project,
                '任务完成',
                `${userName} 完成了任务「${task.stage_name}」并提交了交接提案`,
                'task_update',
                pb.authStore.model?.id,
                taskId,
            ).catch(() => {})

            return handoff
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks })
            queryClient.invalidateQueries({ queryKey: queryKeys.handoffs })
            queryClient.invalidateQueries({ queryKey: queryKeys.pendingHandoffs })
            queryClient.invalidateQueries({ queryKey: queryKeys.projects })
            queryClient.invalidateQueries({ queryKey: ['notifications'] })
            queryClient.invalidateQueries({ queryKey: ['audit_logs'] })
        },
    })
}

// ========== 标记任务卡点 ==========
export function useMarkTaskBlocked() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            taskId,
            blocker,
            rollbackToTaskId,
        }: {
            taskId: string
            blocker: {
                reason_type: string
                reason_detail: string
                need_help_from: string[]
                expected_resolve: string
                rollback_to?: string
            }
            rollbackToTaskId?: string
        }) => {
            const task = await pb.collection('tasks').getOne<Task>(taskId)

            // 更新任务状态和卡点信息
            const blockerData = { ...blocker }
            if (rollbackToTaskId) blockerData.rollback_to = rollbackToTaskId
            await pb.collection('tasks').update(taskId, {
                status: 'blocked',
                blocker: blockerData,
            })

            // 如果指定了回退目标，将目标任务重置为进行中
            if (rollbackToTaskId) {
                try {
                    await pb.collection('tasks').update(rollbackToTaskId, {
                        status: 'in_progress',
                        completed_at: null,
                    })
                    const rollbackTask = await pb.collection('tasks').getOne<Task>(rollbackToTaskId)
                    // 通知回退目标任务的负责人
                    if (rollbackTask.assignees?.length) {
                        for (const uid of rollbackTask.assignees) {
                            await createNotificationRecord({
                                user: uid,
                                type: 'task_rollback',
                                title: '任务被回退，需要重新处理',
                                content: `「${task.stage_name}」遇到卡点，「${rollbackTask.stage_name}」需要重新处理。原因：${blocker.reason_detail}`,
                                link_type: 'task',
                                link_id: rollbackToTaskId,
                            })
                        }
                    }
                } catch (e) { console.warn('回退目标任务失败', e) }
            }

            // 记录审计日志
            await pb.collection('audit_logs').create({
                project: task.project,
                task: taskId,
                action_type: 'mark_blocked',
                operator: pb.authStore.model?.id,
                after_data: { ...blockerData, rollback_to_task: rollbackToTaskId },
            }).catch(console.error)

            // 通知项目全员
            const userName = pb.authStore.model?.name || pb.authStore.model?.username
            const rollbackNote = rollbackToTaskId ? '（已回退到前序步骤）' : ''
            notifyProjectMembers(
                task.project,
                '卡点上报',
                `${userName} 上报了「${task.stage_name}」的卡点${rollbackNote}：${blocker.reason_detail}`,
                'blocker',
                pb.authStore.model?.id,
                taskId,
            ).catch(() => {})

            // 创建通知给需要帮助的人
            for (const userId of blocker.need_help_from) {
                await createNotificationRecord({
                    user: userId,
                    type: 'blocker_reported',
                    title: '有任务遇到卡点需要您协助',
                    content: blocker.reason_detail,
                    link_type: 'task',
                    link_id: taskId,
                })
            }
        },
        onSuccess: (_, { taskId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.task(taskId) })
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks })
            queryClient.invalidateQueries({ queryKey: queryKeys.projects })
            invalidateNotificationQueries(queryClient)
        },
    })
}

// ========== AI Hooks ==========
export function useAISummaries(userId: string) {
    return useQuery({
        queryKey: queryKeys.aiSummaries(userId),
        queryFn: async () => {
            const records = await pb.collection('ai_summaries').getFullList<AISummary>({
                filter: `target_user="${userId}"`,
                sort: '-created',
                expand: 'project',
            })
            return records
        },
        enabled: !!userId && pb.authStore.isValid,
    })
}

// ========== 快速创建项目 Hook ==========
export function useQuickCreateProject() {
    const queryClient = useQueryClient()
    
    return useMutation({
        mutationFn: async (data: {
            projectName: string
            projectCode?: string
            manager: string
            startDate: string
            deadline: string
            tasks: Array<{
                stage_name: string
                assignees: string[]
                deadline: string
                priority: string
                sequence: number
            }>
            members: string[]
        }) => {
            // 1. 创建项目
            const project = await pb.collection('projects').create({
                name: data.projectName,
                code: data.projectCode,
                status: 'active',
                manager: data.manager,
                start_date: data.startDate,
                deadline: data.deadline,
                members: data.members,
                progress: 0,
                total_tasks: data.tasks.length,
                completed_tasks: 0,
                created_by: pb.authStore.model?.id
            })
            
            // 2. 批量创建任务
            const createdTasks = []
            for (const task of data.tasks) {
                const created = await createTaskWithSideEffects({
                    project: project.id,
                    stage_name: task.stage_name,
                    status: 'pending' as TaskStatus,
                    assignees: task.assignees,
                    deadline: task.deadline,
                    priority: task.priority as Task['priority'],
                    sequence: task.sequence,
                    created_by: pb.authStore.model?.id,
                }, {
                    createAuditLog: false,
                    notifyProjectAudience: false,
                })
                createdTasks.push(created)
            }
            
            return { project, tasks: createdTasks }
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projects })
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks })
            const assigneeIds = variables.tasks.flatMap((task) => task.assignees || [])
            invalidateNotificationQueries(queryClient, assigneeIds)
        }
    })
}

// ========== 创建项目 ==========
export function useCreateProject() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (data: { name: string; description?: string; manager: string; members: string[]; deadline?: string }) => {
            const userName = pb.authStore.model?.name || pb.authStore.model?.username
            const project = await pb.collection('projects').create({
                name: data.name,
                description: data.description || '',
                manager: data.manager,
                members: data.members,
                deadline: data.deadline || '',
                status: 'active',
                progress: 0,
                total_tasks: 0,
                completed_tasks: 0,
            })
            // 审计日志
            await pb.collection('audit_logs').create({
                project: project.id,
                action_type: 'create_project',
                operator: pb.authStore.model?.id,
                after_data: { name: data.name, manager: data.manager, members: data.members },
            }).catch(() => {})
            // 通知项目成员
            await notifyProjectMembers(project.id, '项目创建', `${userName} 创建了新项目「${data.name}」`, 'project_update', pb.authStore.model?.id).catch(() => {})
            return project
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projects })
            queryClient.invalidateQueries({ queryKey: ['notifications'] })
            queryClient.invalidateQueries({ queryKey: ['audit_logs'] })
        },
    })
}

// ========== 删除项目 ==========
export function useDeleteProject() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (projectId: string) => {
            try {
                const project = await pb.collection('projects').getOne(projectId)
                const userName = pb.authStore.model?.name || pb.authStore.model?.username
                // 通知项目全员（删除前发送）
                await notifyProjectMembers(projectId, '项目删除', `${userName} 删除了项目「${project.name}」`, 'project_update', pb.authStore.model?.id).catch(() => {})
                // 审计日志
                await pb.collection('audit_logs').create({
                    project: projectId, action_type: 'delete_project',
                    operator: pb.authStore.model?.id,
                    before_data: { name: project.name, status: project.status },
                }).catch(() => {})
                // 删除项目下所有任务（使用 allSettled 避免部分失败阻断后续删除）
                const tasks = await pb.collection('tasks').getFullList({ filter: `project="${projectId}"`, fields: 'id' })
                await Promise.allSettled(tasks.map(t => pb.collection('tasks').delete(t.id)))
                await pb.collection('projects').delete(projectId)
            } catch (e: unknown) {
                const err = e as { status?: number }
                if (err?.status === 404) {
                    queryClient.invalidateQueries({ queryKey: queryKeys.projects })
                    queryClient.invalidateQueries({ queryKey: queryKeys.tasks })
                    queryClient.invalidateQueries({ queryKey: ['notifications'] })
                    queryClient.invalidateQueries({ queryKey: ['audit_logs'] })
                    return
                }
                throw e
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projects })
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks })
            queryClient.invalidateQueries({ queryKey: ['notifications'] })
            queryClient.invalidateQueries({ queryKey: ['audit_logs'] })
        },
    })
}

// ========== 删除任务 ==========
export function useDeleteTask() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (taskId: string) => {
            const task = await pb.collection('tasks').getOne<Task>(taskId)
            const userName = pb.authStore.model?.name || pb.authStore.model?.username
            // 审计日志
            await pb.collection('audit_logs').create({
                project: task.project, task: taskId, action_type: 'delete_task',
                operator: pb.authStore.model?.id,
                before_data: { stage_name: task.stage_name, status: task.status, assignees: task.assignees },
            }).catch(() => {})
            // 通知项目全员
            if (task.project) {
                notifyProjectMembers(task.project, '任务删除', `${userName} 删除了任务「${task.stage_name}」`, 'task_update', pb.authStore.model?.id).catch(() => {})
            }

            // ⚠️ Bug fix P0-4（Agent C 数据流审计发现）：级联清理关联记录。
            // PB 端 cascadeDelete=false，仅删 task 会留下 handoffs / notifications /
            // 下游任务的 predecessor_tasks 引用 → ReviewCenter 出现 expand 失败的
            // 幽灵记录、通知点击 404、时间轴断链。
            try {
                // 1) 关联 handoffs（from_task 或 approved_task 引用此任务）
                const hs = await pb.collection('handoffs').getFullList({
                    filter: `from_task="${taskId}" || approved_task="${taskId}"`,
                    fields: 'id',
                })
                await Promise.allSettled(hs.map((h) => pb.collection('handoffs').delete(h.id)))

                // 2) 下游任务的 predecessor_tasks 中清掉此 id
                const downstream = await pb.collection('tasks').getFullList<Task>({
                    filter: `predecessor_tasks ~ "${taskId}"`,
                    fields: 'id,predecessor_tasks',
                })
                await Promise.allSettled(downstream.map((d) => {
                    const next = (d.predecessor_tasks || []).filter((p: string) => p !== taskId)
                    return pb.collection('tasks').update(d.id, { predecessor_tasks: next })
                }))

                // 3) link_id=taskId 的 notifications（避免点击 404）
                const ns = await pb.collection('notifications').getFullList({
                    filter: `link_type="task" && link_id="${taskId}"`,
                    fields: 'id',
                })
                await Promise.allSettled(ns.map((n) => pb.collection('notifications').delete(n.id)))
            } catch (e) {
                console.warn('cascade cleanup for deleted task failed', e)
            }

            await pb.collection('tasks').delete(taskId)
            return task
        },
        onSuccess: (task) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks })
            queryClient.invalidateQueries({ queryKey: queryKeys.projects })
            queryClient.invalidateQueries({ queryKey: ['notifications'] })
            if (task?.project) {
                queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(task.project) })
                queryClient.invalidateQueries({ queryKey: queryKeys.project(task.project) })
            }
        },
    })
}

// ========== 更新项目（含成员管理）==========
export function useUpdateProject() {
    const queryClient = useQueryClient()
    const currentUser = pb.authStore.model

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: Partial<Project> }) => {
            const before = await pb.collection('projects').getOne<Project>(id)
            const result = await pb.collection('projects').update<Project>(id, data)
            // 审计日志
            await pb.collection('audit_logs').create({
                project: id, action_type: 'update_project',
                operator: currentUser?.id,
                before_data: { name: before.name, status: before.status, deadline: before.deadline },
                after_data: data,
            }).catch(() => {})
            // 通知项目全员
            const userName = currentUser?.name || currentUser?.username
            const changes: string[] = []
            if (data.name && data.name !== before.name) changes.push(`名称→${data.name}`)
            if (data.deadline && data.deadline !== before.deadline) changes.push('截止日期变更')
            if (data.status && data.status !== before.status) changes.push(`状态→${data.status}`)
            if (changes.length > 0) {
                notifyProjectMembers(id, '项目变更', `${userName} 修改了项目: ${changes.join('、')}`, 'project_update', currentUser?.id).catch(() => {})
            }
            return result
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.project(data.id) })
            queryClient.invalidateQueries({ queryKey: queryKeys.projects })
            queryClient.invalidateQueries({ queryKey: ['notifications'] })
        },
    })
}

// ========== 取消卡点（恢复任务）==========
export function useUnblockTask() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ taskId, newStatus }: { taskId: string; newStatus: 'in_progress' | 'completed' }) => {
            const task = await pb.collection('tasks').getOne<Task>(taskId)
            await pb.collection('tasks').update(taskId, {
                status: newStatus,
                blocker: null,
            })
            await pb.collection('audit_logs').create({
                project: task.project,
                task: taskId,
                action_type: 'unblock_task',
                operator: pb.authStore.model?.id,
                before_data: { status: 'blocked' },
                after_data: { status: newStatus },
            }).catch(console.error)
            // 通知项目全员
            const userName = pb.authStore.model?.name || pb.authStore.model?.username
            const statusLabel = newStatus === 'completed' ? '已完成' : '进行中'
            notifyProjectMembers(
                task.project,
                '卡点解除',
                `${userName} 解除了「${task.stage_name}」的卡点，状态变为${statusLabel}`,
                'task_update',
                pb.authStore.model?.id,
                taskId,
            ).catch(() => {})
        },
        onSuccess: (_, { taskId }) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.task(taskId) })
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks })
            queryClient.invalidateQueries({ queryKey: queryKeys.projects })
            queryClient.invalidateQueries({ queryKey: ['notifications'] })
        },
    })
}

// ========== 全局通知：通知项目全员 ==========
export async function notifyProjectMembers(
    projectId: string,
    title: string,
    content: string,
    type: string = 'project_update',
    excludeUserId?: string,
    relatedTask?: string,
) {
    try {
        const project = await pb.collection('projects').getOne(projectId)
        const members: string[] = project.members || []
        const managerId = project.manager
        const allIds = uniqueUserIds([...members, managerId])

        for (const uid of allIds) {
            if (uid === excludeUserId) continue
            await createNotificationRecord({
                user: uid,
                type,
                title,
                content,
                link_type: relatedTask ? 'task' : 'project',
                link_id: relatedTask || projectId,
            })
        }
    } catch (e) {
        console.warn('notifyProjectMembers failed', getPocketBaseErrorMessage(e))
    }
}

// ========== 批量创建/更新任务 ==========
export interface BatchTaskItem {
    id?: string // 有 id 则更新，无则创建
    stage_name: string
    assignees: string[]
    start_date?: string
    deadline: string
}

export function useBatchSaveTasks() {
    const queryClient = useQueryClient()
    const currentUser = pb.authStore.model

    return useMutation({
        mutationFn: async ({ projectId, tasks }: { projectId: string; tasks: BatchTaskItem[] }) => {
            const results: unknown[] = []
            const reassignedTasks: { stageName: string; taskId: string; newAssigneeIds: string[] }[] = []
            for (const t of tasks) {
                if (!t.stage_name?.trim()) continue
                const data = {
                    project: projectId,
                    stage_name: t.stage_name,
                    assignees: t.assignees,
                    deadline: t.deadline || undefined,
                    start_date: t.start_date || new Date().toISOString(),
                    status: 'pending' as TaskStatus,
                    created_by: currentUser?.id,
                    sequence: Date.now(),
                }
                if (t.id) {
                    const previous = await pb.collection('tasks').getOne<Task>(t.id, {
                        fields: 'id,assignees',
                    }).catch(() => null)
                    const r = await pb.collection('tasks').update(t.id, {
                        stage_name: t.stage_name,
                        assignees: t.assignees,
                        start_date: t.start_date || null,
                        deadline: t.deadline || null,
                    })
                    const addedAssigneeIds = getAddedAssigneeIds(previous?.assignees || [], t.assignees || [])
                    if (addedAssigneeIds.length > 0) {
                        reassignedTasks.push({
                            stageName: t.stage_name,
                            taskId: t.id,
                            newAssigneeIds: addedAssigneeIds,
                        })
                    }
                    results.push(r)
                } else {
                    const r = await createTaskWithSideEffects(data, {
                        createAuditLog: false,
                        notifyProjectAudience: false,
                    })
                    results.push(r)
                }
            }
            // 写审计日志
            await pb.collection('audit_logs').create({
                project: projectId,
                action_type: 'batch_edit_tasks',
                operator: currentUser?.id,
                after_data: { count: results.length },
            }).catch(() => {})

            // 通知项目成员与经理（执行人由下面对象循环单独通知，避免重复推送）
            await notifyProjectMembers(
                projectId,
                '任务批量更新',
                `${currentUser?.name || currentUser?.username} 批量编辑了 ${results.length} 个任务`,
                'task_update',
                currentUser?.id,
            ).catch(() => {})

            // 新建任务已在 createTaskWithSideEffects 内完成执行人通知；这里只补发“已有任务新增执行人”
            for (const task of reassignedTasks) {
                await notifyTaskAssignees({
                    assigneeIds: task.newAssigneeIds,
                    taskId: task.taskId,
                    stageName: task.stageName,
                    title: '你被加入了任务',
                    content: `${getCurrentActorName()} 将你加入了任务「${task.stageName}」`,
                    excludeUserId: currentUser?.id,
                })
            }
            return results
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks })
            queryClient.invalidateQueries({ queryKey: queryKeys.projects })
            const assigneeIds = variables.tasks.flatMap((task) => task.assignees || [])
            invalidateNotificationQueries(queryClient, assigneeIds)
        },
    })
}

// ========== 更新项目成员 ==========
export function useUpdateProjectMembers() {
    const queryClient = useQueryClient()
    const currentUser = pb.authStore.model

    return useMutation({
        mutationFn: async ({ projectId, members }: { projectId: string; members: string[] }) => {
            const before = await pb.collection('projects').getOne(projectId)
            const result = await pb.collection('projects').update(projectId, { members })
            await pb.collection('audit_logs').create({
                project: projectId,
                action_type: 'update_members',
                operator: currentUser?.id,
                before_data: { members: before.members },
                after_data: { members },
            }).catch(console.error)
            await notifyProjectMembers(
                projectId,
                '项目成员变更',
                `${currentUser?.name || currentUser?.username} 更新了项目成员`,
                'project_update',
                currentUser?.id,
            ).catch(console.error)
            return result
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projects })
            queryClient.invalidateQueries({ queryKey: ['notifications'] })
        },
    })
}

// ========== 归档/取消归档项目 ==========
export function useArchiveProject() {
    const queryClient = useQueryClient()
    const currentUser = pb.authStore.model

    return useMutation({
        mutationFn: async ({ projectId, archived = true }: { projectId: string; archived?: boolean }) => {
            const newStatus = archived ? 'archived' : 'active'
            const result = await pb.collection('projects').update(projectId, { status: newStatus })
            await pb.collection('audit_logs').create({
                project: projectId,
                action_type: archived ? 'archive_project' : 'unarchive_project',
                operator: currentUser?.id,
                after_data: { status: newStatus },
            }).catch(() => {})
            // 通知项目全员
            const userName = currentUser?.name || currentUser?.username
            const label = archived ? '归档' : '取消归档'
            notifyProjectMembers(projectId, `项目${label}`, `${userName} ${label}了项目`, 'project_update', currentUser?.id).catch(() => {})
            return result
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.projects })
            queryClient.invalidateQueries({ queryKey: ['notifications'] })
        },
    })
}

// ========== 审计日志查询 ==========
export function useAuditLogs(filters?: { project?: string; action_type?: string; review_status?: string; search?: string }) {
    return useQuery({
        queryKey: ['audit_logs', filters],
        enabled: pb.authStore.isValid,
        queryFn: async () => {
            const parts: string[] = []
            if (filters?.project) parts.push(`project="${filters.project}"`)
            if (filters?.action_type) parts.push(`action_type="${filters.action_type}"`)
            if (filters?.review_status) {
              if (filters.review_status === 'unread') {
                parts.push(`(review_status != "read" && review_status != "approved" && review_status != "rejected")`)
              } else {
                parts.push(`review_status="${filters.review_status}"`)
              }
            }
            if (filters?.search) {
              const escaped = filters.search.replace(/"/g, '\\"')
              parts.push(`(note ~ "${escaped}" || action_type ~ "${escaped}")`)
            }
            const filter = parts.length > 0 ? parts.join(' && ') : ''
            return await pb.collection('audit_logs').getFullList({
                filter,
                sort: '-created',
                expand: 'operator,project,task',
            })
        },
        staleTime: 10 * 1000,
    })
}

// ========== 未复核审计日志计数 (独立于 tab) ==========
export function useUnreadAuditCount() {
    return useQuery({
        queryKey: ['audit_logs', 'unread_count'],
        enabled: pb.authStore.isValid,
        queryFn: async () => {
            const result = await pb.collection('audit_logs').getList(1, 1, {
                filter: 'review_status != "read" && review_status != "approved" && review_status != "rejected"',
            })
            return result.totalItems
        },
        staleTime: 10 * 1000,
    })
}

// ========== 更新审计日志复核状态 ==========
export function useUpdateAuditLogStatus() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, review_status, reject_note }: { id: string; review_status: 'read' | 'approved' | 'rejected'; reject_note?: string }) => {
            // 先读取审计日志详情
            const auditLog = await pb.collection('audit_logs').getOne(id)

            // 拒绝 mark_complete 时，回滚任务状态
            if (review_status === 'rejected' && auditLog.action_type === 'mark_complete' && auditLog.task) {
                try {
                    const task = await pb.collection('tasks').getOne(auditLog.task)
                    if (task.status === 'completed') {
                        // 判断是否逾期：有截止日期且已过期 → overdue，否则 → in_progress
                        const isOverdue = task.deadline && new Date(task.deadline) < new Date()
                        await pb.collection('tasks').update(auditLog.task, {
                            status: isOverdue ? 'overdue' : 'in_progress',
                            completed_at: null,
                        })
                    }
                } catch (e) { console.warn('回滚任务状态失败', e) }
            }

            // 拒绝 update_task 时，回滚到 before_data
            if (review_status === 'rejected' && auditLog.action_type === 'update_task' && auditLog.task && auditLog.before_data) {
                try {
                    const rollbackData: Record<string, unknown> = {}
                    const before = auditLog.before_data as Record<string, unknown>
                    const after = auditLog.after_data as Record<string, unknown>
                    // 只回滚实际被修改的字段
                    for (const key of Object.keys(after || {})) {
                        if (key in before) rollbackData[key] = before[key]
                    }
                    if (Object.keys(rollbackData).length > 0) {
                        await pb.collection('tasks').update(auditLog.task, rollbackData)
                    }
                } catch (e) { console.warn('回滚任务变更失败', e) }
            }

            // 更新审计日志状态
            let result
            try {
                result = await pb.collection('audit_logs').update(id, {
                    review_status,
                    reviewed_by: pb.authStore.model?.id,
                    ...(reject_note ? { reject_note } : {}),
                })
            } catch (updateErr: unknown) {
                console.error('更新审计日志失败', updateErr)
                throw new Error(getPocketBaseErrorMessage(updateErr, '更新审计日志失败'))
            }

            // 拒绝时通知操作人
            if (review_status === 'rejected' && auditLog.operator) {
                const reviewerName = pb.authStore.model?.name || pb.authStore.model?.username || '管理员'
                const actionLabel = auditLog.action_type === 'mark_complete' ? '任务完成' : auditLog.action_type === 'update_task' ? '任务修改' : '操作'
                await createNotificationRecord({
                    user: auditLog.operator,
                    type: 'audit_rejected',
                    title: `${actionLabel}被拒绝`,
                    content: `${reviewerName} 拒绝了您的${actionLabel}${reject_note ? '，原因：' + reject_note : ''}`,
                    link_type: auditLog.task ? 'task' : 'project',
                    link_id: auditLog.task || auditLog.project || '',
                })
            }

            return result
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['audit_logs'] })
            queryClient.invalidateQueries({ queryKey: ['audit_logs', 'unread_count'] })
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks })
            queryClient.invalidateQueries({ queryKey: ['visible_tasks'] })
            queryClient.invalidateQueries({ queryKey: queryKeys.projects })
            const uid = pb.authStore.model?.id
            invalidateNotificationQueries(queryClient, uid ? [uid] : [])
        },
    })
}
