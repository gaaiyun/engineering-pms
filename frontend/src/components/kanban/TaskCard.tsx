/**
 * 可拖拽的任务卡片组件
 */
import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Tag } from 'antd-mobile'
import type { Task } from '../../lib/api'
import './TaskCard.css'

interface TaskCardProps {
    task: Task
    onClick?: () => void
    isDragging?: boolean
}

const priorityColors = {
    high: '#ff4d4f',
    normal: '#1890ff',
    low: '#8c8c8c',
}

const priorityLabels: Record<string, string> = {
    high: '高',
    normal: '中',
    low: '低',
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, onClick, isDragging }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging: isSortableDragging,
    } = useSortable({ id: task.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isSortableDragging ? 0.5 : 1,
    }

    const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'completed'
    const isBlocked = task.status === 'blocked'
    const isMilestone = task.is_milestone

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return null
        const date = new Date(dateStr)
        const now = new Date()
        const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

        if (diffDays === 0) return '今天'
        if (diffDays === 1) return '明天'
        if (diffDays === -1) return '昨天'
        if (diffDays < 0) return `逾期${Math.abs(diffDays)}天`
        if (diffDays <= 7) return `${diffDays}天后`

        return `${date.getMonth() + 1}/${date.getDate()}`
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={`task-card ${isDragging || isSortableDragging ? 'dragging' : ''} ${isOverdue ? 'overdue' : ''} ${isBlocked ? 'blocked' : ''} ${isMilestone ? 'milestone' : ''}`}
            onClick={onClick}
        >
            <div className="task-card-header">
                <span className="task-title">{task.stage_name}</span>
                {task.priority && (
                    <Tag
                        color={priorityColors[task.priority]}
                        fill="outline"
                        style={{ fontSize: 10, padding: '0 4px' }}
                    >
                        {priorityLabels[task.priority]}
                    </Tag>
                )}
            </div>

            {task.next_steps && (
                <p className="task-description">{task.next_steps}</p>
            )}

            <div className="task-card-footer">
                <div className="task-meta">
                    {task.deadline && (
                        <span className={`deadline ${isOverdue ? 'overdue' : ''}`}>
                            📅 {formatDate(task.deadline)}
                        </span>
                    )}
                    {isBlocked && (
                        <span className="blocker-badge">🚧 卡点</span>
                    )}
                    {isMilestone && (
                        <span className="milestone-badge">🎯 里程碑</span>
                    )}
                </div>

                {task.expand?.assignees && task.expand.assignees.length > 0 && (
                    <div className="assignees">
                        {task.expand.assignees.slice(0, 3).map((user, idx) => (
                            <div
                                key={user.id}
                                className="avatar-mini"
                                style={{ marginLeft: idx > 0 ? -8 : 0, zIndex: 3 - idx }}
                                title={user.name}
                            >
                                {user.avatar ? (
                                    <img src={user.avatar} alt={user.name} />
                                ) : (
                                    user.name?.charAt(0) || '?'
                                )}
                            </div>
                        ))}
                        {task.expand.assignees.length > 3 && (
                            <span className="more-count">+{task.expand.assignees.length - 3}</span>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

// 拖拽覆盖层卡片
export const TaskCardOverlay: React.FC<{ task: Task }> = ({ task }) => {
    return (
        <div className="task-card dragging overlay">
            <div className="task-card-header">
                <span className="task-title">{task.stage_name}</span>
            </div>
            {task.next_steps && (
                <p className="task-description">{task.next_steps}</p>
            )}
        </div>
    )
}

export default TaskCard
