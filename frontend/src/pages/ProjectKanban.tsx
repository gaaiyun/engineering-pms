/**
 * 项目看板页面
 */
import React, { useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { KanbanBoard } from '../components/kanban'
import { useProject, useTasks, useUsers, isManager } from '../lib/api'
import { queryKeys } from '../lib/queryClient'
import BatchTaskEditor from '../components/BatchTaskEditor'
import { Button, SpinLoading } from 'antd-mobile'
import { IoListOutline, IoWarningOutline } from 'react-icons/io5'

const ProjectKanban: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    const queryClient = useQueryClient()
    const { data: project, isLoading: projectLoading, isError: projectError, refetch } = useProject(id || '')
    const { data: tasks = [], isLoading: tasksLoading } = useTasks(id)
    const { data: users = [] } = useUsers()
    const [showBatch, setShowBatch] = useState(false)

    const handleBatchClose = useCallback(() => {
        setShowBatch(false)
        if (id) queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(id) })
    }, [id, queryClient])

    const isLoading = projectLoading || tasksLoading

    if (!id) {
        return <div>项目 ID 无效</div>
    }

    if (isLoading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60dvh' }}>
            <SpinLoading style={{ '--size': '36px' }} />
        </div>
    )

    if (projectError) return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60dvh', gap: 16 }}>
            <IoWarningOutline style={{ fontSize: 48, color: '#ef4444' }} />
            <span style={{ color: '#334155', fontSize: 16 }}>看板加载失败</span>
            <Button size="small" color="primary" shape="rounded" onClick={() => { refetch() }}>重试</Button>
        </div>
    )

    return (
        <>
            {isManager() && (
                <div style={{ padding: '8px 16px', textAlign: 'right' }}>
                    <Button size='small' onClick={() => setShowBatch(true)}>
                        <IoListOutline /> 批量编辑任务
                    </Button>
                </div>
            )}
            <KanbanBoard
                projectId={id}
                projectName={project?.name}
            />
            <BatchTaskEditor
                visible={showBatch}
                onClose={handleBatchClose}
                projectId={id}
                projectMembers={project?.members || []}
                allUsers={users}
                existingTasks={tasks.map(t => ({ id: t.id, stage_name: t.stage_name, assignees: t.assignees || [], deadline: t.deadline || '' }))}
            />
        </>
    )
}

export default ProjectKanban
