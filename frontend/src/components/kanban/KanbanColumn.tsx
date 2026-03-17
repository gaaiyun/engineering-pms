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
    /** 全局序号偏移量，用于跨列连续编号 */
    indexOffset?: number
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
    id,
    title,
    color,
    tasks,
    onTaskClick,
    indexOffset = 0,
}) => {
    const { isOver, setNodeRef } = useDroppable({ id })
    const contentRef = React.useRef<HTMLDivElement>(null)

    // 自动滚动到第一个进行中的任务
    React.useEffect(() => {
        if (!contentRef.current) return
        const el = contentRef.current.querySelector('[data-task-active="true"]') as HTMLElement
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, [tasks])

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

            <div className="column-content" ref={contentRef}>
                <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                    {tasks.length === 0 ? (
                        <div className="column-empty">
                            <span className="empty-text">暂无任务</span>
                        </div>
                    ) : (
                        tasks.map((task, idx) => (
                            <TaskCard
                                key={task.id}
                                task={task}
                                sequenceNumber={indexOffset + idx + 1}
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
