/**
 * 任务详情抽屉组件
 * 包含状态操作、交接提报、卡点上报
 */
import React, { useState } from 'react'
import {
    NavBar,
    Button,
    Tag,
    Dialog,
    TextArea,
    DatePicker,
    Form,
    Input,
    Selector,
    Toast,
    List,
    Divider,
} from 'antd-mobile'
import {
    useTask,
    useUpdateTask,
    useMarkTaskComplete,
    useMarkTaskBlocked,
    useComments,
    useCreateComment,
    useTaskAuditLogs,
    useUsers,
    isManagerRole,
    type Task
} from '../../lib/api'
import { useHandoffDraftStore, useBlockerDraftStore } from '../../lib/store'
import { pb } from '../../lib/pocketbase'
import './TaskDetailDrawer.css'

interface TaskDetailDrawerProps {
    task: Task
    onClose: () => void
    onUpdate?: () => void
}

const statusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: '待开始', color: '#8c8c8c' },
    in_progress: { label: '进行中', color: '#1890ff' },
    processing: { label: '进行中', color: '#1890ff' }, // 兼容旧状态
    completed: { label: '已完成', color: '#52c41a' },
    overdue: { label: '已逾期', color: '#ff4d4f' },
    blocked: { label: '卡点中', color: '#faad14' },
}

const priorityConfig: Record<string, { label: string; color: string }> = {
    high: { label: '高优先级', color: '#ff4d4f' },
    normal: { label: '中优先级', color: '#1890ff' },
    low: { label: '低优先级', color: '#8c8c8c' },
}


