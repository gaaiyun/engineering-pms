/**
 * 项目看板页面
 */
import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { KanbanBoard } from '../components/kanban'
import { useProject, useTasks, useUsers, isManager } from '../lib/api'
import BatchTaskEditor from '../components/BatchTaskEditor'
import { Button, SpinLoading } from 'antd-mobile'
import { IoListOutline, IoWarningOutline } from 'react-icons/io5'

const ProjectKanban: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    const { data: project, isLoading: projectLoading, isError: projectError, refetch } = useProject(id || '')
    const { data: tasks = [], isLoading: tasksLoading } = useTasks(id)
    const { data: users = [] } = useUsers()
    const [showBatch, setShowBatch] = useState(false)

    const isLoading = projectLoading || tasksLoading

    if (!id) {
        return <div>项目 ID 无效</div>
    }

    if (isLoading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
            <SpinLoading style={{ '--size': '36px' }} />
        </div>
    )

    if (projectError) return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
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
                onClose={() => setShowBatch(false)}
                projectId={id}
                projectMembers={project?.members || []}
                allUsers={users}
                existingTasks={tasks.map(t => ({ id: t.id, stage_name: t.stage_name, assignees: t.assignees || [], deadline: t.deadline || '' }))}
            />
        </>
    )
}

export default ProjectKanban
