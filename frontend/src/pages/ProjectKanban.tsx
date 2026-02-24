/**
 * 项目看板页面
 */
import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { KanbanBoard } from '../components/kanban'
import { useProject, useTasks, useUsers, isManager } from '../lib/api'
import BatchTaskEditor from '../components/BatchTaskEditor'
import { Button } from 'antd-mobile'
import { IoListOutline } from 'react-icons/io5'

const ProjectKanban: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    const { data: project } = useProject(id || '')
    const { data: tasks = [] } = useTasks(id)
    const { data: users = [] } = useUsers()
    const [showBatch, setShowBatch] = useState(false)

    if (!id) {
        return <div>项目 ID 无效</div>
    }

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
