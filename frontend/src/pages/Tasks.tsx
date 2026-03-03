import { useEffect, useState, useMemo } from 'react'
import { ProgressBar, Tag, Popup, Badge } from 'antd-mobile'
import { pb } from '../lib/pocketbase'
import { IoTimeOutline, IoCheckmarkCircleOutline, IoBriefcaseOutline, IoAddCircle, IoCloseCircle, IoNotificationsOutline, IoChevronForward } from 'react-icons/io5'
import { useNavigate } from 'react-router-dom'
import { SkeletonCard } from '../components/Skeleton'
import { motion } from 'framer-motion'
import { useTasks, useProjects, useNotifications, useUsers, isManager, type Task, type User } from '../lib/api'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryClient'
import BatchProjectCreator from '../components/BatchProjectCreator'

interface Project {
  id: string
  name: string
  code: string
  status: 'active' | 'completed' | 'archived'
  progress?: number
  updated?: string
  deadline?: string
}

// 项目卡片组件
const ProjectCard = ({ 
  project, 
  index, 
  onNotifClick, 
  navigate, 
  getStatusConfig, 
  getNotificationCount 
}: { 
  project: Project
  index: number
  onNotifClick: (p: Project) => void
  navigate: any
  getStatusConfig: any
  getNotificationCount: any
}) => {
  const config = getStatusConfig(project.status, project.progress || 0)
  const notifCount = getNotificationCount(project.id)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="project-card"
      style={{
        cursor: 'pointer',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 160
      }}
      onClick={() => navigate(`/project/${project.id}/timeline`)}
    >
      {/* 红点提醒 - 可点击 */}
      {notifCount > 0 && (
        <div 
          onClick={(e) => {
            e.stopPropagation()
            onNotifClick(project)
          }}
          style={{
            position: 'absolute', 
            top: -8, 
            right: -8,
            background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)', 
            color: 'white',
            borderRadius: '50%', 
            width: 24, 
            height: 24,
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            fontSize: 11, 
            fontWeight: 'bold',
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
            zIndex: 10,
            cursor: 'pointer',
            transition: 'transform 0.2s'
          }}
        >
          {notifCount}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ flex: 1, marginRight: 12 }}>
          <h3 style={{
            margin: '0 0 6px 0',
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--neutral-800)',
            wordBreak: 'break-word',
            lineHeight: '1.4'
          }}>
            {project.name}
          </h3>
          <div style={{ fontSize: 12, color: 'var(--neutral-500)', fontFamily: 'monospace' }}>
            {project.code}
          </div>
        </div>
        <Tag
          color={config.color}
          fill='outline'
          style={{ 
            borderRadius: 8, 
            padding: '4px 10px', 
            fontSize: 11, 
            fontWeight: 600, 
            border: 'none', 
            background: config.color === 'primary' ? '#EFF6FF' : config.color === 'success' ? '#ECFDF5' : '#F1F5F9',
            color: config.color === 'primary' ? '#2563EB' : config.color === 'success' ? '#059669' : '#64748B',
            whiteSpace: 'nowrap' 
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {config.icon} {config.text}
          </span>
        </Tag>
      </div>

      {/* 进度部分 */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12, fontWeight: 600, color: 'var(--neutral-500)' }}>
          <span>当前进度</span>
          <span style={{ color: '#2563EB' }}>{project.progress || 0}%</span>
        </div>
        <ProgressBar
          percent={project.progress || 0}
          style={{
            '--track-width': '8px',
            '--fill-color': 'linear-gradient(90deg, #3B82F6 0%, #2563EB 100%)',
            '--track-color': '#F1F5F9',
            borderRadius: 4
          } as any}
        />
      </div>
    </motion.div>
  )
}