export const TaskDetailDrawer: React.FC<TaskDetailDrawerProps> = ({
    task,
    onClose,
    onUpdate
}) => {
    const [activeTab, setActiveTab] = useState<'info' | 'comments' | 'history'>('info')
    const [showHandoffForm, setShowHandoffForm] = useState(false)
    const [showBlockerForm, setShowBlockerForm] = useState(false)
    const [commentText, setCommentText] = useState('')

    const { data: taskDetail } = useTask(task.id)
    const { data: comments = [] } = useComments(task.id)
    const { data: auditLogs = [] } = useTaskAuditLogs(task.id)
    const { data: users = [] } = useUsers()

    const updateTask = useUpdateTask()
    const markComplete = useMarkTaskComplete()
    const markBlocked = useMarkTaskBlocked()
    const createComment = useCreateComment()

    const { setDraft: setHandoffDraft } = useHandoffDraftStore()
    const { setDraft: setBlockerDraft } = useBlockerDraftStore()

    const currentTask = taskDetail || task
    const status = statusConfig[currentTask.status] || statusConfig.pending
    const priority = currentTask.priority ? priorityConfig[currentTask.priority] : null

    const handleStartTask = async () => {
        try {
            await updateTask.mutateAsync({
                id: currentTask.id,
                data: { status: 'in_progress' },
            })
            Toast.show({ content: '任务已开始', icon: 'success' })
            onUpdate?.()
        } catch {
            Toast.show({ content: '操作失败', icon: 'fail' })
        }
    }

    const handleUnblock = async (newStatus: 'in_progress' | 'completed') => {
        try {
            await updateTask.mutateAsync({
                id: currentTask.id,
                data: { status: newStatus, blocker: null } as any,
            })
            Toast.show({ content: newStatus === 'completed' ? '已标记完成' : '已恢复进行中', icon: 'success' })
            onUpdate?.()
        } catch {
            Toast.show({ content: '操作失败', icon: 'fail' })
        }
    }

    const handleCompleteWithHandoff = () => {
        setHandoffDraft({
            fromTaskId: currentTask.id,
            proposedTitle: '',
            proposedDescription: '',
            proposedAssignees: [],
            proposedDueDate: '',
        })
        setShowHandoffForm(true)
    }

    const handleSubmitHandoff = async (values: any) => {
        try {
            await markComplete.mutateAsync({
                taskId: currentTask.id,
                handoffData: {
                    proposedTitle: values.title,
                    proposedDescription: values.description,
                    proposedAssignees: values.assignees || [],
                    proposedDueDate: values.dueDate,
                },
            })
            Toast.show({ content: '任务已完成，交接已提交', icon: 'success' })
            setShowHandoffForm(false)
            onUpdate?.()
        } catch {
            Toast.show({ content: '提交失败', icon: 'fail' })
        }
    }

    const handleReportBlocker = () => {
        setBlockerDraft({
            taskId: currentTask.id,
            reasonType: 'other',
            reasonDetail: '',
            needHelpFrom: [],
            expectedResolve: '',
        })
        setShowBlockerForm(true)
    }

    const handleSubmitBlocker = async (values: any) => {
        try {
            await markBlocked.mutateAsync({
                taskId: currentTask.id,
                blocker: {
                    reason_type: 'other',
                    reason_detail: values.reasonDetail,
                    need_help_from: values.needHelpFrom || [],
                    expected_resolve: values.expectedResolve,
                },
            })
            Toast.show({ content: '卡点已上报', icon: 'success' })
            setShowBlockerForm(false)
            onUpdate?.()
        } catch {
            Toast.show({ content: '提交失败', icon: 'fail' })
        }
    }

    const handleSendComment = async () => {
        if (!commentText.trim()) return
        try {
            await createComment.mutateAsync({
                step: currentTask.id,
                content: commentText,
            })
            setCommentText('')
            Toast.show({ content: '评论已发送', icon: 'success' })
        } catch {
            Toast.show({ content: '发送失败', icon: 'fail' })
        }
    }

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '未设置'
        return new Date(dateStr).toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        })
    }

    const formatTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    return (
        <div className="task-drawer">
            <NavBar onBack={onClose} className="drawer-navbar">
                任务详情
            </NavBar>

            <div className="drawer-content">
                {/* 任务标题和状态 */}
                <div className="task-header">
                    <h2 className="task-name">{currentTask.stage_name}</h2>
                    <div className="task-badges">
                        <Tag color={status.color} fill="solid">
                            {status.label}
                        </Tag>
                        {priority && (
                            <Tag color={priority.color} fill="outline">
                                {priority.label}
                            </Tag>
                        )}
                        {currentTask.is_milestone && (
                            <Tag color="#722ed1" fill="solid">
                                里程碑
                            </Tag>
                        )}
                    </div>
                </div>

                {/* 标签页切换 */}
                <div className="tab-bar">
                    <button
                        className={`tab-item ${activeTab === 'info' ? 'active' : ''}`}
                        onClick={() => setActiveTab('info')}
                    >
                        信息
                    </button>
                    <button
                        className={`tab-item ${activeTab === 'comments' ? 'active' : ''}`}
                        onClick={() => setActiveTab('comments')}
                    >
                        评论 ({comments.length})
                    </button>
                    <button
                        className={`tab-item ${activeTab === 'history' ? 'active' : ''}`}
                        onClick={() => setActiveTab('history')}
                    >
                        历史
                    </button>
                </div>

                {/* 信息标签页 */}
                {activeTab === 'info' && (
                    <div className="tab-content">
                        <List>
                            <List.Item extra={formatDate(currentTask.deadline)}>
                                截止日期
                            </List.Item>
                            <List.Item extra={formatDate(currentTask.start_date)}>
                                开始日期
                            </List.Item>
                            <List.Item
                                extra={
                                    currentTask.expand?.assignees?.map(u => u.name || u.username || '未知').join(', ') || '未分配'
                                }
                            >
                                负责人
                            </List.Item>
                        </List>

                        {currentTask.next_steps && (
                            <div className="section">
                                <h4 className="section-title">任务描述</h4>
                                <p className="section-content">{currentTask.next_steps}</p>
                            </div>
                        )}

                        {currentTask.blocker && (
                            <div className="section blocker-section">
                                <h4 className="section-title">卡点信息</h4>
                                <div className="blocker-info">
                                    <p><strong>原因：</strong>{currentTask.blocker.reason_detail || '无'}</p>
                                    <p><strong>预期解决：</strong>{currentTask.blocker.expected_resolve || '未设置'}</p>
                                </div>
                            </div>
                        )}

                        <Divider />

                        {/* 操作按钮 — 经理可操作全部，被分配人可完成和上报卡点 */}
                        <div className="action-buttons">
                            {currentTask.status === 'pending' && isManagerRole() && (
                                <Button
                                    color="primary"
                                    block
                                    onClick={handleStartTask}
                                    loading={updateTask.isPending}
                                >
                                    开始任务
                                </Button>
                            )}

                            {currentTask.status === 'in_progress' && (
                                <>
                                    {(isManagerRole() || (!!pb.authStore.model?.id && currentTask.assignees?.includes(pb.authStore.model.id))) && (
                                        <Button
                                            color="success"
                                            block
                                            onClick={handleCompleteWithHandoff}
                                        >
                                            完成并交接下一步
                                        </Button>
                                    )}
                                    <Button
                                        color="warning"
                                        block
                                        onClick={handleReportBlocker}
                                        style={{ marginTop: 8 }}
                                    >
                                        上报卡点
                                    </Button>
                                </>
                            )}

                            {currentTask.status === 'blocked' && isManagerRole() && (
                                <>
                                    <Button
                                        color="success"
                                        block
                                        onClick={() => handleUnblock('completed')}
                                        loading={updateTask.isPending}
                                    >
                                        标记为已完成
                                    </Button>
                                    <Button
                                        color="primary"
                                        block
                                        fill="outline"
                                        onClick={() => handleUnblock('in_progress')}
                                        loading={updateTask.isPending}
                                        style={{ marginTop: 8 }}
                                    >
                                        恢复为进行中
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* 评论标签页 */}
                {activeTab === 'comments' && (
                    <div className="tab-content comments-tab">
                        <div className="comments-list">
                            {comments.length === 0 ? (
                                <div className="empty-comments">
                                    <span className="empty-icon">--</span>
                                    <span>暂无评论</span>
                                </div>
                            ) : (
                                comments.map((comment) => (
                                    <div key={comment.id} className="comment-item">
                                        <div className="comment-avatar">
                                            {comment.expand?.author?.name?.charAt(0) || '?'}
                                        </div>
                                        <div className="comment-body">
                                            <div className="comment-header">
                                                <span className="comment-author">
                                                    {comment.expand?.author?.name || '匿名'}
                                                </span>
                                                <span className="comment-time">
                                                    {formatTime(comment.created)}
                                                </span>
                                            </div>
                                            <p className="comment-content">{comment.content}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="comment-input">
                            <TextArea
                                placeholder="输入评论..."
                                value={commentText}
                                onChange={setCommentText}
                                rows={2}
                            />
                            <Button
                                color="primary"
                                size="small"
                                onClick={handleSendComment}
                                loading={createComment.isPending}
                                disabled={!commentText.trim()}
                            >
                                发送
                            </Button>
                        </div>
                    </div>
                )}

                {/* 历史标签页 */}
                {activeTab === 'history' && (
                    <div className="tab-content history-tab">
                        {auditLogs.length === 0 ? (
                            <div className="empty-history">
                                <span className="empty-icon">--</span>
                                <span>暂无操作记录</span>
                            </div>
                        ) : (
                            <div className="history-list">
                                {auditLogs.map((log) => (
                                    <div key={log.id} className="history-item">
                                        <div className="history-dot" />
                                        <div className="history-body">
                                            <span className="history-action">{log.action_type}</span>
                                            <span className="history-operator">
                                                {log.expand?.operator?.name || '系统'}
                                            </span>
                                            <span className="history-time">{formatTime(log.created)}</span>
                                            {log.note && <p className="history-note">{log.note}</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 交接表单弹窗 */}
            <Dialog
                visible={showHandoffForm}
                title="提交下一步交接"
                content={
                    <HandoffForm
                        users={users}
                        onSubmit={handleSubmitHandoff}
                        loading={markComplete.isPending}
                    />
                }
                onClose={() => setShowHandoffForm(false)}
                actions={[]}
            />

            {/* 卡点表单弹窗 */}
            <Dialog
                visible={showBlockerForm}
                title="上报卡点"
                content={
                    <BlockerForm
                        users={users}
                        onSubmit={handleSubmitBlocker}
                        loading={markBlocked.isPending}
                    />
                }
                onClose={() => setShowBlockerForm(false)}
                actions={[]}
            />
        </div>
    )
}

// 交接表单组件
const HandoffForm: React.FC<{
    users: any[]
    onSubmit: (values: any) => void
    loading: boolean
}> = ({ users, onSubmit, loading }) => {
    const [form] = Form.useForm()
    const [showDatePicker, setShowDatePicker] = useState(false)

    return (
        <Form
            form={form}
            layout="vertical"
            onFinish={onSubmit}
            footer={
                <Button block color="primary" type="submit" loading={loading}>
                    提交交接
                </Button>
            }
        >
            <Form.Item
                name="title"
                label="下一步标题"
                rules={[{ required: true, message: '请输入下一步标题' }]}
            >
                <Input placeholder="请输入下一步任务标题" />
            </Form.Item>

            <Form.Item name="description" label="任务描述">
                <TextArea placeholder="请描述任务内容" rows={3} />
            </Form.Item>

            <Form.Item name="assignees" label="建议负责人">
                <Selector
                    multiple
                    options={users.map(u => ({ label: u.name || u.username || '未知', value: u.id }))}
                />
            </Form.Item>

            <Form.Item
                name="dueDate"
                label="建议截止时间"
                rules={[{ required: true, message: '请选择截止时间' }]}
                trigger="onConfirm"
                onClick={() => setShowDatePicker(true)}
            >
                <DatePicker
                    visible={showDatePicker}
                    onClose={() => setShowDatePicker(false)}
                    min={new Date()}
                >
                    {(value) => value ? value.toLocaleDateString() : '请选择日期'}
                </DatePicker>
            </Form.Item>
        </Form>
    )
}

// 卡点表单组件
const BlockerForm: React.FC<{
    users: any[]
    onSubmit: (values: any) => void
    loading: boolean
}> = ({ users, onSubmit, loading }) => {
    const [form] = Form.useForm()
    const [showDatePicker, setShowDatePicker] = useState(false)

    return (
        <Form
            form={form}
            layout="vertical"
            onFinish={onSubmit}
            footer={
                <Button block color="warning" type="submit" loading={loading}>
                    上报卡点
                </Button>
            }
        >
            <Form.Item
                name="reasonDetail"
                label="卡点原因"
                rules={[{ required: true, message: '请描述卡点原因' }]}
            >
                <TextArea placeholder="请详细描述卡点原因" rows={3} />
            </Form.Item>

            <Form.Item name="needHelpFrom" label="需要谁协助">
                <Selector
                    multiple
                    options={users.map(u => ({ label: u.name || u.username || '未知', value: u.id }))}
                />
            </Form.Item>

            <Form.Item
                name="expectedResolve"
                label="预计解决时间"
                trigger="onConfirm"
                onClick={() => setShowDatePicker(true)}
            >
                <DatePicker
                    visible={showDatePicker}
                    onClose={() => setShowDatePicker(false)}
                    min={new Date()}
                >
                    {(value) => value ? value.toLocaleDateString() : '请选择日期'}
                </DatePicker>
            </Form.Item>
        </Form>
    )
}

export default TaskDetailDrawer
