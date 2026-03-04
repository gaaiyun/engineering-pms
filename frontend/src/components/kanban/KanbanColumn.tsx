/**
 * 看板列组件
 */
import React from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { TaskCard } from './TaskCard'
import type { Task } from '../../lib/api'
import './KanbanColumn.css'

interface KanbanColumnProps {
    id: string
    title: string
    icon?: string
    color: string
    tasks: Task[]
    onTaskClick?: (task: Task) => void
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
    id,
    title,
    color,
    tasks,
    onTaskClick,
}) => {
    const { isOver, setNodeRef } = useDroppable({ id })

    return (
        <div
            ref={setNodeRef}
            className={`kanban-column ${isOver ? 'drag-over' : ''}`}
            style={{ '--column-color': color } as React.CSSProperties}
        >
            <div className="column-header">
                <span className="column-icon" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: color }} />
                <span className="column-title">{title}</span>
                <span className="column-count">{tasks.length}</span>
            </div>

            <div className="column-content">
                <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    {tasks.length === 0 ? (
                        <div className="column-empty">
                            <span className="empty-text">暂无任务</span>
                        </div>
                    ) : (
                        tasks.map((task) => (
                            <TaskCard
                                key={task.id}
                                task={task}
                                onClick={() => onTaskClick?.(task)}
                            />
                        ))
                    )}
                </SortableContext>
            </div>
        </div>
    )
}

export default KanbanColumn