export default function Tasks() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showAddProject, setShowAddProject] = useState(false)
  const [isPC, setIsPC] = useState(window.innerWidth > 768)
  const [showNotifications, setShowNotifications] = useState(false)
  const [selectedProjectNotif, setSelectedProjectNotif] = useState<Project | null>(null)

  // react-query hooks — SSE 自动刷新
  const { data: projectsRaw = [], isLoading: loading } = useProjects()
  const userId = pb.authStore.model?.id
  const { data: allNotifs = [] } = useNotifications(userId || '')
  const unreadNotifs = useMemo(() => allNotifs.filter((n: any) => !n.is_read).slice(0, 5), [allNotifs])

  const projects = useMemo(() => projectsRaw
    .filter((p: any) => p.status !== 'archived')
    .map((p: any) => ({
      ...p,
      progress: p.progress !== undefined ? p.progress : 0
    })), [projectsRaw])

  // 获取员工的任务
  const { data: myTasks = [] } = useTasks()
  const isManagerUser = isManager()
  useUsers()

  // 员工待办任务（未完成的）
  const activeTasks = useMemo(() => {
    const userId = pb.authStore.model?.id
    if (!userId) return []
    return myTasks
      .filter((t: Task) => t.status !== 'completed' && (t.assignees?.includes(userId) || t.expand?.assignees?.some((u: User) => u.id === userId)))
      .sort((a: Task, b: Task) => {
        if (a.status === 'blocked') return -1
        if (b.status === 'blocked') return 1
        if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
        return 0
      })
      .slice(0, 8)
  }, [myTasks])

  useEffect(() => {
    const handleResize = () => setIsPC(window.innerWidth > 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const getStatusConfig = (status: string, progress: number) => {
    if (status === 'archived') return { color: 'default', text: '已归档', icon: <IoBriefcaseOutline /> }
    if (status === 'completed') return { color: 'success', text: '已完成', icon: <IoCheckmarkCircleOutline /> }
    if (progress >= 100) return { color: 'success', text: '已完成', icon: <IoCheckmarkCircleOutline /> }
    return { color: 'primary', text: '进行中', icon: <IoTimeOutline /> }
  }

  // 通知计数（按项目，从 react-query 数据派生）
  const projectNotifCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    // 通过已加载的任务数据建立 taskId → projectId 映射
    const taskProjectMap: Record<string, string> = {}
    myTasks.forEach((t: any) => { if (t.project) taskProjectMap[t.id] = t.project })

    for (const n of allNotifs) {
      if (n.is_read) continue
      let projectId: string | undefined
      if (n.link_type === 'project') {
        projectId = n.link_id
      } else if (n.link_type === 'task' && n.link_id) {
        projectId = taskProjectMap[n.link_id]
      }
      if (projectId) {
        counts[projectId] = (counts[projectId] || 0) + 1
      }
    }
    return counts
  }, [allNotifs, myTasks])

  const getNotificationCount = (pid: string) => projectNotifCounts[pid] || 0

  const getTaskStatusTag = (status: string) => {
    if (status === 'blocked') return <Tag color="danger" style={{ fontSize: 10, borderRadius: 6 }}>卡点</Tag>
    if (status === 'in_progress') return <Tag color="primary" style={{ fontSize: 10, borderRadius: 6 }}>进行中</Tag>
    if (status === 'pending') return <Tag color="default" style={{ fontSize: 10, borderRadius: 6 }}>待开始</Tag>
    return <Tag style={{ fontSize: 10, borderRadius: 6 }}>{status}</Tag>
  }


  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ padding: '24px 20px 0 20px', marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>工作进展</h1>
        <div className="page-subtitle">项目与进度</div>
      </div>

      {/* 未读消息摘要 */}
      {unreadNotifs.length > 0 && (
        <div style={{ padding: '0 20px', marginBottom: 16 }}>
          <div onClick={() => navigate('/notifications')} style={{
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            borderRadius: 14, padding: '12px 16px', cursor: 'pointer',
            border: '1px solid #bfdbfe'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 14, color: '#1e40af' }}>
                <IoNotificationsOutline size={16} />
                <span>未读消息</span>
                <Badge content={unreadNotifs.length} style={{ '--color': '#dc2626', fontSize: 10 }} />
              </div>
              <span style={{ fontSize: 12, color: '#3b82f6' }}>查看全部 <IoChevronForward size={12} /></span>
            </div>
            {unreadNotifs.slice(0, 3).map((n: any) => (
              <div key={n.id} style={{ fontSize: 12, color: '#475569', padding: '3px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                • {n.title || n.content}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 员工：我的待办任务 */}
      {!isManagerUser && activeTasks.length > 0 && (
        <div style={{ padding: '0 20px', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 10 }}>我的待办任务</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeTasks.map((task: Task) => (
              <motion.div key={task.id}
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                onClick={() => navigate(`/task/${task.id}`)}
                style={{
                  background: 'white', borderRadius: 12, padding: '12px 14px', cursor: 'pointer',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                  borderLeft: `4px solid ${task.status === 'blocked' ? '#ef4444' : task.status === 'in_progress' ? '#3b82f6' : '#94a3b8'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.stage_name}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    {task.expand?.project?.name}{task.deadline ? ` · 截止 ${new Date(task.deadline).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}` : ''}
                  </div>
                </div>
                {getTaskStatusTag(task.status)}
              </motion.div>
            ))}
            {myTasks.filter((t: Task) => t.status !== 'completed' && (t.assignees?.includes(pb.authStore.model?.id || '') || t.expand?.assignees?.some((u: User) => u.id === pb.authStore.model?.id))).length > 8 && (
              <div
                onClick={() => navigate('/my-tasks')}
                style={{ textAlign: 'center', padding: '10px 0', fontSize: 13, color: '#3b82f6', cursor: 'pointer', fontWeight: 500 }}
              >
                查看全部待办 →
              </div>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div style={{ padding: '0 20px' }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <SkeletonCard />
            </div>
          ))}
        </div>
      )}

      {!loading && projects.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--neutral-400)', marginTop: 60 }}>
          <IoBriefcaseOutline size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
          <div>暂无参与的项目</div>
        </div>
      )}

      <div style={{
        padding: '0 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }}>
        {/* PC端使用Grid布局 */}
        {isPC ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 20
          }}>
            {projects.map((project, index) => (
              <ProjectCard 
                key={project.id} 
                project={project} 
                index={index}
                onNotifClick={(p) => {
                  setSelectedProjectNotif(p)
                  setShowNotifications(true)
                }}
                navigate={navigate}
                getStatusConfig={getStatusConfig}
                getNotificationCount={getNotificationCount}
              />
            ))}
          </div>
        ) : (
          // 移动端使用列表布局
          projects.map((project, index) => (
            <ProjectCard 
              key={project.id} 
              project={project} 
              index={index}
              onNotifClick={(p) => {
                setSelectedProjectNotif(p)
                setShowNotifications(true)
              }}
              navigate={navigate}
              getStatusConfig={getStatusConfig}
              getNotificationCount={getNotificationCount}
            />
          ))
        )}
      </div>

      {/* 通知弹窗 - 真实数据 */}
      <Popup
        visible={showNotifications}
        onMaskClick={() => setShowNotifications(false)}
        bodyStyle={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, minHeight: 300 }}
      >
        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>
              {selectedProjectNotif?.name} - 通知
            </div>
            <IoCloseCircle size={24} color="#94A3B8" onClick={() => setShowNotifications(false)} style={{ cursor: 'pointer' }} />
          </div>
          
          {unreadNotifs.filter((n: any) => {
            if (!selectedProjectNotif) return true
            // 通过 taskProjectMap 反查通知所属项目
            if (n.link_type === 'project') return n.link_id === selectedProjectNotif.id
            if (n.link_type === 'task' && n.link_id) {
              const taskProjectMap: Record<string, string> = {}
              myTasks.forEach((t: any) => { if (t.project) taskProjectMap[t.id] = t.project })
              return taskProjectMap[n.link_id] === selectedProjectNotif.id
            }
            return false
          }).length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>暂无未读通知</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {unreadNotifs
                .filter((n: any) => {
                  if (!selectedProjectNotif) return true
                  if (n.link_type === 'project') return n.link_id === selectedProjectNotif.id
                  if (n.link_type === 'task' && n.link_id) {
                    const taskProjectMap: Record<string, string> = {}
                    myTasks.forEach((t: any) => { if (t.project) taskProjectMap[t.id] = t.project })
                    return taskProjectMap[n.link_id] === selectedProjectNotif.id
                  }
                  return false
                })
                .slice(0, 5)
                .map((n: any) => (
                  <div key={n.id} style={{ padding: 16, background: '#f8fafc', borderRadius: 12, borderLeft: '4px solid #3b82f6' }}>
                    <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4, fontSize: 14 }}>{n.title}</div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>{n.content}</div>
                  </div>
                ))}
            </div>
          )}
          
          <div 
            onClick={() => { setShowNotifications(false); navigate('/notifications') }}
            style={{ textAlign: 'center', marginTop: 20, color: '#2563EB', fontWeight: 600, cursor: 'pointer' }}
          >
            查看全部通知 →
          </div>
        </div>
      </Popup>

      {/* Floating Add Project Button - 仅经理可见 */}
      {isManagerUser && (
        <div
          onClick={() => setShowAddProject(true)}
          style={{
            position: 'fixed',
            bottom: 'calc(80px + env(safe-area-inset-bottom))',
            right: 20,
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(59, 130, 246, 0.4)',
            cursor: 'pointer',
            zIndex: 100
          }}
        >
          <IoAddCircle size={28} />
        </div>
      )}

      {/* 批量创建项目弹窗（三列式） */}
      <BatchProjectCreator 
        visible={showAddProject} 
        onClose={() => setShowAddProject(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.projects })
          queryClient.invalidateQueries({ queryKey: ['notifications'] })
        }}
      />
    </div>
  )
}
