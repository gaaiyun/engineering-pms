import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  Button,
  Input,
  TextArea,
  DatePicker,
  Toast,
  Tag,
  Popup,
  SearchBar,
  Switch
} from 'antd-mobile'
import dayjs from 'dayjs'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { pb, getPocketBaseErrorMessage } from '../lib/pocketbase'
import { notifyManagersAboutTaskProgress, type TaskStatus, useCreateTask } from '../lib/api'
import {
  IoArrowBackOutline,
  IoCheckmarkCircle,
  IoCalendarOutline,
  IoPersonOutline,
  IoFolderOutline,
  IoDocumentTextOutline,
  IoArrowForwardOutline,
  IoCloseCircle,
  IoTimeOutline,
  IoSendOutline,
  IoEyeOutline,
  IoAlertCircleOutline,
  IoCheckmarkDoneOutline
} from 'react-icons/io5'

interface Project {
  id: string
  name: string
  status?: string
}

interface User {
  id: string
  username: string
  name?: string
  department?: string
  avatar?: string
  role?: string
}

interface Task {
  id: string
  stage_name: string
  status: string
  completed_steps?: string
  next_steps?: string
}

// 常用流程节点模板
const STAGE_TEMPLATES = [
  '图纸审核', '材料送检', '预算编制', '合同签订', '现场勘察',
  '方案设计', '资料归档', '竣工验收', '结算审计', '质量检测',
  '安全检查', '进度汇报', '变更审批', '款项申请', '文件报送'
]

// 任务状态
const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string; color: string; icon?: string }> = [
  { value: 'pending', label: '待开始', color: '#94A3B8', icon: '' },
  { value: 'in_progress', label: '进行中', color: '#3B82F6' },
  { value: 'blocked', label: '遇到卡点', color: '#EF4444' },
  { value: 'completed', label: '已完成', color: '#10B981' },
]

