import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Toast, Dialog, Avatar, TextArea, Input, SpinLoading } from 'antd-mobile'
import { pb } from '../lib/pocketbase'
import { notifyProjectMembers } from '../lib/api'
import { useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { IoArrowBack, IoCheckmarkDone, IoCalendarOutline, IoCreateOutline, IoSaveOutline, IoCloseOutline, IoWarningOutline, IoTrashOutline } from 'react-icons/io5'
import { motion } from 'framer-motion'

const TaskDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [task, setTask] = useState<any>(null)
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)

  // Manager Edit State
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({ stage_name: '', completed_steps: '', next_steps: '' })

  // Blocker Reporting State
  const [showBlockerDialog, setShowBlockerDialog] = useState(false)
  const [blockerForm, setBlockerForm] = useState({
    reason_type: 'waiting_approval',
    reason_detail: '',
    expected_resolve: ''
  })
  const [submittingBlocker, setSubmittingBlocker] = useState(false)

  const currentUser = pb.authStore.model
  const isManager = currentUser?.role === 'admin' || currentUser?.role === 'manager'

  const loadData = useCallback(async () => {
    if (!id) return
    try {
      const taskData = await pb.collection('tasks').getOne(id, {
        expand: 'project,assignees'
      })
      setTask(taskData)
      setProject(taskData.expand?.project)
      setEditForm({
        stage_name: taskData.stage_name,
        completed_steps: taskData.completed_steps || '',
        next_steps: taskData.next_steps || ''
      })
    } catch {
      Toast.show({ content: '加载失败', icon: 'fail' })
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadData()
    // SSE 实时刷新：当前任务变更时自动重新加载
    if (id) {
      pb.collection('tasks').subscribe(id, () => loadData())
    }
    return () => { if (id) pb.collection('tasks').unsubscribe(id) }
  }, [id, loadData])

  const handleSaveEdit = async () => {
    if (!isManager || !id || !task) return
    try {
      setCompleting(true)
      const before = { stage_name: task.stage_name, completed_steps: task.completed_steps, next_steps: task.next_steps }
      await pb.collection('tasks').update(id, {
        stage_name: editForm.stage_name,
        completed_steps: editForm.completed_steps,
        next_steps: editForm.next_steps
      })

      // 审计日志
      await pb.collection('audit_logs').create({
        project: task.project, task: id, action_type: 'update_task',
        operator: currentUser?.id,
        before_data: before,
        after_data: editForm,
      }).catch(() => {})

      // 通知项目全员
      const userName = currentUser?.name || currentUser?.username
      notifyProjectMembers(task.project, '任务修改', `${userName} 修改了任务「${task.stage_name}」`, 'task_update', currentUser?.id, id).catch(() => {})

      Toast.show({ content: '修改已保存', icon: 'success' })
      setIsEditing(false)
      loadData()
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['audit_logs'] })
    } catch {
      Toast.show({ content: '保存失败', icon: 'fail' })
    } finally {
      setCompleting(false)
    }
  }

  // 被分配人也可以标记完成
  const isAssignee = task?.assignees?.includes(currentUser?.id)
  const canComplete = isManager || isAssignee

  const handleComplete = () => {
    if (!canComplete || !task) return
    Dialog.confirm({
      title: '确认完成',
      content: '确认当前节点任务已全部完成？',
      confirmText: '确认提交',
      cancelText: '取消',
      onConfirm: async () => {
        setCompleting(true)
        try {
          if (!id) return
          await pb.collection('tasks').update(id, { status: 'completed', completed_at: new Date().toISOString() })
          // 审计日志
          await pb.collection('audit_logs').create({
            project: task.project, task: id, action_type: 'mark_complete',
            operator: currentUser?.id,
            before_data: { status: task.status },
            after_data: { status: 'completed' },
          }).catch(() => {})
          // 通知项目全员
          const userName = currentUser?.name || currentUser?.username
          notifyProjectMembers(task.project, '任务完成', `${userName} 完成了任务「${task.stage_name}」`, 'task_update', currentUser?.id, id).catch(() => {})
          Toast.show({ content: '提交成功', icon: 'success' })
          loadData()
          queryClient.invalidateQueries({ queryKey: ['tasks'] })
          queryClient.invalidateQueries({ queryKey: ['projects'] })
          queryClient.invalidateQueries({ queryKey: ['notifications'] })
          queryClient.invalidateQueries({ queryKey: ['audit_logs'] })
        } catch (e) {
          console.error(e)
          Toast.show({ content: '提交失败: ' + (e as any).message, icon: 'fail' })
        } finally {
          setCompleting(false)
        }
      }
    })
  }

  const handleSubmitBlocker = async () => {
    if (!blockerForm.reason_detail.trim()) {
      Toast.show({ content: '请填写卡点原因', icon: 'fail' })
      return
    }
    if (!id || !task) return
    setSubmittingBlocker(true)
    try {
      await pb.collection('tasks').update(id, {
        status: 'blocked',
        blocker: {
          reason_type: 'other',
          reason_detail: blockerForm.reason_detail,
          need_help_from: [],
          expected_resolve: blockerForm.expected_resolve || dayjs().add(3, 'day').format('YYYY-MM-DD')
        }
      })
      // Create audit log
      await pb.collection('audit_logs').create({
        project: task.project,
        task: id,
        action_type: 'mark_blocked',
        operator: currentUser?.id,
        after_data: blockerForm
      }).catch(() => {})
      // 通知项目全员
      const userName = currentUser?.name || currentUser?.username
      notifyProjectMembers(task.project, '卡点上报', `${userName} 上报了「${task.stage_name}」的卡点：${blockerForm.reason_detail}`, 'blocker', currentUser?.id, id).catch(() => {})
      Toast.show({ content: '卡点已上报', icon: 'success' })
      setShowBlockerDialog(false)
      loadData()
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['audit_logs'] })
    } catch (e) {
      console.error(e)
      Toast.show({ content: '上报失败: ' + (e as any).message, icon: 'fail' })
    } finally {
      setSubmittingBlocker(false)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60dvh' }}>
      <SpinLoading style={{ '--size': '36px' }} />
    </div>
  )
  if (!task) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60dvh', gap: 16 }}>
      <IoWarningOutline style={{ fontSize: 48, color: '#ef4444' }} />
      <span style={{ color: '#334155', fontSize: 16 }}>任务加载失败</span>
      <Button size="small" onClick={() => navigate(-1)}>返回</Button>
    </div>
  )

  const completedSteps = task.completed_steps ? task.completed_steps.split('\n') : []
  const nextSteps = task.next_steps ? task.next_steps.split('\n') : []

  return (
    <div style={{ minHeight: '100dvh', background: '#FFFFFF', paddingBottom: 100 }}>
      {/* Immersive Glass Header */}
      <div className="glass-header" style={{
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)'
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: '50%',
            width: 40, height: 40,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--neutral-800)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
            transition: 'all 0.2s'
          }}
        >
          <IoArrowBack size={20} />
        </button>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--neutral-600)', letterSpacing: 0.5 }}>任务详情</div>

        {/* Manager Edit / Delete Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isManager && !isEditing && (
            <>
              <button onClick={() => setIsEditing(true)} style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer' }}>
                <IoCreateOutline size={24} />
              </button>
              <button onClick={() => Dialog.confirm({
                title: '删除任务',
                content: `确认删除「${task?.stage_name}」？此操作不可恢复！`,
                onConfirm: async () => {
                  try {
                    // 审计日志
                    await pb.collection('audit_logs').create({
                      project: task.project, task: id, action_type: 'delete_task',
                      operator: currentUser?.id,
                      before_data: { stage_name: task.stage_name, status: task.status },
                    }).catch(() => {})
                    // 通知项目全员
                    const userName = currentUser?.name || currentUser?.username
                    notifyProjectMembers(task.project, '任务删除', `${userName} 删除了任务「${task.stage_name}」`, 'task_update', currentUser?.id).catch(() => {})
                    if (!id) return
                    await pb.collection('tasks').delete(id)
                    queryClient.invalidateQueries({ queryKey: ['tasks'] })
                    queryClient.invalidateQueries({ queryKey: ['projects'] })
                    Toast.show({ content: '已删除', icon: 'success' })
                    navigate(-1)
                  } catch (e: any) {
                    Toast.show({ content: '删除失败: ' + e.message, icon: 'fail' })
                  }
                }
              })} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                <IoTrashOutline size={22} />
              </button>
            </>
          )}
          {isEditing && (
            <button onClick={() => setIsEditing(false)} style={{ background: 'none', border: 'none', color: 'var(--neutral-400)', cursor: 'pointer' }}>
              <IoCloseOutline size={24} />
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '20px 24px' }}>
        {/* Project Tag */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--neutral-100)', padding: '6px 12px', borderRadius: 20,
          fontSize: 11, fontWeight: 600, color: 'var(--neutral-600)', marginBottom: 16
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-color)' }}></div>
          {project?.name || 'Unknown Project'}
        </div>

        {/* Title / Edit Title */}
        {isEditing ? (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--neutral-500)' }}>任务名称</div>
            <Input
              style={{ fontSize: 24, fontWeight: 800, '--color': 'var(--neutral-900)' }}
              value={editForm.stage_name}
              onChange={v => setEditForm({ ...editForm, stage_name: v })}
            />
          </div>
        ) : (
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1, color: 'var(--neutral-900)', margin: '0 0 24px 0', letterSpacing: '-1px' }}
          >
            {task.stage_name}
          </motion.h1>
        )}

        {/* Timeline Content */}
        <motion.div
          className="elevated-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={{ padding: 0 }}
        >
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--neutral-400)', letterSpacing: 1, marginBottom: 20 }}>
              {isEditing ? '编辑进度步骤 (每行一项，可自由增删/排序/插入)' : '进度时间线'}
            </div>

            {isEditing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--success-text)' }}>已完成步骤 (可在此处插入新的历史记录)</div>
                  <TextArea
                    value={editForm.completed_steps}
                    onChange={v => setEditForm({ ...editForm, completed_steps: v })}
                    autoSize={{ minRows: 3, maxRows: 8 }}
                    style={{ background: 'var(--neutral-50)', padding: 12, borderRadius: 8, fontSize: 14 }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--neutral-600)' }}>后续/进行中步骤</div>
                  <TextArea
                    value={editForm.next_steps}
                    onChange={v => setEditForm({ ...editForm, next_steps: v })}
                    autoSize={{ minRows: 3, maxRows: 8 }}
                    style={{ background: 'var(--neutral-50)', padding: 12, borderRadius: 8, fontSize: 14 }}
                  />
                </div>
              </div>
            ) : (
              <div style={{ position: 'relative', paddingLeft: 16 }}>
                {/* Modern Gradient Timeline */}
                <div style={{
                  position: 'absolute',
                  left: 7,
                  top: 4,
                  bottom: 20,
                  width: 3,
                  background: 'linear-gradient(180deg, var(--success-text) 0%, var(--accent-color) 50%, var(--neutral-200) 100%)',
                  borderRadius: 2
                }}></div>
                {completedSteps.map((step: string, i: number) => (
                  <div key={`c-${i}`} style={{ display: 'flex', gap: 16, marginBottom: 24, position: 'relative' }}>
                    {/* Pulse Animation Node */}
                    <div className="pulse" style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: 'var(--success-text)',
                      border: '3px solid #fff',
                      boxShadow: '0 0 0 3px rgba(5, 150, 105, 0.15), 0 4px 8px rgba(0, 0, 0, 0.1)',
                      zIndex: 2,
                      flexShrink: 0
                    }}></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, color: 'var(--neutral-900)', fontWeight: 500, lineHeight: 1.4 }}>{step}</div>
                      <div style={{ fontSize: 11, color: 'var(--success-text)', marginTop: 4, fontWeight: 600 }}>✓ 已完成</div>
                    </div>
                  </div>
                ))}
                {nextSteps.map((step: string, i: number) => (
                  <div key={`n-${i}`} style={{ display: 'flex', gap: 16, marginBottom: 24, position: 'relative' }}>
                    <div style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: 'white',
                      border: `3px solid ${i === 0 ? 'var(--accent-color)' : 'var(--neutral-300)'}`,
                      boxShadow: i === 0 ? '0 0 0 3px rgba(37, 99, 235, 0.15), 0 4px 8px rgba(0, 0, 0, 0.08)' : 'none',
                      zIndex: 2,
                      flexShrink: 0
                    }}></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, color: i === 0 ? 'var(--neutral-800)' : 'var(--neutral-400)', fontWeight: i === 0 ? 600 : 400, lineHeight: 1.4 }}>{step}</div>
                      {i === 0 && <div style={{ fontSize: 11, color: 'var(--accent-color)', marginTop: 4, fontWeight: 600 }}>进行中</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!isEditing && (
            <div style={{ background: 'var(--neutral-50)', padding: '16px 24px', borderTop: '1px solid var(--neutral-100)', display: 'flex', gap: 24 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--neutral-400)', fontWeight: 700 }}>截止日期</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, color: 'var(--neutral-700)', fontSize: 13, fontWeight: 600 }}>
                  <IoCalendarOutline /> {task.deadline ? dayjs(task.deadline).format('MMM DD, YYYY') : '未设置'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--neutral-400)', fontWeight: 700 }}>执行人</div>
                <div style={{ display: 'flex', marginTop: 4 }}>
                  {task.expand?.assignees?.map((u: any, idx: number) => (
                    <div key={u.id} style={{ marginLeft: idx > 0 ? -8 : 0, border: '2px solid white', borderRadius: '50%' }}>
                      <Avatar src={u.avatar ? pb.files.getUrl(u, u.avatar) : ''} style={{ '--size': '24px' }} />
                    </div>
                  ))}
                  {!task.expand?.assignees && <div style={{ fontSize: 13, color: 'var(--neutral-700)' }}>待分配</div>}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Blocker Report Dialog - 简化：去掉类型选择，只填原因 */}
      <Dialog
        visible={showBlockerDialog}
        title="上报卡点"
        content={
          <div style={{ padding: '8px 0' }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--neutral-500)', marginBottom: 4 }}>卡点原因 *</div>
              <TextArea
                placeholder="请描述卡点原因..."
                value={blockerForm.reason_detail}
                onChange={v => setBlockerForm({ ...blockerForm, reason_detail: v })}
                autoSize={{ minRows: 3, maxRows: 6 }}
                style={{ fontSize: 14 }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--neutral-500)', marginBottom: 4 }}>预计解决日期</div>
              <Input
                type="date"
                value={blockerForm.expected_resolve}
                onChange={v => setBlockerForm({ ...blockerForm, expected_resolve: v })}
                style={{ fontSize: 14 }}
              />
            </div>
          </div>
        }
        actions={[
          { key: 'cancel', text: '取消', onClick: () => setShowBlockerDialog(false) },
          { key: 'submit', text: submittingBlocker ? '提交中...' : '确认上报', onClick: handleSubmitBlocker, bold: true, style: { color: '#ef4444' } }
        ]}
        onClose={() => setShowBlockerDialog(false)}
      />

      {/* Enhanced Floating Action Buttons */}
      <div className="float-up" style={{ position: 'fixed', bottom: 24, left: 20, right: 20, zIndex: 100, maxWidth: 440, margin: '0 auto' }}>
        {isEditing ? (
          <Button
            className="premium-button" block shape='rounded'
            style={{
              background: 'var(--primary-gradient)',
              border: 'none',
              height: 56,
              fontSize: 16,
              color: 'white',
              boxShadow: 'var(--shadow-premium-xl)',
              transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}
            onClick={handleSaveEdit}
            loading={completing}
          >
            <IoSaveOutline size={20} style={{ marginRight: 8 }} /> 保存修改
          </Button>
        ) : (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            style={{ display: 'flex', gap: 12 }}
          >
            {/* 卡点上报按钮 — 所有人可用 */}
            {task.status !== 'completed' && task.status !== 'blocked' && (
              <Button
                className="premium-button" shape='rounded'
                style={{
                  background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                  border: 'none',
                  height: 56,
                  width: 56,
                  flexShrink: 0,
                  fontSize: 16,
                  color: 'white',
                  boxShadow: '0 4px 14px rgba(245, 158, 11, 0.4)',
                  transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
                }}
                onClick={() => setShowBlockerDialog(true)}
              >
                <IoWarningOutline size={24} />
              </Button>
            )}

            {/* 取消卡点按钮 — 仅经理可用 */}
            {task.status === 'blocked' && isManager && (
              <Button
                className="premium-button" shape='rounded'
                style={{
                  background: 'linear-gradient(135deg, #34d399 0%, #059669 100%)',
                  border: 'none',
                  height: 56,
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'white',
                  boxShadow: '0 4px 14px rgba(5, 150, 105, 0.4)',
                  flex: 1
                }}
                onClick={() => {
                  const handleUnblock = async (newStatus: 'completed' | 'in_progress') => {
                    if (!id) return
                    await pb.collection('tasks').update(id, { status: newStatus, blocker: null })
                    await pb.collection('audit_logs').create({ project: task.project, task: id, action_type: 'unblock_task', operator: currentUser?.id, after_data: { status: newStatus } })
                    const userName = currentUser?.name || currentUser?.username
                    const label = newStatus === 'completed' ? '已完成' : '进行中'
                    notifyProjectMembers(task.project, '卡点解除', `${userName} 解除了「${task.stage_name}」的卡点，状态变为${label}`, 'task_update', currentUser?.id, id).catch(() => {})
                    Toast.show({ content: newStatus === 'completed' ? '已标记完成' : '已恢复进行中', icon: 'success' })
                    loadData()
                    queryClient.invalidateQueries({ queryKey: ['tasks'] })
                    queryClient.invalidateQueries({ queryKey: ['projects'] })
                    queryClient.invalidateQueries({ queryKey: ['notifications'] })
                    queryClient.invalidateQueries({ queryKey: ['audit_logs'] })
                  }
                  const d = Dialog.show({
                    title: '取消卡点 — 选择新状态',
                    content: (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
                        <Button block color='success' shape='rounded' onClick={() => { d.close(); handleUnblock('completed') }}>
                          标记为已完成
                        </Button>
                        <Button block color='primary' shape='rounded' fill='outline' onClick={() => { d.close(); handleUnblock('in_progress') }}>
                          恢复为进行中
                        </Button>
                      </div>
                    ),
                    actions: []
                  })
                }}
              >
                取消卡点
              </Button>
            )}

            {/* 完成按钮 — 经理或被分配人可用 */}
            {canComplete && (
              <Button
                className="premium-button" block shape='rounded'
                style={{
                  background: task.status === 'completed' ? 'var(--success-gradient)' : task.status === 'blocked' ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'var(--primary-gradient)',
                  border: 'none',
                  height: 56,
                  fontSize: 16,
                  fontWeight: 600,
                  color: 'white',
                  boxShadow: task.status === 'completed' ? 'var(--shadow-success)' : 'var(--shadow-premium-xl)',
                  transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  flex: 1
                }}
                onClick={handleComplete}
                disabled={task.status === 'completed' || task.status === 'blocked' || completing}
                loading={completing}
              >
                {task.status === 'completed' ? <><IoCheckmarkDone style={{ marginRight: 8 }} size={20} /> 已完成</> : task.status === 'blocked' ? <><IoWarningOutline style={{ marginRight: 8 }} size={20} /> 已阻塞</> : '标记为完成'}
              </Button>
            )}

            {/* 员工视角：只读状态标签（非经理且非被分配人） */}
            {!canComplete && task.status !== 'blocked' && (
              <div style={{
                flex: 1, height: 56, borderRadius: 28,
                background: task.status === 'completed' ? 'var(--success-gradient)' : 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 600, color: task.status === 'completed' ? 'white' : '#64748b'
              }}>
                {task.status === 'completed' ? '已完成' : task.status === 'in_progress' ? '进行中' : '待开始'}
              </div>
            )}
            {!canComplete && task.status === 'blocked' && (
              <div style={{
                flex: 1, height: 56, borderRadius: 28,
                background: 'linear-gradient(135deg, #fecaca 0%, #fca5a5 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 600, color: '#dc2626'
              }}>
                已阻塞 — 等待经理处理
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}

export default TaskDetail

