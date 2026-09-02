import { Badge } from 'antd-mobile'
import {
  IoCheckmarkCircleOutline,
  IoFlameOutline,
  IoNotificationsOutline,
  IoPeopleOutline,
  IoShieldCheckmarkOutline,
  IoSparklesOutline,
  IoTimeOutline,
  IoWarningOutline,
} from 'react-icons/io5'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import dayjs from 'dayjs'
import Tasks from './Tasks'
import { pb } from '../lib/pocketbase'
import { useNotifications, useTasks, useUnreadNotificationCount } from '../lib/api'
import { useAppSurface } from '../lib/useAppSurface'
import { GlobalSearch } from '../components/layout/GlobalSearch'
import './Home.css'

export default function Home() {
  const navigate = useNavigate()
  const surface = useAppSurface()
  const userId = pb.authStore.model?.id || ''
  const role = pb.authStore.model?.role?.toLowerCase()
  const isManager = role === 'manager' || role === 'admin'
  const isAdmin = role === 'admin'
  const isCompact = surface === 'compact'

  const { data: unreadCount = 0 } = useUnreadNotificationCount(userId)
  const { data: myTasks = [] } = useTasks()
  const { data: notifications = [] } = useNotifications(userId)

  const activeTasks = myTasks.filter(task =>
    task.status === 'in_progress' || task.status === 'pending' || task.status === 'blocked' || task.status === 'overdue',
  )
  const currentTasks = activeTasks.slice(0, 5)
  const recentNotifications = notifications.filter(notification => !notification.is_read).slice(0, 5)

  const getDeadlineUrgency = (deadline?: string): 'overdue' | 'urgent' | 'approaching' | 'normal' | 'none' => {
    if (!deadline) return 'none'
    const diff = dayjs(deadline).diff(dayjs(), 'day')
    if (diff < 0) return 'overdue'
    if (diff <= 1) return 'urgent'
    if (diff <= 3) return 'approaching'
    return 'normal'
  }

  const overdueCount = activeTasks.filter(task => getDeadlineUrgency(task.deadline) === 'overdue').length
  const urgentCount = activeTasks.filter(task => {
    const urgency = getDeadlineUrgency(task.deadline)
    return urgency === 'urgent' || urgency === 'approaching'
  }).length
  const completedCount = myTasks.filter(task => task.status === 'completed').length

  return (
    <div style={{ minHeight: '100%', background: 'var(--page-bg)' }}>
      {isCompact && (
        <header
          className="glass-header"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            padding: '14px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: 19, color: '#0f172a' }}>工作台</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>工程结算管理</div>
          </div>
          <button
            type="button"
            aria-label={Number(unreadCount) > 0 ? `通知 ${unreadCount} 条未读` : '通知'}
            onClick={() => navigate('/notifications')}
            style={{ position: 'relative', cursor: 'pointer', padding: 8, background: '#fff', border: 0, borderRadius: '50%', boxShadow: '0 2px 5px rgba(0,0,0,.05)' }}
          >
            <IoNotificationsOutline size={20} color="#1e293b" className={Number(unreadCount) > 0 ? 'bell-shake' : ''} />
            {Number(unreadCount) > 0 && (
              <Badge
                content={Number(unreadCount) > 99 ? '99+' : Number(unreadCount)}
                style={{ position: 'absolute', top: -2, right: -2, '--color': '#b91c1c', border: '2px solid #fff' }}
              />
            )}
          </button>
        </header>
      )}

      {isCompact && (
        <div style={{ padding: '12px 20px 0', position: 'relative', zIndex: 15 }}>
          <GlobalSearch />
        </div>
      )}

      <main style={{ width: '100%', maxWidth: 1200, boxSizing: 'border-box', margin: '0 auto', padding: isCompact ? '0 20px 28px' : '28px 40px 40px' }}>
        {isManager ? (
          <ManagerWorkbench isAdmin={isAdmin} onNavigate={navigate} />
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ paddingTop: 20 }}>
            <h1 className="home-title">我的工作台</h1>

            <div className="home-metrics" aria-label="任务概况">
              <MetricCard value={activeTasks.length} label="未完成" color="#2563eb" />
              <MetricCard value={overdueCount} label="已逾期" color={overdueCount > 0 ? '#dc2626' : '#94a3b8'} danger={overdueCount > 0} />
              <MetricCard value={completedCount} label="已完成" color="#059669" />
            </div>

            {urgentCount > 0 && (
              <div className="home-alert">
                <IoFlameOutline size={20} color="#ea580c" />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#9a3412' }}>有 {urgentCount} 个任务即将到期，请尽快处理</span>
              </div>
            )}

            <section style={{ marginBottom: 32 }}>
              <SectionTitle icon={<IoCheckmarkCircleOutline size={20} color="#2563eb" />} title="我的任务" onMore={() => navigate('/my-tasks')} />
              {currentTasks.length > 0 ? (
                <div className="home-list">
                  {currentTasks.map(task => {
                    const urgency = getDeadlineUrgency(task.deadline)
                    const deadlineWarning = urgency === 'overdue' || urgency === 'urgent'
                    return (
                      <button
                        type="button"
                        key={task.id}
                        onClick={() => navigate(`/task/${task.id}`)}
                        className={`home-list-row${deadlineWarning ? ' home-list-row--warning' : ''}`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.stage_name}</span>
                          {urgency === 'overdue' && <IoWarningOutline size={16} color="#dc2626" />}
                          {urgency === 'urgent' && <IoFlameOutline size={16} color="#ea580c" />}
                        </div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: '#64748b' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 4, background: task.status === 'in_progress' ? '#dbeafe' : task.status === 'blocked' ? '#fee2e2' : '#f1f5f9', color: task.status === 'in_progress' ? '#2563eb' : task.status === 'blocked' ? '#dc2626' : '#64748b', fontWeight: 600 }}>
                            {task.status === 'in_progress' ? '进行中' : task.status === 'pending' ? '待办' : task.status === 'blocked' ? '卡点' : task.status === 'overdue' ? '逾期' : task.status}
                          </span>
                          {task.deadline && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><IoTimeOutline size={14} />{dayjs(task.deadline).format('MM/DD')}</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : <EmptyLine text="暂无未完成任务" />}
            </section>

            <section>
              <SectionTitle
                icon={<IoNotificationsOutline size={20} color="#ef4444" />}
                title="未读消息"
                badge={Number(unreadCount)}
                onMore={() => navigate('/notifications')}
              />
              {recentNotifications.length > 0 ? (
                <div className="home-list">
                  {recentNotifications.map(notification => (
                    <button type="button" key={notification.id} onClick={() => navigate('/notifications')} className="home-list-row home-list-row--notification">
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{notification.title}</div>
                      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>{notification.content}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{dayjs(notification.created).format('MM/DD HH:mm')}</div>
                    </button>
                  ))}
                </div>
              ) : <EmptyLine text="暂无未读消息" />}
            </section>
          </motion.div>
        )}
      </main>
    </div>
  )
}

function ManagerWorkbench({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate: (path: string) => void }) {
  const shortcuts = [
    { label: '项目管理', path: '/my-projects', icon: <IoShieldCheckmarkOutline size={22} /> },
    { label: '审核中心', path: '/review-center', icon: <IoCheckmarkCircleOutline size={22} /> },
    ...(isAdmin ? [
      { label: '用户管理', path: '/system/users', icon: <IoPeopleOutline size={22} /> },
      { label: 'AI 助手', path: '/system/ai', icon: <IoSparklesOutline size={22} /> },
    ] : []),
  ]

  return (
    <div style={{ paddingTop: 20 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, color: '#0f172a', letterSpacing: '-0.02em' }}>管理工作台</h1>
        <div style={{ marginTop: 5, fontSize: 13, color: '#64748b' }}>项目进度、审批与团队提醒</div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        {shortcuts.map(shortcut => (
          <button key={shortcut.path} type="button" onClick={() => onNavigate(shortcut.path)} style={{ minWidth: 156, flex: '1 1 156px', display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px', border: '1px solid #cdd9e7', borderRadius: 10, background: '#fff', color: '#1e293b', fontWeight: 700, cursor: 'pointer' }}>
            <span style={{ color: '#2563eb' }}>{shortcut.icon}</span>{shortcut.label}
          </button>
        ))}
      </div>
      <Tasks />
    </div>
  )
}

function MetricCard({ value, label, color, danger = false }: { value: number; label: string; color: string; danger?: boolean }) {
  return (
    <div className={`home-metric${danger ? ' home-metric--danger' : ''}`}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: danger ? '#dc2626' : '#64748b', fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  )
}

function SectionTitle({ icon, title, badge = 0, onMore }: { icon: React.ReactNode; title: string; badge?: number; onMore: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon}{title}{badge > 0 && <Badge content={badge} style={{ '--color': '#ef4444' }} />}
      </h2>
      <button type="button" onClick={onMore} style={{ background: 'none', border: 0, color: '#2563eb', fontSize: 13, cursor: 'pointer' }}>查看全部 →</button>
    </div>
  )
}

function EmptyLine({ text }: { text: string }) {
  return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 14 }}>{text}</div>
}