export default function TaskCreate() {
  const navigate = useNavigate()
  const createTask = useCreateTask()

  // 权限校验：仅经理/管理员可创建任务
  useEffect(() => {
    const role = pb.authStore.model?.role?.toLowerCase()
    if (role !== 'admin' && role !== 'manager') {
      navigate('/app', { replace: true })
    }
  }, [navigate])

  const [searchParams] = useSearchParams()
  const preSelectedProjectId = searchParams.get('projectId')

  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [existingTasks, setExistingTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [deadlineVisible, setDeadlineVisible] = useState(false)
  const [deadline, setDeadline] = useState<Date | undefined>(() => {
    const d = new Date()
    d.setDate(d.getDate() + 3)
    return d
  })
  const [selectedProject, setSelectedProject] = useState<string | null>(preSelectedProjectId)
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])
  const [showProjectPicker, setShowProjectPicker] = useState(false)
  const [showAssigneePicker, setShowAssigneePicker] = useState(false)
  const [searchText, setSearchText] = useState('')
  
  // 表单数据
  const [stageName, setStageName] = useState('')
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('in_progress')
  const [progressNote, setProgressNote] = useState('') // 本次更新说明
  const [blockerReason, setBlockerReason] = useState('') // 卡点原因
  
  // 下一步相关
  const [hasNextStep, setHasNextStep] = useState(false)
  const [nextStepName, setNextStepName] = useState('')
  const [nextStepAssignees, setNextStepAssignees] = useState<string[]>([])
  const [showNextAssigneePicker, setShowNextAssigneePicker] = useState(false)
  const [notifyManager, setNotifyManager] = useState(true)
  
  // 预览确认
  const [showPreview, setShowPreview] = useState(false)

  const loadOptions = useCallback(async () => {
    try {
      const [projRes, userRes] = await Promise.all([
        pb.collection('projects').getFullList<Project>(50, { sort: '-created', filter: 'status != "archived"' }),
        pb.collection('users').getFullList<User>(100, { sort: 'name' })
      ])
      setProjects(projRes)
      setUsers(userRes)

      if (preSelectedProjectId) {
        setSelectedProject(preSelectedProjectId)
      }
    } catch {
      Toast.show({ icon: 'fail', content: '加载数据失败' })
    }
  }, [preSelectedProjectId])

  useEffect(() => {
    loadOptions()
  }, [loadOptions])

  // 当选择项目后，加载该项目的现有任务
  useEffect(() => {
    if (selectedProject) {
      loadProjectTasks(selectedProject)
    }
  }, [selectedProject])

  const loadProjectTasks = async (projectId: string) => {
    try {
      const tasks = await pb.collection('tasks').getFullList<Task>({
        filter: `project="${projectId}"`,
        sort: '-created'
      })
      setExistingTasks(tasks)
    } catch (e) {
      console.error('加载项目任务失败', e)
    }
  }

  const filteredUsers = useMemo(() => {
    if (!searchText) return users
    return users.filter(u =>
      (u.name || u.username).toLowerCase().includes(searchText.toLowerCase()) ||
      (u.department || '').toLowerCase().includes(searchText.toLowerCase())
    )
  }, [users, searchText])

  const selectedProjectData = projects.find(p => p.id === selectedProject)
  const currentUser = pb.authStore.model

  // 获取最近的任务作为"上一步"参考
  const recentTask = existingTasks.length > 0 ? existingTasks[0] : null

  const handleSubmit = async () => {
    if (!selectedProject) {
      Toast.show({ icon: 'fail', content: '请选择项目' })
      return
    }

    if (!stageName?.trim()) {
      Toast.show({ icon: 'fail', content: '请输入当前节点名称' })
      return
    }

    setLoading(true)
    try {
      const taskData: Record<string, any> = {
        project: selectedProject,
        stage_name: stageName,
        status: taskStatus,
        next_steps: progressNote || undefined,
        start_date: new Date().toISOString(),
        deadline: deadline ? dayjs(deadline).format('YYYY-MM-DD HH:mm:ss') : null,
        assignees: selectedAssignees.length > 0 ? selectedAssignees : [currentUser?.id],
        created_by: currentUser?.id,
        sequence: Date.now(),
      }
      if (taskStatus === 'blocked' && blockerReason) {
        taskData.blocker = { reason_type: 'other', reason_detail: blockerReason, need_help_from: [], expected_resolve: '' }
      }

      const createdTask = await createTask.mutateAsync(taskData)

      // 如果有下一步，沿用统一任务创建链路，避免页面层自己写通知记录
      if (hasNextStep && nextStepName?.trim() && nextStepAssignees.length > 0) {
        const nextTaskData = {
          project: selectedProject,
          stage_name: nextStepName,
          status: 'pending' as const,
          predecessor_tasks: [createdTask.id],
          start_date: new Date().toISOString(),
          assignees: nextStepAssignees,
          created_by: currentUser?.id,
          sequence: Date.now() + 1,
        }

        await createTask.mutateAsync(nextTaskData)
      }

      // 如果需要通知经理，使用统一通知 helper，页面不再直接创建 notifications 记录
      if (notifyManager) {
        const managerIds = users
          .filter(u => u.role === 'manager' || u.role === 'admin')
          .map((manager) => manager.id)
        await notifyManagersAboutTaskProgress({
          managerIds,
          taskId: createdTask.id,
          stageName,
          statusLabel: STATUS_OPTIONS.find(s => s.value === taskStatus)?.label || taskStatus,
          excludeUserId: currentUser?.id,
        })
      }

      Toast.show({ icon: 'success', content: '提交成功！' })
      navigate(-1)
    } catch (e: unknown) {
      console.error('提交失败', e)
      Toast.show({ icon: 'fail', content: '保存失败: ' + getPocketBaseErrorMessage(e, '未知错误') })
    } finally {
      setLoading(false)
    }
  }

  // 进入预览模式
  const goToPreview = () => {
    if (!selectedProject) {
      Toast.show({ icon: 'fail', content: '请选择项目' })
      return
    }
    if (!stageName?.trim()) {
      Toast.show({ icon: 'fail', content: '请输入当前节点名称' })
      return
    }
    if (taskStatus === 'blocked' && !blockerReason?.trim()) {
      Toast.show({ icon: 'fail', content: '请说明卡点原因' })
      return
    }
    if (hasNextStep && nextStepName?.trim() && nextStepAssignees.length === 0) {
      Toast.show({ icon: 'fail', content: '请指定下一步负责人' })
      return
    }
    setShowPreview(true)
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 100%)'
    }}>
      {/* Header */}
      <div
        style={{
          background: 'white',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          borderBottom: '1px solid #E2E8F0',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}
      >
        <button
          onClick={() => navigate(-1)}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: '#F1F5F9',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          <IoArrowBackOutline size={20} color="#64748B" />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>更新进度</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>记录工作进展，指定下一步</div>
        </div>
      </div>

      {/* 内容区域 */}
      <div style={{ padding: '20px 20px 100px' }}>
        
        {/* 步骤1: 选择项目和节点 */}
        <div style={{
          background: 'white',
          borderRadius: 16,
          padding: 20,
          marginBottom: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <IoFolderOutline size={20} color="#2563EB" />
            <span style={{ fontWeight: 700, color: '#1E293B' }}>选择项目</span>
            <span style={{ color: '#EF4444', fontSize: 12 }}>*</span>
          </div>

          <div
            onClick={() => setShowProjectPicker(true)}
            style={{
              padding: '14px 16px',
              background: selectedProject ? '#EFF6FF' : '#F8FAFC',
              borderRadius: 12,
              border: `2px solid ${selectedProject ? '#2563EB' : '#E2E8F0'}`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <span style={{
              color: selectedProject ? '#1E293B' : '#94A3B8',
              fontWeight: selectedProject ? 600 : 400
            }}>
              {selectedProjectData?.name || '点击选择项目'}
            </span>
            <IoArrowForwardOutline size={18} color="#94A3B8" />
          </div>

          {/* 显示该项目最近的任务 */}
          {recentTask && (
            <div style={{
              marginTop: 12,
              padding: 12,
              background: '#F0FDF4',
              borderRadius: 10,
              border: '1px solid #86EFAC'
            }}>
              <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 600, marginBottom: 4 }}>
                该项目最近任务
              </div>
              <div style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>
                {recentTask.stage_name}
              </div>
              <div style={{ fontSize: 11, color: '#22C55E', marginTop: 2 }}>
                状态: {STATUS_OPTIONS.find(s => s.value === recentTask.status)?.label || recentTask.status}
              </div>
            </div>
          )}
        </div>

        {/* 步骤2: 当前节点信息 */}
        <div style={{
          background: 'white',
          borderRadius: 16,
          padding: 20,
          marginBottom: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <IoDocumentTextOutline size={20} color="#10B981" />
            <span style={{ fontWeight: 700, color: '#1E293B' }}>当前节点</span>
            <span style={{ color: '#EF4444', fontSize: 12 }}>*</span>
          </div>

          <Input
            value={stageName}
            onChange={setStageName}
            placeholder='输入当前工作节点，如：图纸审核'
            style={{
              '--font-size': '15px',
              padding: '14px 16px',
              background: '#F8FAFC',
              borderRadius: 12,
              border: '2px solid #E2E8F0',
              marginBottom: 12
            }}
          />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {STAGE_TEMPLATES.slice(0, 8).map(t => (
              <Tag
                key={t}
                onClick={() => setStageName(t)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  background: stageName === t ? '#2563EB' : '#F1F5F9',
                  color: stageName === t ? 'white' : '#475569',
                  fontSize: 12,
                  cursor: 'pointer',
                  border: 'none'
                }}
              >
                {t}
              </Tag>
            ))}
          </div>
        </div>

        {/* 步骤3: 任务状态 */}
        <div style={{
          background: 'white',
          borderRadius: 16,
          padding: 20,
          marginBottom: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <IoCheckmarkDoneOutline size={20} color="#8B5CF6" />
            <span style={{ fontWeight: 700, color: '#1E293B' }}>当前状态</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {STATUS_OPTIONS.map(opt => (
              <div
                key={opt.value}
                onClick={() => setTaskStatus(opt.value)}
                style={{
                  padding: '14px 12px',
                  borderRadius: 12,
                  border: `2px solid ${taskStatus === opt.value ? opt.color : '#E2E8F0'}`,
                  background: taskStatus === opt.value ? `${opt.color}15` : '#F8FAFC',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  transition: 'all 0.2s'
                }}
              >
                <span style={{ fontSize: 20 }}>{opt.icon}</span>
                <span style={{ 
                  fontWeight: 600, 
                  color: taskStatus === opt.value ? opt.color : '#64748B',
                  fontSize: 14
                }}>
                  {opt.label}
                </span>
              </div>
            ))}
          </div>

          {/* 卡点原因 */}
          {taskStatus === 'blocked' && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, color: '#EF4444', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                <IoAlertCircleOutline size={16} />
                请说明卡点原因
              </div>
              <TextArea
                value={blockerReason}
                onChange={setBlockerReason}
                placeholder='描述遇到的问题，如：等待甲方确认变更方案'
                autoSize={{ minRows: 2, maxRows: 4 }}
                style={{
                  '--font-size': '14px',
                  padding: '12px 14px',
                  background: '#FEF2F2',
                  borderRadius: 12,
                  border: '2px solid #FECACA'
                }}
              />
            </div>
          )}

          {/* 进度说明 */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, color: '#64748B', fontWeight: 600, marginBottom: 8 }}>
              本次更新说明（选填）
            </div>
            <TextArea
              value={progressNote}
              onChange={setProgressNote}
              placeholder='简要说明本次进展，如：已完成图纸初审，发现3处问题需要修改'
              autoSize={{ minRows: 2, maxRows: 4 }}
              style={{
                '--font-size': '14px',
                padding: '12px 14px',
                background: '#F8FAFC',
                borderRadius: 12,
                border: '2px solid #E2E8F0'
              }}
            />
          </div>
        </div>

        {/* 步骤4: 指定执行人 */}
        <div style={{
          background: 'white',
          borderRadius: 16,
          padding: 20,
          marginBottom: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <IoPersonOutline size={20} color="#F59E0B" />
            <span style={{ fontWeight: 700, color: '#1E293B' }}>本节点负责人</span>
          </div>

          <div
            onClick={() => setShowAssigneePicker(true)}
            style={{
              padding: '14px 16px',
              background: '#F8FAFC',
              borderRadius: 12,
              border: '2px solid #E2E8F0',
              cursor: 'pointer',
              minHeight: 50
            }}
          >
            {selectedAssignees.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {selectedAssignees.map(id => {
                  const user = users.find(u => u.id === id)
                  return user ? (
                    <Tag key={id} style={{ background: '#FEF3C7', color: '#92400E', borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 600, border: 'none' }}>
                      {user.name || user.username}
                    </Tag>
                  ) : null
                })}
              </div>
            ) : (
              <span style={{ color: '#94A3B8' }}>默认为自己，点击可修改</span>
            )}
          </div>
        </div>

        {/* 步骤5: 下一步任务（可选） */}
        <div style={{
          background: 'white',
          borderRadius: 16,
          padding: 20,
          marginBottom: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <IoArrowForwardOutline size={20} color="#06B6D4" />
              <span style={{ fontWeight: 700, color: '#1E293B' }}>指定下一步</span>
              <span style={{ color: '#94A3B8', fontSize: 12 }}>选填</span>
            </div>
            <Switch
              checked={hasNextStep}
              onChange={setHasNextStep}
              style={{ '--checked-color': '#06B6D4' }}
            />
          </div>

          {hasNextStep && (
            <div className="fade-in">
              <Input
                value={nextStepName}
                onChange={setNextStepName}
                placeholder='下一步任务名称，如：材料送检'
                style={{
                  '--font-size': '15px',
                  padding: '14px 16px',
                  background: '#F8FAFC',
                  borderRadius: 12,
                  border: '2px solid #E2E8F0',
                  marginBottom: 12
                }}
              />

              <div style={{ fontSize: 13, color: '#64748B', fontWeight: 600, marginBottom: 8 }}>
                下一步负责人 <span style={{ color: '#EF4444' }}>*</span>
              </div>
              <div
                onClick={() => setShowNextAssigneePicker(true)}
                style={{
                  padding: '14px 16px',
                  background: nextStepAssignees.length > 0 ? '#ECFEFF' : '#F8FAFC',
                  borderRadius: 12,
                  border: `2px solid ${nextStepAssignees.length > 0 ? '#06B6D4' : '#E2E8F0'}`,
                  cursor: 'pointer',
                  minHeight: 50
                }}
              >
                {nextStepAssignees.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {nextStepAssignees.map(id => {
                      const user = users.find(u => u.id === id)
                      return user ? (
                        <Tag key={id} style={{ background: '#06B6D4', color: 'white', borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 600, border: 'none' }}>
                          {user.name || user.username}
                          <IoCloseCircle size={14} style={{ marginLeft: 4 }} onClick={(e) => {
                            e.stopPropagation()
                            setNextStepAssignees(prev => prev.filter(i => i !== id))
                          }} />
                        </Tag>
                      ) : null
                    })}
                  </div>
                ) : (
                  <span style={{ color: '#94A3B8' }}>点击选择下一步负责人（将收到通知）</span>
                )}
              </div>

              <div style={{
                marginTop: 12,
                padding: 12,
                background: '#F0F9FF',
                borderRadius: 10,
                border: '1px solid #BAE6FD',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <IoSendOutline size={16} color="#0284C7" />
                <span style={{ fontSize: 12, color: '#0369A1' }}>
                  提交后将自动通知负责人
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 截止日期 */}
        <div style={{
          background: 'white',
          borderRadius: 16,
          padding: 20,
          marginBottom: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <IoCalendarOutline size={20} color="#EF4444" />
            <span style={{ fontWeight: 700, color: '#1E293B' }}>截止日期</span>
          </div>

          <div
            onClick={() => setDeadlineVisible(true)}
            style={{
              padding: '14px 16px',
              background: deadline ? '#FEF2F2' : '#F8FAFC',
              borderRadius: 12,
              border: `2px solid ${deadline ? '#FECACA' : '#E2E8F0'}`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <span style={{ color: deadline ? '#DC2626' : '#94A3B8', fontWeight: deadline ? 600 : 400 }}>
              {deadline ? dayjs(deadline).format('YYYY年MM月DD日') : '选择截止日期'}
            </span>
            <IoTimeOutline size={18} color={deadline ? '#DC2626' : '#94A3B8'} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {[
              { label: '明天', days: 1 },
              { label: '3天后', days: 3 },
              { label: '一周后', days: 7 },
            ].map(({ label, days }) => (
              <Tag
                key={label}
                onClick={() => {
                  const d = new Date()
                  d.setDate(d.getDate() + days)
                  setDeadline(d)
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  background: '#F1F5F9',
                  color: '#475569',
                  fontSize: 12,
                  cursor: 'pointer',
                  border: 'none'
                }}
              >
                {label}
              </Tag>
            ))}
          </div>
        </div>

        {/* 通知经理 */}
        <div style={{
          background: 'white',
          borderRadius: 16,
          padding: 16,
          marginBottom: 24,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#8B5CF6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IoSendOutline size={18} color="white" />
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#1E293B', fontSize: 14 }}>同步通知经理</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>让经理及时了解进度</div>
            </div>
          </div>
          <Switch
            checked={notifyManager}
            onChange={setNotifyManager}
            style={{ '--checked-color': '#8B5CF6' }}
          />
        </div>

        {/* 提交按钮 */}
        <Button
          block
          onClick={goToPreview}
          style={{
            background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
            border: 'none',
            color: 'white',
            borderRadius: 14,
            height: 52,
            fontSize: 16,
            fontWeight: 700,
            boxShadow: '0 8px 24px rgba(37, 99, 235, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8
          }}
        >
          <IoEyeOutline size={20} />
          预览并确认
        </Button>
      </div>

      {/* 预览弹窗 */}
      <Popup
        visible={showPreview}
        onMaskClick={() => setShowPreview(false)}
        bodyStyle={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85vh', overflow: 'auto' }}
      >
        <div style={{ padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 20, textAlign: 'center' }}>
            确认提交
          </div>

          {/* 预览卡片 */}
          <div style={{
            background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
            borderRadius: 16,
            padding: 20,
            color: 'white',
            marginBottom: 20
          }}>
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>项目</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
              {selectedProjectData?.name || '未选择'}
            </div>

            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>当前节点</div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
              {stageName || '未命名'}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <span style={{ 
                background: STATUS_OPTIONS.find(s => s.value === taskStatus)?.color, 
                padding: '4px 10px', 
                borderRadius: 6, 
                fontSize: 12,
                fontWeight: 600
              }}>
                {STATUS_OPTIONS.find(s => s.value === taskStatus)?.icon} {STATUS_OPTIONS.find(s => s.value === taskStatus)?.label}
              </span>
              {deadline && (
                <span style={{ background: 'rgba(239,68,68,0.3)', padding: '4px 10px', borderRadius: 6, fontSize: 12 }}>
                  {dayjs(deadline).format('MM-DD')}
                </span>
              )}
            </div>

            {progressNote && (
              <div style={{ marginTop: 12, padding: 12, background: 'rgba(255,255,255,0.1)', borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4 }}>进度说明</div>
                <div style={{ fontSize: 13 }}>{progressNote}</div>
              </div>
            )}

            {taskStatus === 'blocked' && blockerReason && (
              <div style={{ marginTop: 12, padding: 12, background: 'rgba(239,68,68,0.2)', borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: '#FCA5A5', marginBottom: 4 }}>卡点原因</div>
                <div style={{ fontSize: 13 }}>{blockerReason}</div>
              </div>
            )}
          </div>

          {/* 下一步预览 */}
          {hasNextStep && nextStepName && (
            <div style={{
              background: '#F0FDFA',
              borderRadius: 12,
              padding: 16,
              marginBottom: 20,
              border: '2px solid #5EEAD4'
            }}>
              <div style={{ fontWeight: 700, color: '#0F766E', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <IoArrowForwardOutline size={18} />
                下一步任务
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#134E4A', marginBottom: 8 }}>
                {nextStepName}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {nextStepAssignees.map(id => {
                  const user = users.find(u => u.id === id)
                  return user ? (
                    <Tag key={id} style={{ background: '#14B8A6', color: 'white', borderRadius: 6, fontSize: 12 }}>
                      {user.name || user.username}
                    </Tag>
                  ) : null
                })}
              </div>
              <div style={{ fontSize: 11, color: '#0D9488', marginTop: 8 }}>
                提交后将自动通知以上负责人
              </div>
            </div>
          )}

          {notifyManager && (
            <div style={{ fontSize: 12, color: '#8B5CF6', marginBottom: 20, textAlign: 'center' }}>
              ✓ 将同步通知经理
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <Button
              onClick={() => setShowPreview(false)}
              style={{
                flex: 1,
                background: '#F1F5F9',
                border: 'none',
                color: '#64748B',
                borderRadius: 12,
                height: 48,
                fontWeight: 600
              }}
            >
              返回修改
            </Button>
            <Button
              loading={loading}
              onClick={handleSubmit}
              style={{
                flex: 2,
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                border: 'none',
                color: 'white',
                borderRadius: 12,
                height: 48,
                fontWeight: 700,
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
              }}
            >
              <IoCheckmarkCircle size={18} style={{ marginRight: 6 }} />
              确认提交
            </Button>
          </div>
        </div>
      </Popup>

      {/* 项目选择弹窗 */}
      <Popup
        visible={showProjectPicker}
        onMaskClick={() => setShowProjectPicker(false)}
        bodyStyle={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70vh' }}
      >
        <div style={{ padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>选择项目</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '50vh', overflowY: 'auto' }}>
            {projects.map(p => (
              <div
                key={p.id}
                onClick={() => {
                  setSelectedProject(p.id)
                  setShowProjectPicker(false)
                }}
                style={{
                  padding: '14px 16px',
                  background: selectedProject === p.id ? '#EFF6FF' : '#F8FAFC',
                  borderRadius: 12,
                  border: `2px solid ${selectedProject === p.id ? '#2563EB' : 'transparent'}`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <span style={{ fontWeight: 600, color: '#1E293B' }}>{p.name}</span>
                {selectedProject === p.id && <IoCheckmarkCircle size={20} color="#2563EB" />}
              </div>
            ))}
          </div>
        </div>
      </Popup>

      {/* 人员选择弹窗 */}
      <Popup
        visible={showAssigneePicker}
        onMaskClick={() => setShowAssigneePicker(false)}
        bodyStyle={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80vh' }}
      >
        <div style={{ padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>选择负责人</div>
          <SearchBar placeholder="搜索姓名或部门" value={searchText} onChange={setSearchText} style={{ marginBottom: 16 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '50vh', overflowY: 'auto' }}>
            {filteredUsers.map(u => {
              const isSelected = selectedAssignees.includes(u.id)
              return (
                <div
                  key={u.id}
                  onClick={() => {
                    setSelectedAssignees(prev => isSelected ? prev.filter(i => i !== u.id) : [...prev, u.id])
                  }}
                  style={{
                    padding: '12px 16px',
                    background: isSelected ? '#FEF3C7' : '#F8FAFC',
                    borderRadius: 12,
                    border: `2px solid ${isSelected ? '#F59E0B' : 'transparent'}`,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: isSelected ? '#F59E0B' : '#CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700 }}>
                    {(u.name || u.username).charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: '#1E293B' }}>{u.name || u.username}</div>
                    <div style={{ fontSize: 12, color: '#94A3B8' }}>{u.department || '未分配部门'}</div>
                  </div>
                  {isSelected && <IoCheckmarkCircle size={22} color="#F59E0B" />}
                </div>
              )
            })}
          </div>
          <Button block onClick={() => setShowAssigneePicker(false)} style={{ marginTop: 16, background: '#F59E0B', border: 'none', color: 'white', borderRadius: 12, height: 48, fontWeight: 600 }}>
            确定
          </Button>
        </div>
      </Popup>

      {/* 下一步负责人选择弹窗 */}
      <Popup
        visible={showNextAssigneePicker}
        onMaskClick={() => setShowNextAssigneePicker(false)}
        bodyStyle={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80vh' }}
      >
        <div style={{ padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>选择下一步负责人</div>
          <SearchBar placeholder="搜索姓名或部门" value={searchText} onChange={setSearchText} style={{ marginBottom: 16 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '50vh', overflowY: 'auto' }}>
            {filteredUsers.map(u => {
              const isSelected = nextStepAssignees.includes(u.id)
              return (
                <div
                  key={u.id}
                  onClick={() => {
                    setNextStepAssignees(prev => isSelected ? prev.filter(i => i !== u.id) : [...prev, u.id])
                  }}
                  style={{
                    padding: '12px 16px',
                    background: isSelected ? '#ECFEFF' : '#F8FAFC',
                    borderRadius: 12,
                    border: `2px solid ${isSelected ? '#06B6D4' : 'transparent'}`,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: isSelected ? '#06B6D4' : '#CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700 }}>
                    {(u.name || u.username).charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: '#1E293B' }}>{u.name || u.username}</div>
                    <div style={{ fontSize: 12, color: '#94A3B8' }}>{u.department || '未分配部门'}</div>
                  </div>
                  {isSelected && <IoCheckmarkCircle size={22} color="#06B6D4" />}
                </div>
              )
            })}
          </div>
          <Button block onClick={() => setShowNextAssigneePicker(false)} style={{ marginTop: 16, background: '#06B6D4', border: 'none', color: 'white', borderRadius: 12, height: 48, fontWeight: 600 }}>
            确定 ({nextStepAssignees.length}人)
          </Button>
        </div>
      </Popup>

      <DatePicker visible={deadlineVisible} onClose={() => setDeadlineVisible(false)} onConfirm={val => setDeadline(val)} min={new Date()} />
    </div>
  )
}
