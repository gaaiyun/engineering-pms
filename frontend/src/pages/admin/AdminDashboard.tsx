import { useEffect, useMemo, useRef, useState } from 'react'
import { TabBar, Grid, Dialog, Form, Input, Selector, Toast, Button, Avatar, ProgressBar, Tag, SpinLoading, Popup } from 'antd-mobile'
import { pb, getPocketBaseErrorMessage } from '../../lib/pocketbase'
import { useQueryClient } from '@tanstack/react-query'
import { useUsers, useProjects, useTasks as useAllTasks, useUnreadAuditCount } from '../../lib/api'
import { queryKeys } from '../../lib/queryClient'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  IoSparkles, IoGridOutline, IoPeopleOutline, IoBriefcaseOutline, 
  IoCheckmarkCircleOutline, IoFolderOutline, IoAddCircleOutline, IoWarningOutline,
  IoTimeOutline, IoPersonOutline, IoSettingsOutline, IoNotificationsOutline,
  IoLogOutOutline, IoChevronForwardOutline, IoCalendarOutline, IoCloudUploadOutline
} from 'react-icons/io5'
import AIConsole from './AIConsole'
import BatchProjectCreator from '../../components/BatchProjectCreator'
import BatchTaskEditor from '../../components/BatchTaskEditor'
import { AVATAR_STYLE_GROUPS } from '../../lib/avatarOptions'
import { IoCameraOutline, IoClose } from 'react-icons/io5'
import { logoutWithDeviceCleanup } from '../../lib/pushNotifications'

interface User {
  id: string
  username: string
  name?: string
  email?: string
  role?: 'admin' | 'manager' | 'employee'
  department?: '工程部' | '审计部' | '财务部' | '管理层'
  avatar?: string
  created?: string
}

interface Project {
  id: string
  name: string
  code?: string
  status: 'active' | 'completed' | 'archived'
  progress: number
}

interface Task {
  id: string
  project: string
  status: 'pending' | 'in_progress' | 'processing' | 'completed' | 'overdue' | 'blocked'
  assignees?: string[]
  created: string
  approved?: boolean
  score?: number
  stage_name: string
  expand?: {
    project?: { id: string; name: string }
    assignees?: Array<{ id: string; name: string; username: string }>
    creator?: { id: string; name: string; username: string }
  }
}

const VALID_TABS = ['dashboard', 'users', 'projects', 'ai', 'timeline', 'profile'] as const
type TabKey = typeof VALID_TABS[number]

const AdminDashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab') as TabKey | null
  const activeKey: TabKey = tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'dashboard'
  const setActiveKey = (key: TabKey) => {
    setSearchParams({ tab: key }, { replace: true })
  }
  
  // 处理无效 tab：如果 URL 中的 tab 无效，重定向到 dashboard
  useEffect(() => {
    if (tabFromUrl && !VALID_TABS.includes(tabFromUrl)) {
      setSearchParams({ tab: 'dashboard' }, { replace: true })
    }
  }, [tabFromUrl, setSearchParams])
  const authUser = pb.authStore.model

  const tabs = [
    { key: 'dashboard', title: '概览', icon: <IoGridOutline /> },
    { key: 'timeline', title: '时间轴', icon: <IoTimeOutline /> },
    { key: 'projects', title: '项目', icon: <IoBriefcaseOutline /> },
    { key: 'ai', title: 'AI', icon: <IoSparkles /> },
    { key: 'profile', title: '我的', icon: <IoPersonOutline /> },
  ]

  const { data: users = [] as User[], isLoading: usersLoading, error: usersError } = useUsers()
  const { data: rqProjects = [], isLoading: projectsLoading, error: projectsError } = useProjects()
  const { data: rqTasks = [], isLoading: tasksLoading, error: tasksError } = useAllTasks()
  const { data: unreadAuditCount = 0 } = useUnreadAuditCount()

  const projects = rqProjects as unknown as Project[]
  const tasks = rqTasks as unknown as Task[]
  const loading = usersLoading || projectsLoading || tasksLoading
  const loadError = (usersError || projectsError || tasksError)
    ? ((usersError || projectsError || tasksError) as any)?.status === 403
      ? '权限不足，请确认账号角色'
      : '网络异常，数据加载失败'
    : null

  const [showUserModal, setShowUserModal] = useState(false)
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [showAddProjectModal, setShowAddProjectModal] = useState(false)
  const [showAddTaskModal, setShowAddTaskModal] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [projectTasks, setProjectTasks] = useState<Task[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [userForm] = Form.useForm()
  const [addUserForm] = Form.useForm()

  // Profile 编辑状态
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [editName, setEditName] = useState(authUser?.name || '')
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null)
  const [avatarStyleIdx, setAvatarStyleIdx] = useState(0)
  const [profileSaving, setProfileSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.users })
    queryClient.invalidateQueries({ queryKey: queryKeys.projects })
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks })
  }

  useEffect(() => {
    const role = pb.authStore.model?.role?.toLowerCase()
    if (!pb.authStore.isValid || (role !== 'admin' && role !== 'manager')) {
      Toast.show({ icon: 'fail', content: '没有权限访问管理员后台' })
      navigate('/app')
    }
  }, [navigate])

  // ---- KPI & 图表数据 ----
  // 活跃项目（与工作进展、经理工作台口径一致，不含归档）
  const activeProjects = useMemo(
    () => projects.filter((p: Project) => p.status !== 'archived'),
    [projects],
  )
  const totalProjects = activeProjects.length
  const archivedProjectIds = useMemo(
    () => new Set(projects.filter((p: Project) => p.status === 'archived').map(p => p.id)),
    [projects],
  )
  const activeTasks = useMemo(
    () => tasks.filter(t => !archivedProjectIds.has(t.project)),
    [tasks, archivedProjectIds],
  )
  const inProgressTasks = activeTasks.filter(t => t.status === 'in_progress' || t.status === 'processing').length
  const overdueTasks = activeTasks.filter(t => t.status === 'overdue').length
  const newUsersThisMonth = useMemo(
    () =>
      users.filter(u => {
        if (!u.created) return false
        const created = new Date(u.created)
        const now = new Date()
        return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth()
      }).length,
    [users],
  )
  const overdueRate = activeTasks.length ? ((overdueTasks / activeTasks.length) * 100).toFixed(1) : '0.0'

  const taskStatusData = [
    { name: '待处理', value: activeTasks.filter(t => t.status === 'pending').length, color: '#64748B' },
    { name: '进行中', value: activeTasks.filter(t => t.status === 'in_progress' || t.status === 'processing').length, color: '#3B82F6' },
    { name: '已完成', value: activeTasks.filter(t => t.status === 'completed').length, color: '#10B981' },
    { name: '已逾期', value: activeTasks.filter(t => t.status === 'overdue').length, color: '#EF4444' },
    { name: '卡点中', value: activeTasks.filter(t => t.status === 'blocked').length, color: '#F59E0B' },
  ]

  // 部门分布数据（用于概览展示）
  const departmentStats = useMemo(() => {
    const deptCount: Record<string, number> = {}
    users.forEach(u => {
      const dept = u.department || '未分配'
      deptCount[dept] = (deptCount[dept] || 0) + 1
    })
    return Object.entries(deptCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)
  }, [users])

  // 人员工作负载数据
  const workloadData = useMemo(() => {
    const userTaskCount: Record<string, { name: string, total: number, blocked: number, overdue: number }> = {}
    tasks.forEach(t => {
      const assignees = t.assignees || []
      assignees.forEach((uid: string) => {
        const user = users.find(u => u.id === uid)
        if (user) {
          if (!userTaskCount[uid]) {
            userTaskCount[uid] = { name: user.name || user.username, total: 0, blocked: 0, overdue: 0 }
          }
          userTaskCount[uid].total++
          if (t.status === 'blocked') userTaskCount[uid].blocked++
          if (t.status === 'overdue') userTaskCount[uid].overdue++
        }
      })
    })
    return Object.values(userTaskCount)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
  }, [tasks, users])

  // 项目进度数据（与 totalProjects 口径一致：仅活跃项目，取前 5 条）
  const projectProgressData = useMemo(() => {
    return activeProjects.slice(0, 5).map(p => {
      const pTasks = tasks.filter(t => t.project === p.id)
      const completed = pTasks.filter(t => t.status === 'completed').length
      const progress = pTasks.length > 0 ? Math.round((completed / pTasks.length) * 100) : 0
      return {
        name: p.name?.substring(0, 6) + (p.name?.length > 6 ? '...' : ''),
        fullName: p.name,
        progress,
        total: pTasks.length,
        blocked: pTasks.filter(t => t.status === 'blocked').length,
      }
    })
  }, [activeProjects, tasks])

  // 卡点人员排名
  const blockedRanking = useMemo(() => {
    const userBlocked: Record<string, { name: string, count: number, tasks: string[] }> = {}
    activeTasks.filter(t => t.status === 'blocked' || t.status === 'overdue').forEach(t => {
      const assignees = t.assignees || []
      assignees.forEach((uid: string) => {
        const user = users.find(u => u.id === uid)
        if (user) {
          if (!userBlocked[uid]) {
            userBlocked[uid] = { name: user.name || user.username, count: 0, tasks: [] }
          }
          userBlocked[uid].count++
          userBlocked[uid].tasks.push(t.stage_name || '未命名')
        }
      })
    })
    return Object.values(userBlocked).sort((a, b) => b.count - a.count).slice(0, 5)
  }, [activeTasks, users])



  // ---- 用户管理 ----

  const handleEditUser = (user: User) => {
    setCurrentUser(user)
    userForm.setFieldsValue({
      name: user.name,
      email: user.email,
      role: user.role ? [user.role] : [],
      department: user.department ? [user.department] : [],
    })
    setShowUserModal(true)
  }

  const handleUserUpdate = async (values: any) => {
    if (!currentUser) return
    try {
      await pb.collection('users').update(currentUser.id, {
        ...values,
        role: Array.isArray(values.role) ? values.role[0] : values.role,
        department: Array.isArray(values.department) ? values.department[0] : values.department,
      })
      Toast.show({ icon: 'success', content: '用户已更新' })
      setShowUserModal(false)
      refreshAll()
    } catch (error: unknown) {
      console.error('update user failed', error)
      Toast.show({ icon: 'fail', content: getPocketBaseErrorMessage(error, '更新失败') })
    }
  }

  const handleAddUser = async (values: any) => {
    try {
      await pb.collection('users').create({
        username: values.username.trim(),
        email: values.email,
        password: values.password,
        passwordConfirm: values.password,
        name: values.name,
        role: Array.isArray(values.role) ? values.role[0] : values.role,
        department: Array.isArray(values.department) ? values.department[0] : values.department,
      })
      Toast.show({ icon: 'success', content: '新用户已创建' })
      setShowAddUserModal(false)
      addUserForm.resetFields()
      refreshAll()
    } catch (error: unknown) {
      console.error('add user failed', error)
      Toast.show({ icon: 'fail', content: getPocketBaseErrorMessage(error, '创建失败') })
    }
  }

  // ---- 项目状态 ----

  const handleProjectStatusChange = async (project: Project, newStatus: Project['status']) => {
    try {
      await pb.collection('projects').update(project.id, { status: newStatus })
      Toast.show({ icon: 'success', content: '项目状态已更新' })
      refreshAll()
    } catch (error: unknown) {
      console.error('update project failed', error)
      Toast.show({ icon: 'fail', content: getPocketBaseErrorMessage(error, '更新失败') })
    }
  }


  // ---- 项目任务管理 ----

  const handleSelectProject = async (project: Project) => {
    setSelectedProject(project)
    const filter = `project = "${project.id}"`
    const primarySort = 'sequence,created'
    try {
      const tasksRes = await pb.collection('tasks').getFullList<Task>({
        filter,
        sort: primarySort,
        expand: 'assignees',
      })
      setProjectTasks(tasksRes)
    } catch (error: unknown) {
      console.error('load project tasks failed (expand)', error)
      try {
        const tasksRes = await pb.collection('tasks').getFullList<Task>({
          filter,
          sort: primarySort,
        })
        setProjectTasks(tasksRes)
        Toast.show({
          icon: 'fail',
          content: '任务列表已更新（部分负责人信息暂时无法展开，可忽略）',
        })
      } catch (err2: unknown) {
        console.error('load project tasks failed (no expand)', err2)
        try {
          const tasksRes = await pb.collection('tasks').getFullList<Task>({
            filter,
            sort: '-created',
          })
          setProjectTasks(tasksRes)
          Toast.show({
            icon: 'fail',
            content: '已按创建时间加载任务（排序已降级）',
          })
        } catch (err3: unknown) {
          console.error('load project tasks failed (fallback sort)', err3)
          Toast.show({
            icon: 'fail',
            content: getPocketBaseErrorMessage(err3, '加载任务失败'),
          })
        }
      }
    }
  }


  // ---- Profile 编辑 ----
  const handleProfileSave = async () => {
    if (!authUser) return
    setProfileSaving(true)
    try {
      const formData = new FormData()
      formData.append('name', editName)
      if (selectedAvatar && selectedAvatar.startsWith('http')) {
        const response = await fetch(selectedAvatar)
        if (!response.ok) throw new Error('头像下载失败')
        const blob = await response.blob()
        formData.append('avatar', blob, 'avatar.svg')
      }
      await pb.collection('users').update(authUser.id, formData)
      await pb.collection('users').authRefresh()
      Toast.show({ icon: 'success', content: '保存成功' })
      setIsEditingProfile(false)
      setShowAvatarPicker(false)
      setSelectedAvatar(null)
      refreshAll()
    } catch (error: unknown) {
      Toast.show({ icon: 'fail', content: getPocketBaseErrorMessage(error, '保存失败') })
    } finally {
      setProfileSaving(false)
    }
  }

  const handleProfileFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !authUser) return
    setProfileSaving(true)
    try {
      const formData = new FormData()
      formData.append('avatar', file)
      await pb.collection('users').update(authUser.id, formData)
      await pb.collection('users').authRefresh()
      Toast.show({ icon: 'success', content: '头像已更新' })
      setShowAvatarPicker(false)
      refreshAll()
    } catch (error: unknown) {
      Toast.show({ icon: 'fail', content: getPocketBaseErrorMessage(error, '上传失败') })
    } finally {
      setProfileSaving(false)
    }
  }

  const currentAvatarUrl = authUser?.avatar ? pb.files.getUrl(authUser, authUser.avatar) : ''

  const handleDeleteTask = async (taskId: string) => {
    Dialog.confirm({
      title: '确认删除',
      content: '确定要删除这个任务吗？此操作不可撤销。',
      confirmText: '删除',
      cancelText: '取消',
      onConfirm: async () => {
        try {
          await pb.collection('tasks').delete(taskId)
          setProjectTasks((prev) => prev.filter((t) => t.id !== taskId))
          Toast.show({ icon: 'success', content: '已删除' })
          if (selectedProject) await handleSelectProject(selectedProject)
          refreshAll()
        } catch (error: unknown) {
          Toast.show({ icon: 'fail', content: getPocketBaseErrorMessage(error, '删除失败') })
          if (selectedProject) await handleSelectProject(selectedProject)
        }
      }
    })
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60dvh', gap: 16 }}>
            <SpinLoading style={{ '--size': '36px' }} />
            <span style={{ color: '#94a3b8', fontSize: 14 }}>加载中...</span>
          </div>
        ) : loadError ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60dvh', gap: 16, padding: 20 }}>
            <IoWarningOutline style={{ fontSize: 48, color: '#ef4444' }} />
            <span style={{ color: '#334155', fontSize: 16, fontWeight: 600 }}>{loadError}</span>
            <Button color="primary" size="small" shape="rounded" onClick={refreshAll}>重试</Button>
          </div>
        ) : (<>
        {activeKey === 'dashboard' && (
          <div className="page" style={{ padding: '24px 20px' }}>
            {/* Modern Header */}
            <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1.5, marginBottom: 4 }}>系统概览</div>
                <h2 style={{ fontSize: 28, fontWeight: 800, margin: 0, background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  管理控制台
                </h2>
              </div>
              <Button
                size="small"
                shape="rounded"
                fill='outline'
                style={{ borderColor: '#cbd5e1', color: '#64748b', fontSize: 12 }}
                onClick={async () => {
                  await logoutWithDeviceCleanup()
                  navigate('/login', { replace: true })
                }}
              >
                退出登录
              </Button>
            </div>


            {/* KPI Grid */}
            <Grid columns={2} gap={16} style={{ marginBottom: 32 }}>
              <Grid.Item>
                <div className="fade-in" onClick={() => setActiveKey('projects')} style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  borderRadius: 20, padding: 20, color: 'white',
                  boxShadow: '0 8px 16px -4px rgba(59, 130, 246, 0.3)',
                  cursor: 'pointer'
                }}>
                  <div style={{ fontSize: 11, opacity: 0.8, letterSpacing: 1, marginBottom: 8 }}>项目总数</div>
                  <div style={{ fontSize: 32, fontWeight: 700 }}>{totalProjects}</div>
                  <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>活跃项目</div>
                </div>
              </Grid.Item>
              <Grid.Item>
                <div className="fade-in" onClick={() => navigate('/my-tasks')} style={{
                  background: 'white', borderRadius: 20, padding: 20,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9',
                  animationDelay: '0.1s', cursor: 'pointer'
                }}>
                  <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>进行中任务</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: '#0f172a' }}>{inProgressTasks}</div>
                  <div style={{ fontSize: 11, color: '#10b981', marginTop: 4, fontWeight: 600 }}>处理中</div>
                </div>
              </Grid.Item>
              <Grid.Item>
                <div className="fade-in" onClick={() => setActiveKey('users')} style={{
                  background: 'white', borderRadius: 20, padding: 20,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9',
                  animationDelay: '0.2s', cursor: 'pointer'
                }}>
                  <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 8 }}>本月新用户</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: '#0f172a' }}>{newUsersThisMonth}</div>
                  <div style={{ fontSize: 11, color: '#3b82f6', marginTop: 4, fontWeight: 600 }}>本月新增</div>
                </div>
              </Grid.Item>
              <Grid.Item>
                <div className="fade-in" onClick={() => navigate('/my-tasks')} style={{
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  borderRadius: 20, padding: 20, color: 'white',
                  boxShadow: '0 8px 16px -4px rgba(239, 68, 68, 0.3)',
                  animationDelay: '0.3s', cursor: 'pointer'
                }}>
                  <div style={{ fontSize: 11, opacity: 0.8, letterSpacing: 1, marginBottom: 8 }}>逾期率</div>
                  <div style={{ fontSize: 32, fontWeight: 700 }}>{overdueRate}%</div>
                  <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>需要关注</div>
                </div>
              </Grid.Item>
            </Grid>

            {/* Charts Section */}
            {/* 双列图表布局 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 24 }}>
              {/* 任务状态分布 */}
              <div className="fade-in" onClick={() => navigate('/my-tasks')} style={{ animationDelay: '0.4s', background: 'white', borderRadius: 20, padding: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.02)', cursor: 'pointer' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 3, height: 14, background: '#3b82f6', borderRadius: 2 }}></div>
                  任务状态
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={taskStatusData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={3} dataKey="value">
                      {taskStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {taskStatusData.map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#64748b' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: d.color }}></div>
                      {d.name} ({d.value})
                    </div>
                  ))}
                </div>
              </div>

              {/* 项目进度 */}
              <div className="fade-in" onClick={() => setActiveKey('projects')} style={{ animationDelay: '0.5s', background: 'white', borderRadius: 20, padding: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.02)', cursor: 'pointer' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 3, height: 14, background: '#10b981', borderRadius: 2 }}></div>
                  项目进度
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {projectProgressData.map((p, i) => (
                    <div key={i}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: '#475569', fontWeight: 500 }}>{p.name}</span>
                        <span style={{ fontSize: 11, color: p.blocked > 0 ? '#EF4444' : '#10B981', fontWeight: 600 }}>
                          {p.blocked > 0 ? `${p.blocked}卡点` : `${p.progress}%`}
                        </span>
                      </div>
                      <div style={{ height: 6, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ 
                          width: `${p.progress}%`, 
                          height: '100%', 
                          background: p.blocked > 0 ? '#F59E0B' : 'linear-gradient(90deg, #10B981 0%, #059669 100%)',
                          borderRadius: 3,
                          transition: 'width 0.5s ease'
                        }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 人员工作负载 */}
            <div className="fade-in" onClick={() => setActiveKey('users')} style={{ animationDelay: '0.6s', marginBottom: 24, background: 'white', borderRadius: 20, padding: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.02)', cursor: 'pointer' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 3, height: 14, background: '#8B5CF6', borderRadius: 2 }}></div>
                人员工作负载
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={workloadData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 11 }} width={60} />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }} 
                    contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }} 
                    formatter={(value: any, name: string) => [value, name === 'total' ? '总任务' : name === 'blocked' ? '卡点' : '逾期']}
                  />
                  <Bar dataKey="total" fill="#8B5CF6" radius={[0, 4, 4, 0]} barSize={16} name="总任务" />
                  <Bar dataKey="blocked" fill="#F59E0B" radius={[0, 4, 4, 0]} barSize={16} name="卡点" />
                  <Bar dataKey="overdue" fill="#EF4444" radius={[0, 4, 4, 0]} barSize={16} name="逾期" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 部门分布 */}
            <div className="fade-in" style={{ animationDelay: '0.7s', marginBottom: 24, background: 'white', borderRadius: 20, padding: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 3, height: 14, background: '#06B6D4', borderRadius: 2 }}></div>
                部门人员分布
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {departmentStats.map((d, i) => (
                  <div key={i} style={{
                    flex: '1 1 calc(50% - 5px)',
                    minWidth: 120,
                    padding: '12px 14px',
                    background: ['#EFF6FF', '#ECFDF5', '#FEF3C7', '#F1F5F9'][i % 4],
                    borderRadius: 12,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>{d.name}</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: ['#2563EB', '#059669', '#D97706', '#64748B'][i % 4] }}>{d.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 卡点/逾期预警 */}
            {blockedRanking.length > 0 && (
              <div className="fade-in" style={{ 
                animationDelay: '0.7s', 
                marginBottom: 24, 
                background: 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)', 
                borderRadius: 20, 
                padding: 20,
                border: '1px solid #FECACA'
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#991B1B', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IoWarningOutline size={18} />
                  卡点/逾期预警
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {blockedRanking.map((item, i) => (
                    <div key={i} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 12,
                      padding: '10px 12px',
                      background: 'white',
                      borderRadius: 12,
                      border: '1px solid #FECACA'
                    }}>
                      <div style={{ 
                        width: 32, 
                        height: 32, 
                        borderRadius: 8, 
                        background: i === 0 ? '#EF4444' : i === 1 ? '#F59E0B' : '#94A3B8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: 14
                      }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: '#1E293B', fontSize: 13 }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                          {item.tasks.slice(0, 2).join('、')}{item.tasks.length > 2 ? '等' : ''}
                        </div>
                      </div>
                      <div style={{ 
                        background: '#EF4444', 
                        color: 'white', 
                        padding: '4px 10px', 
                        borderRadius: 20, 
                        fontSize: 11, 
                        fontWeight: 700 
                      }}>
                        {item.count} 项
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 快速操作区 */}
            <div className="fade-in" style={{ animationDelay: '0.6s', marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 4, height: 16, background: '#f59e0b', borderRadius: 2 }}></div>
                快速操作
              </div>
              <Grid columns={4} gap={12}>
                <Grid.Item>
                  <div 
                    onClick={() => setActiveKey('users')}
                    style={{ 
                      background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)', 
                      borderRadius: 16, 
                      padding: 16, 
                      textAlign: 'center', 
                      cursor: 'pointer',
                      transition: 'transform 0.2s',
                      boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)'
                    }}
                  >
                    <IoPeopleOutline size={24} color="white" />
                    <div style={{ color: 'white', fontSize: 11, marginTop: 6, fontWeight: 600 }}>添加成员</div>
                  </div>
                </Grid.Item>
                <Grid.Item>
                  <div 
                    onClick={() => setActiveKey('projects')}
                    style={{ 
                      background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', 
                      borderRadius: 16, 
                      padding: 16, 
                      textAlign: 'center', 
                      cursor: 'pointer',
                      transition: 'transform 0.2s',
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                    }}
                  >
                    <IoBriefcaseOutline size={24} color="white" />
                    <div style={{ color: 'white', fontSize: 11, marginTop: 6, fontWeight: 600 }}>管理项目</div>
                  </div>
                </Grid.Item>
                <Grid.Item>
                  <div 
                    onClick={() => navigate('/review-center')}
                    style={{ 
                      background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)', 
                      borderRadius: 16, 
                      padding: 16, 
                      textAlign: 'center', 
                      cursor: 'pointer',
                      transition: 'transform 0.2s',
                      boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
                      position: 'relative'
                    }}
                  >
                    {unreadAuditCount > 0 && (
                      <div style={{
                        position: 'absolute', top: -4, right: -4,
                        background: '#EF4444', color: 'white',
                        borderRadius: '50%', width: 18, height: 18,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 'bold'
                      }}>
                        {unreadAuditCount}
                      </div>
                    )}
                    <IoCheckmarkCircleOutline size={24} color="white" />
                    <div style={{ color: 'white', fontSize: 11, marginTop: 6, fontWeight: 600 }}>任务审核</div>
                  </div>
                </Grid.Item>
                <Grid.Item>
                  <div 
                    onClick={() => setActiveKey('ai')}
                    style={{ 
                      background: 'linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)', 
                      borderRadius: 16, 
                      padding: 16, 
                      textAlign: 'center', 
                      cursor: 'pointer',
                      transition: 'transform 0.2s',
                      boxShadow: '0 4px 12px rgba(14, 165, 233, 0.3)'
                    }}
                  >
                    <IoSparkles size={24} color="white" />
                    <div style={{ color: 'white', fontSize: 11, marginTop: 6, fontWeight: 600 }}>AI分析</div>
                  </div>
                </Grid.Item>
              </Grid>
            </div>

            {/* 待处理事项 */}
            {unreadAuditCount > 0 && (
              <div className="fade-in" style={{ 
                animationDelay: '0.7s', 
                marginBottom: 24, 
                background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)', 
                borderRadius: 20, 
                padding: 20,
                border: '1px solid #F59E0B'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: '#F59E0B', display: 'flex',
                    alignItems: 'center', justifyContent: 'center'
                  }}>
                    <IoTimeOutline size={24} color="white" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: '#92400E', fontSize: 15 }}>
                      有 {unreadAuditCount} 条变更待复核
                    </div>
                    <div style={{ fontSize: 12, color: '#A16207', marginTop: 2 }}>
                      请及时处理，以免影响项目进度
                    </div>
                  </div>
                  <Button 
                    size='small'
                    onClick={() => navigate('/review-center')}
                    style={{ 
                      background: '#F59E0B', 
                      color: 'white', 
                      border: 'none',
                      borderRadius: 20,
                      fontWeight: 600
                    }}
                  >
                    去处理
                  </Button>
                </div>
              </div>
            )}

            {/* 最近活动 */}
            <div className="fade-in" style={{ animationDelay: '0.8s', background: 'white', borderRadius: 24, padding: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 4, height: 16, background: '#6366F1', borderRadius: 2 }}></div>
                最近项目动态
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {projects.slice(0, 4).map((project, index) => (
                  <div 
                    key={project.id}
                    onClick={() => navigate(`/project/${project.id}/timeline`)}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 12, 
                      padding: 12,
                      background: '#F8FAFC',
                      borderRadius: 12,
                      cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6'][index % 4],
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'white', fontWeight: 700, fontSize: 14
                    }}>
                      {project.name?.charAt(0) || 'P'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#1E293B', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {project.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#94A3B8' }}>
                        {project.code || '暂无编号'}
                      </div>
                    </div>
                    <Tag 
                      color={project.status === 'active' ? 'success' : project.status === 'completed' ? 'primary' : 'default'}
                      style={{ fontSize: 10, borderRadius: 6 }}
                    >
                      {project.status === 'active' ? '进行中' : project.status === 'completed' ? '已完成' : '已归档'}
                    </Tag>
                  </div>
                ))}
                {projects.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#94A3B8', padding: 20 }}>
                    暂无项目数据
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeKey === 'users' && (
          <div className="page" style={{ padding: '24px 20px' }}>
            <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1.5 }}>团队成员</div>
                <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#0f172a' }}>用户管理</h2>
              </div>
              <Button
                onClick={() => setShowAddUserModal(true)}
                style={{
                  background: '#0f172a', color: 'white', border: 'none',
                  borderRadius: '50%', width: 44, height: 44,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.3)'
                }}
              >
                <IoAddCircleOutline size={20} />
              </Button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {users.map((user, i) => (
                <div key={user.id} className="fade-in" onClick={() => handleEditUser(user)}
                  style={{
                    animationDelay: `${i * 0.05}s`,
                    background: 'white', padding: 16, borderRadius: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)', border: '1px solid #f1f5f9'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <Avatar
                      src={user.avatar ? pb.files.getUrl(user as any, user.avatar) : ''}
                      style={{ '--size': '48px', '--border-radius': '12px' }}
                    />
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b' }}>{user.name || user.username}</div>
                      <div style={{ fontSize: 13, color: '#94a3b8' }}>{user.email}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#3b82f6', background: '#eff6ff', padding: '4px 10px', borderRadius: 20, display: 'inline-block', marginBottom: 4 }}>
                      {user.role?.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{user.department}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeKey === 'projects' && (
          <div className="page" style={{ padding: '24px 20px' }}>
            <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1.5 }}>项目管控</div>
                <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#0f172a' }}>项目列表</h2>
              </div>
              <Button
                onClick={() => setShowAddProjectModal(true)}
                style={{
                  background: '#0f172a', color: 'white', border: 'none',
                  borderRadius: '50%', width: 44, height: 44,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.3)'
                }}
              >
                <IoAddCircleOutline size={20} />
              </Button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {projects.map((project, i) => (
                <div key={project.id} className="fade-in"
                  style={{
                    animationDelay: `${i * 0.05}s`,
                    background: 'white', padding: 20, borderRadius: 20,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.03)', border: '1px solid #f8fafc'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: 12,
                        background: '#eff6ff', color: '#3b82f6',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <IoFolderOutline size={24} />
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{project.name}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>ID: {project.id.slice(0, 8)}...</div>
                      </div>
                    </div>
                    <div style={{
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                      padding: '4px 8px', borderRadius: 6,
                      background: project.status === 'active' ? '#f0fdf4' : '#f1f5f9',
                      color: project.status === 'active' ? '#16a34a' : '#64748b'
                    }}>
                      {project.status}
                    </div>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, fontWeight: 600, color: '#64748b' }}>
                      <span>进度</span>
                      <span>{project.progress}%</span>
                    </div>
                    <ProgressBar
                      percent={project.progress}
                      style={{
                        '--track-width': '6px',
                        '--fill-color': 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)',
                        '--track-color': '#f1f5f9',
                        borderRadius: 4
                      } as any}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <Button size="mini" color='primary' fill='solid' style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6 }} onClick={() => handleSelectProject(project)}>
                      查看任务
                    </Button>
                    <Button size="mini" fill='none' style={{ color: '#64748b', fontSize: 11, padding: '4px 8px' }} onClick={() => handleProjectStatusChange(project, 'active')}>
                      进行中
                    </Button>
                    <Button size="mini" fill='none' style={{ color: '#64748b', fontSize: 11, padding: '4px 8px' }} onClick={() => handleProjectStatusChange(project, 'completed')}>
                      完成
                    </Button>
                    <Button size="mini" fill='none' style={{ color: '#ef4444', fontSize: 11, padding: '4px 8px' }} onClick={() => handleProjectStatusChange(project, 'archived')}>
                      归档
                    </Button>
                  </div>

                  {/* Task List Panel - shows when this project is selected */}
                  {selectedProject?.id === project.id && (
                    <div style={{ marginTop: 16, padding: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>任务列表 ({projectTasks.length})</div>
                        <Button size="mini" color='primary' onClick={() => setShowAddTaskModal(true)} style={{ fontSize: 11 }}>
                          + 新增任务
                        </Button>
                      </div>

                      {projectTasks.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 13 }}>
                          暂无任务，点击"新增任务"开始
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {projectTasks.map(task => (
                            <div key={task.id} style={{
                              background: 'white', padding: 12, borderRadius: 8,
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              border: '1px solid #e2e8f0'
                            }}>
                              <div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{task.stage_name}</div>
                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                  {task.status === 'completed'
                                    ? '已完成'
                                    : (task.status === 'in_progress' || task.status === 'processing')
                                      ? '进行中'
                                      : task.status === 'overdue'
                                        ? '逾期'
                                        : '待处理'}
                                  {task.expand?.assignees?.[0] && ` · ${(task.expand.assignees as any)[0].name || (task.expand.assignees as any)[0].username}`}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <Button size="mini" fill='none' style={{ color: '#3b82f6', fontSize: 11 }} onClick={() => navigate(`/task/${task.id}`)}>
                                  编辑
                                </Button>
                                <Button size="mini" fill='none' style={{ color: '#ef4444', fontSize: 11 }} onClick={() => handleDeleteTask(task.id)}>
                                  删除
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeKey === 'ai' && <AIConsole />}

        {/* Timeline View */}
        {activeKey === 'timeline' && (
          <div className="page" style={{ padding: '24px 20px' }}>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: 1.5 }}>进度管理</div>
              <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#0f172a' }}>项目时间轴</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {projects.filter(p => p.status === 'active').map((project, i) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  onClick={() => navigate(`/project/${project.id}/timeline`)}
                  style={{
                    background: 'white',
                    borderRadius: 20,
                    padding: 20,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                    border: '1px solid #f1f5f9',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: 12,
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <IoCalendarOutline size={24} color="white" />
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{project.name}</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                          {tasks.filter(t => t.project === project.id).length} 个任务
                        </div>
                      </div>
                    </div>
                    <IoChevronForwardOutline size={20} color="#94a3b8" />
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, fontWeight: 600, color: '#64748b' }}>
                      <span>完成进度</span>
                      <span>{project.progress}%</span>
                    </div>
                    <ProgressBar
                      percent={project.progress}
                      style={{
                        '--track-width': '8px',
                        '--fill-color': 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)',
                        '--track-color': '#f1f5f9',
                        borderRadius: 4
                      } as any}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 11, padding: '4px 10px', background: '#ecfdf5', color: '#059669', borderRadius: 6, fontWeight: 600 }}>
                      ✓ {tasks.filter(t => t.project === project.id && t.status === 'completed').length} 完成
                    </span>
                    <span style={{ fontSize: 11, padding: '4px 10px', background: '#eff6ff', color: '#2563eb', borderRadius: 6, fontWeight: 600 }}>
                      ● {tasks.filter(t => t.project === project.id && (t.status === 'in_progress' || t.status === 'processing')).length} 进行中
                    </span>
                    <span style={{ fontSize: 11, padding: '4px 10px', background: '#fef2f2', color: '#dc2626', borderRadius: 6, fontWeight: 600 }}>
                      ! {tasks.filter(t => t.project === project.id && t.status === 'overdue').length} 逾期
                    </span>
                  </div>
                </motion.div>
              ))}

              {projects.filter(p => p.status === 'active').length === 0 && (
                <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                  <IoTimeOutline size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
                  <div>暂无进行中的项目</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Profile View */}
        {activeKey === 'profile' && (
          <div className="page" style={{ padding: '24px 20px' }}>
            {/* Edit Toggle */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              {!isEditingProfile ? (
                <Button size="small" fill="none" style={{ color: '#3b82f6', fontWeight: 600 }} onClick={() => { setIsEditingProfile(true); setEditName(authUser?.name || '') }}>编辑资料</Button>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="small" fill="none" style={{ color: '#94a3b8' }} onClick={() => { setIsEditingProfile(false); setSelectedAvatar(null); setEditName(authUser?.name || '') }}>取消</Button>
                  <Button size="small" color="primary" loading={profileSaving} style={{ borderRadius: 8 }} onClick={handleProfileSave}>保存</Button>
                </div>
              )}
            </div>
            {/* Profile Header */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                borderRadius: 24,
                padding: 28,
                marginBottom: 24,
                color: 'white'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <div style={{ position: 'relative' }}>
                  <Avatar
                    src={selectedAvatar || currentAvatarUrl}
                    style={{ '--size': '72px', '--border-radius': '20px', background: '#334155' }}
                  />
                  {isEditingProfile && (
                    <div onClick={() => setShowAvatarPicker(true)} style={{
                      position: 'absolute', bottom: -4, right: -4,
                      width: 28, height: 28, borderRadius: '50%',
                      background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', border: '2px solid #0f172a'
                    }}>
                      <IoCameraOutline size={14} color="white" />
                    </div>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  {isEditingProfile ? (
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="输入姓名"
                      style={{
                        fontSize: 20, fontWeight: 800, color: 'white', background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '6px 12px',
                        width: '100%', outline: 'none'
                      }}
                    />
                  ) : (
                    <div style={{ fontSize: 22, fontWeight: 800 }}>{authUser?.name || '管理员'}</div>
                  )}
                  <div style={{ fontSize: 14, color: '#94a3b8', marginTop: 4 }}>{authUser?.email}</div>
                  <div style={{
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    background: 'rgba(59, 130, 246, 0.3)', padding: '4px 10px',
                    borderRadius: 6, marginTop: 8, display: 'inline-block'
                  }}>
                    {authUser?.role?.toUpperCase() || 'MANAGER'}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{projects.length}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>管理项目</div>
                </div>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{users.length}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>团队成员</div>
                </div>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{activeTasks.filter(t => t.status === 'completed').length}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>完成任务</div>
                </div>
              </div>
            </motion.div>

            {/* Quick Actions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              style={{
                background: 'white',
                borderRadius: 20,
                padding: 8,
                marginBottom: 24,
                boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
              }}
            >
              <div
                onClick={() => navigate('/notifications')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: 16, cursor: 'pointer', borderRadius: 12
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <IoNotificationsOutline size={20} color="#dc2626" />
                  </div>
                  <span style={{ fontWeight: 600, color: '#1e293b' }}>消息通知</span>
                </div>
                <IoChevronForwardOutline size={18} color="#94a3b8" />
              </div>

              <div
                onClick={() => setActiveKey('users' as any)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: 16, cursor: 'pointer', borderRadius: 12
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <IoPeopleOutline size={20} color="#2563eb" />
                  </div>
                  <span style={{ fontWeight: 600, color: '#1e293b' }}>用户管理</span>
                </div>
                <IoChevronForwardOutline size={18} color="#94a3b8" />
              </div>

              <div
                onClick={() => navigate('/review-center')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: 16, cursor: 'pointer', borderRadius: 12
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <IoCheckmarkCircleOutline size={20} color="#16a34a" />
                  </div>
                  <span style={{ fontWeight: 600, color: '#1e293b' }}>审核中心</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {unreadAuditCount > 0 && (
                    <span style={{ background: '#ef4444', color: 'white', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                      {unreadAuditCount}
                    </span>
                  )}
                  <IoChevronForwardOutline size={18} color="#94a3b8" />
                </div>
              </div>

              <div
                onClick={() => navigate('/settings')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: 16, cursor: 'pointer', borderRadius: 12
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <IoSettingsOutline size={20} color="#64748b" />
                  </div>
                  <span style={{ fontWeight: 600, color: '#1e293b' }}>系统设置</span>
                </div>
                <IoChevronForwardOutline size={18} color="#94a3b8" />
              </div>

              <div
                onClick={() => navigate('/admin/import')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: 16, cursor: 'pointer', borderRadius: 12
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <IoCloudUploadOutline size={20} color="#3b82f6" />
                  </div>
                  <span style={{ fontWeight: 600, color: '#1e293b' }}>数据导入</span>
                </div>
                <IoChevronForwardOutline size={18} color="#94a3b8" />
              </div>
            </motion.div>

            {/* Logout */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Button
                block
                onClick={async () => {
                  await logoutWithDeviceCleanup()
                  navigate('/login', { replace: true })
                }}
                style={{
                  background: '#fef2f2',
                  color: '#dc2626',
                  border: 'none',
                  borderRadius: 16,
                  height: 52,
                  fontWeight: 600,
                  fontSize: 15
                }}
              >
                <IoLogOutOutline size={20} style={{ marginRight: 8 }} />
                退出登录
              </Button>
            </motion.div>
          </div>
        )}
        </>)}
      </div>

      <TabBar
        activeKey={activeKey}
        onChange={key => setActiveKey(key as any)}
        style={{
          background: 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(10px)',
          borderTop: '1px solid rgba(0,0,0,0.05)',
          paddingBottom: 'env(safe-area-inset-bottom)'
        }}
      >
        {tabs.map(item => (
          <TabBar.Item key={item.key} icon={item.icon} title={item.title} />
        ))}
      </TabBar>
      <Dialog
        visible={showUserModal}
        title="编辑用户"
        content={
          <Form form={userForm} layout='horizontal' onFinish={handleUserUpdate} footer={null}>
            <Form.Item name='name' label='姓名' rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name='email' label='邮箱' rules={[{ required: true }, { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '邮箱格式不正确' }]}><Input /></Form.Item>
            <Form.Item name='department' label='部门'>
              <Selector options={[{ label: '工程部', value: '工程部' }, { label: '审计部', value: '审计部' }, { label: '财务部', value: '财务部' }, { label: '管理层', value: '管理层' }]} />
            </Form.Item>
            <Form.Item name='role' label='角色'>
              <Selector options={[{ label: '普通员工', value: 'employee' }, { label: '项目经理', value: 'manager' }, { label: '管理员', value: 'admin' }]} />
            </Form.Item>
          </Form>
        }
        actions={[
          { key: 'cancel', text: '取消', onClick: () => setShowUserModal(false) },
          { key: 'confirm', text: '保存', bold: true, onClick: () => userForm.submit() },
        ]}
      />

      <Dialog
        visible={showAddUserModal}
        title="新增用户"
        content={
          <Form form={addUserForm} layout='horizontal' onFinish={handleAddUser} footer={null}>
            <Form.Item name='username' label='用户名' rules={[{ required: true, message: '请输入登录用户名' }, { pattern: /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/, message: '2-20位，支持中英文、数字、下划线' }]}><Input placeholder='登录时使用的用户名' /></Form.Item>
            <Form.Item name='name' label='姓名' rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name='email' label='邮箱' rules={[{ required: true }, { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '邮箱格式不正确' }]}><Input /></Form.Item>
            <Form.Item name='password' label='密码' rules={[{ required: true, min: 8, message: '密码至少8位' }]}><Input type='password' /></Form.Item>
            <Form.Item name='department' label='部门' initialValue={['工程部']}>
              <Selector options={[{ label: '工程部', value: '工程部' }, { label: '审计部', value: '审计部' }, { label: '财务部', value: '财务部' }, { label: '管理层', value: '管理层' }]} />
            </Form.Item>
            <Form.Item name='role' label='角色' initialValue={['employee']}>
              <Selector options={[{ label: '普通员工', value: 'employee' }, { label: '项目经理', value: 'manager' }, { label: '管理员', value: 'admin' }]} />
            </Form.Item>
          </Form>
        }
        actions={[
          { key: 'cancel', text: '取消', onClick: () => setShowAddUserModal(false) },
          { key: 'confirm', text: '创建', bold: true, onClick: () => addUserForm.submit() },
        ]}
      />

      <BatchProjectCreator 
        visible={showAddProjectModal} 
        onClose={() => setShowAddProjectModal(false)}
        onSuccess={() => refreshAll()}
      />

      {/* Batch Task Editor */}
      {selectedProject && (
        <BatchTaskEditor
          visible={showAddTaskModal}
          onClose={async () => {
            setShowAddTaskModal(false)
            if (selectedProject) await handleSelectProject(selectedProject)
            refreshAll()
          }}
          projectId={selectedProject.id}
          projectMembers={[]}
          allUsers={users.map(u => ({ id: u.id, name: u.name, username: u.username, department: u.department }))}
          existingTasks={projectTasks.map(t => ({
            id: t.id,
            stage_name: t.stage_name,
            assignees: t.assignees || [],
            start_date: (t as any).start_date || '',
            deadline: (t as any).deadline || ''
          }))}
        />
      )}

      {/* Avatar Picker Popup */}
      <Popup
        visible={showAvatarPicker}
        onMaskClick={() => setShowAvatarPicker(false)}
        bodyStyle={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70dvh', overflow: 'auto' }}
      >
        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>选择头像</div>
            <IoClose size={24} color="#94a3b8" style={{ cursor: 'pointer' }} onClick={() => setShowAvatarPicker(false)} />
          </div>

          {/* 上传自定义头像 */}
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: 16, background: '#f8fafc', borderRadius: 12, border: '2px dashed #cbd5e1',
              textAlign: 'center', cursor: 'pointer', marginBottom: 20
            }}
          >
            <IoCameraOutline size={24} color="#64748b" />
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>上传自定义头像</div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleProfileFileUpload} />

          {/* 风格切换 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
            {AVATAR_STYLE_GROUPS.map((group, idx) => (
              <div
                key={group.label}
                onClick={() => setAvatarStyleIdx(idx)}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                  background: avatarStyleIdx === idx ? '#0f172a' : '#f1f5f9',
                  color: avatarStyleIdx === idx ? 'white' : '#64748b', cursor: 'pointer'
                }}
              >
                {group.label}
              </div>
            ))}
          </div>

          {/* 头像网格 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {AVATAR_STYLE_GROUPS[avatarStyleIdx]?.avatars.map((url, i) => (
              <div
                key={i}
                onClick={() => setSelectedAvatar(url)}
                style={{
                  borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
                  border: selectedAvatar === url ? '3px solid #3b82f6' : '3px solid transparent',
                  transition: 'border 0.2s'
                }}
              >
                <img src={url} alt="" style={{ width: '100%', height: 'auto', display: 'block', background: '#f1f5f9' }} />
              </div>
            ))}
          </div>

          <Button
            block
            color="primary"
            style={{ marginTop: 20, borderRadius: 12, height: 48, fontWeight: 600 }}
            onClick={() => setShowAvatarPicker(false)}
          >
            确定选择
          </Button>
        </div>
      </Popup>
    </div>
  )
}

export default AdminDashboard
