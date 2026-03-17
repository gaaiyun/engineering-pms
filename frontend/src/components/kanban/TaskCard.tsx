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
    sequenceNumber?: number
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

export const TaskCard: React.FC<TaskCardProps> = ({ task, onClick, isDragging, sequenceNumber }) => {
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
        if (isNaN(date.getTime())) return null
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
            className={`task-card ${isDragging || isSortableDragging ? 'dragging' : ''} ${isOverdue ? 'overdue' : ''} ${isBlocked ? 'blocked' : ''} ${isMilestone ? 'milestone' : ''} ${task.status === 'in_progress' ? 'task-active-glow' : ''}`}
            onClick={onClick}
            data-task-active={task.status === 'in_progress' ? 'true' : undefined}
        >
            <div className="task-card-header">
                {sequenceNumber != null && (
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700, flexShrink: 0,
                        background: task.status === 'in_progress' ? '#3b82f6' : task.status === 'completed' ? '#22c55e' : '#e2e8f0',
                        color: (task.status === 'in_progress' || task.status === 'completed') ? '#fff' : '#64748b',
                        marginRight: 6,
                    }}>
                        {sequenceNumber}
                    </span>
                )}
                <span className="task-title">{task.stage_name}</span>
                {task.priority && (
                    <Tag
                        color={priorityColors[task.priority] || '#1890ff'}
                        fill="outline"
                        style={{ fontSize: 10, padding: '0 4px' }}
                    >
                        {priorityLabels[task.priority] || '中'}
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
                            {formatDate(task.deadline)}
                        </span>
                    )}
                    {isBlocked && (
                        <span className="blocker-badge">卡点</span>
                    )}
                    {isMilestone && (
                        <span className="milestone-badge">里程碑</span>
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
