/**
 * 看板主组件
 * 支持触控拖拽、状态分组、乐观更新
 */
import React, { useState, useMemo, useCallback } from 'react'
import {
    DndContext,
    DragOverlay,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable'
import { NavBar, Toast, Popup } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'
import { KanbanColumn } from './KanbanColumn'
import { TaskCardOverlay } from './TaskCard'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import { useTasks, useUpdateTask, useUpdateTaskSequence, isManagerRole, type Task } from '../../lib/api'
import { useUIStore } from '../../lib/store'
import './KanbanBoard.css'

interface KanbanBoardProps {
    projectId: string
    projectName?: string
}

// 状态列配置 - 与数据库统一
const COLUMNS = [
    { id: 'pending', title: '待开始', color: '#8c8c8c' },
    { id: 'in_progress', title: '进行中', color: '#1890ff' },
    { id: 'blocked', title: '卡点', color: '#faad14' },
    { id: 'overdue', title: '已逾期', color: '#ff4d4f' },
    { id: 'completed', title: '已完成', color: '#52c41a' },
]

// 状态映射：兼容旧数据
const normalizeStatus = (status: string): string => {
    if (status === 'processing') return 'in_progress';
    return status;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ projectId, projectName }) => {
    const navigate = useNavigate()
    const { data: tasks = [], isLoading } = useTasks(projectId)
    const updateTask = useUpdateTask()
    const updateSequence = useUpdateTaskSequence()

    const [activeTask, setActiveTask] = useState<Task | null>(null)
    const [selectedTask, setSelectedTask] = useState<Task | null>(null)
    const [drawerVisible, setDrawerVisible] = useState(false)

    const { setDraggingTaskId } = useUIStore()
    const canDrag = isManagerRole()

    // 配置传感器：员工禁用拖拽，经理使用长按触发
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: canDrag ? 8 : Infinity,
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: canDrag ? 250 : 99999999,
                tolerance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    // 按状态分组任务 - 使用规范化状态
    const tasksByStatus = useMemo(() => {
        const grouped: Record<string, Task[]> = {
            pending: [],
            in_progress: [],
            blocked: [],
            overdue: [],
            completed: [],
        }

        tasks.forEach((task) => {
            const status = normalizeStatus(task.status || 'pending')
            if (grouped[status]) {
                grouped[status].push(task)
            } else {
                grouped.pending.push(task)
            }
        })

        // 按 sequence 排序
        Object.keys(grouped).forEach((key) => {
            grouped[key].sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
        })

        return grouped
    }, [tasks])

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const task = tasks.find(t => t.id === event.active.id)
        setActiveTask(task || null)
        setDraggingTaskId(task?.id || null)
    }, [tasks, setDraggingTaskId])

    const handleDragEnd = useCallback(async (event: DragEndEvent) => {
        const { active, over } = event
        setActiveTask(null)
        setDraggingTaskId(null)

        if (!over) return

        const activeId = active.id as string
        const overId = over.id as string

        // 找到拖拽的任务
        const draggedTask = tasks.find(t => t.id === activeId)
        if (!draggedTask) return

        // 判断目标列
        let targetStatus = overId
        let targetTask: Task | undefined

        // 如果 overId 是任务 ID，找到它的状态
        const overTask = tasks.find(t => t.id === overId)
        if (overTask) {
            targetStatus = overTask.status
            targetTask = overTask
        }

        // 验证目标状态是否有效
        if (!COLUMNS.find(c => c.id === targetStatus)) {
            return
        }

        // 如果状态改变，更新任务
        if (draggedTask.status !== targetStatus) {
            try {
                await updateTask.mutateAsync({
                    id: activeId,
                    data: { status: targetStatus as Task['status'] },
                })
                Toast.show({ content: '状态已更新', icon: 'success' })
            } catch (error) {
                Toast.show({ content: '更新失败', icon: 'fail' })
            }
        }

        // 如果在同一列内排序
        if (targetTask && draggedTask.status === targetStatus) {
            const columnTasks = tasksByStatus[targetStatus]
            const oldIndex = columnTasks.findIndex(t => t.id === activeId)
            const newIndex = columnTasks.findIndex(t => t.id === overId)

            if (oldIndex !== newIndex) {
                const reordered = arrayMove(columnTasks, oldIndex, newIndex)
                const updates = reordered.map((task, index) => ({
                    id: task.id,
                    sequence: index * 1000,
                }))

                try {
                    await updateSequence.mutateAsync(updates)
                } catch (error) {
                    console.error('Failed to update sequence:', error)
                }
            }
        }
    }, [tasks, tasksByStatus, updateTask, updateSequence, setDraggingTaskId])

    const handleTaskClick = useCallback((task: Task) => {
        setSelectedTask(task)
        setDrawerVisible(true)
    }, [])

    if (isLoading) {
        return (
            <div className="kanban-loading">
                <div className="loading-spinner" />
                <span>加载中...</span>
            </div>
        )
    }

    return (
        <div className="kanban-container">
            <NavBar
                onBack={() => navigate(-1)}
                className="kanban-navbar"
            >
                {projectName || '项目看板'}
            </NavBar>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <div className="kanban-board">
                    {COLUMNS.map((column) => (
                        <KanbanColumn
                            key={column.id}
                            id={column.id}
                            title={column.title}
                            color={column.color}
                            tasks={tasksByStatus[column.id] || []}
                            onTaskClick={handleTaskClick}
                        />
                    ))}
                </div>

                <DragOverlay>
                    {activeTask ? <TaskCardOverlay task={activeTask} /> : null}
                </DragOverlay>
            </DndContext>

            <Popup
                visible={drawerVisible}
                onMaskClick={() => setDrawerVisible(false)}
                position="right"
                bodyStyle={{ width: '85vw', maxWidth: '400px' }}
            >
                {selectedTask && (
                    <TaskDetailDrawer
                        task={selectedTask}
                        onClose={() => setDrawerVisible(false)}
                        onUpdate={() => {
                            // 刷新数据由 TanStack Query 自动处理
                        }}
                    />
                )}
            </Popup>
        </div>
    )
}

export default KanbanBoard
