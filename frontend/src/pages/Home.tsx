import { TabBar, Badge } from 'antd-mobile'
import {
  UnorderedListOutline,
  UserOutline,
  SetOutline,
} from 'antd-mobile-icons'
import { useState, useEffect, useRef } from 'react'
import { IoNotificationsOutline, IoCheckmarkCircleOutline, IoTimeOutline, IoChevronForwardOutline, IoWarningOutline, IoFlameOutline } from 'react-icons/io5'
import { useNavigate } from 'react-router-dom'
import Tasks from './Tasks'
import Profile from './Profile'
import { pb } from '../lib/pocketbase'
import { motion, AnimatePresence } from 'framer-motion'
import { useUnreadNotificationCount, useTasks, useVisibleTasks, useNotifications, useProjects } from '../lib/api'
import dayjs from 'dayjs'

export default function Home() {
  const [activeKey, setActiveKey] = useState('tasks')
  const touchStartRef = useRef<number | null>(null)
  const navigate = useNavigate()
  const userId = pb.authStore.model?.id || ''
  const { data: unreadCount = 0 } = useUnreadNotificationCount(userId)

  const role = pb.authStore.model?.role?.toLowerCase()
  const isManager = role === 'manager' || role === 'admin'
  const isEmployee = !isManager

  // 员工端数据
  const { data: myTasks = [] } = useTasks()
  const { data: allVisibleTasks = [] } = useVisibleTasks()
  const { data: notifications = [] } = useNotifications(userId)
  const { data: myProjects = [] } = useProjects()

  const activeTasks = myTasks.filter(t =>
    t.status === 'in_progress' || t.status === 'pending' || t.status === 'blocked' || t.status === 'overdue'
  )
  const currentTasks = activeTasks.slice(0, 5)
  const recentNotifications = notifications.filter(n => !n.is_read).slice(0, 5)

  const getDeadlineUrgency = (deadline?: string): 'overdue' | 'urgent' | 'approaching' | 'normal' | 'none' => {
    if (!deadline) return 'none'
    const diff = dayjs(deadline).diff(dayjs(), 'day')
    if (diff < 0) return 'overdue'
    if (diff <= 1) return 'urgent'
    if (diff <= 3) return 'approaching'
    return 'normal'
  }

  const overdueCount = activeTasks.filter(t => getDeadlineUrgency(t.deadline) === 'overdue').length
  const urgentCount = activeTasks.filter(t => {
    const u = getDeadlineUrgency(t.deadline)
    return u === 'urgent' || u === 'approaching'
  }).length
  const completedCount = myTasks.filter(t => t.status === 'completed').length

  const tabs = [
    {
      key: 'tasks',
      title: '工作进展',
      icon: <UnorderedListOutline />,
    },
    ...(isEmployee ? [{
      key: 'timeline',
      title: '时间轴',
      icon: <IoTimeOutline />,
    }] : []),
    ...(isManager ? [{
      key: 'manager',
      title: '管理',
      icon: <SetOutline />,
    }] : []),
    {
      key: 'me',
      title: '我的',
      icon: <UserOutline />,
    },
  ]

  const handleTabChange = (key: string) => {
    if (key === 'manager') {
      navigate('/manager')
    } else {
      setActiveKey(key)
    }
  }

  // Responsive Check — 横屏手机宽度也可能 >768，需同时检查高度和触控能力
  const checkIsPC = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    // 宽度 >1024 或 (宽度 >768 且非触屏设备) 才视为 PC
    if (w > 1024) return true
    if (w > 768 && !isTouch) return true
    // 横屏手机：宽 >768 但高 <500，不算 PC
    if (w > 768 && h < 500) return false
    return false
  }
  const [isPC, setIsPC] = useState(checkIsPC)
  useEffect(() => {
    const handleResize = () => setIsPC(checkIsPC())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: isPC ? 'row' : 'column', background: 'var(--page-bg)' }}>

      {/* PC Sidebar Navigation */}
      {isPC && (
        <div style={{
          width: 240,
          background: '#fff',
          borderRight: '1px solid rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px 0'
        }}>
          {/* Logo / Band */}
          <div style={{ padding: '0 24px', marginBottom: 40 }}>
            <div style={{ fontWeight: 800, fontSize: 22, color: '#0F172A', letterSpacing: '-0.5px' }}>
              工程结算
            </div>
            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, letterSpacing: '1px' }}>工程管理系统</div>
          </div>

          {/* Nav Items */}
          <div style={{ flex: 1 }}>
            {tabs.map(item => (
              <div
                key={item.key}
                onClick={() => handleTabChange(item.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 24px',
                  cursor: 'pointer',
                  background: activeKey === item.key ? '#EFF6FF' : 'transparent',
                  borderRight: activeKey === item.key ? '3px solid #2563EB' : '3px solid transparent',
                  color: activeKey === item.key ? '#2563EB' : '#64748B',
                  fontWeight: activeKey === item.key ? 600 : 500,
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontSize: 20 }}>{item.icon}</div>
                <div style={{ fontSize: 15 }}>{item.title}</div>
              </div>
            ))}
          </div>

          {/* User Profile / Notifications */}
          <div style={{ padding: 24, borderTop: '1px solid #F1F5F9' }}>
            <div
              onClick={() => navigate('/notifications')}
              style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', color: '#475569' }}
            >
              <div style={{ position: 'relative' }}>
                <IoNotificationsOutline size={20} className={unreadCount > 0 ? 'bell-shake' : ''} />
                {unreadCount > 0 && (
                  <Badge
                    content={unreadCount > 99 ? '99+' : unreadCount}
                    style={{ position: 'absolute', top: -6, right: -10, '--color': '#DC2626', border: '2px solid #fff', fontSize: 10 }}
                  />
                )}
              </div>
              <span style={{ fontSize: 14 }}>消息通知</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div
        style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}
        onTouchStart={e => {
          touchStartRef.current = e.touches[0].clientX
        }}
        onTouchEnd={e => {
          const touchEndX = e.changedTouches[0].clientX
          const startX = touchStartRef.current
          if (startX === null) return

          const diff = startX - touchEndX
          if (Math.abs(diff) > 50) {
            const keys = tabs.map(t => t.key)
            const idx = keys.indexOf(activeKey)
            if (diff > 0 && idx < keys.length - 1) {
              handleTabChange(keys[idx + 1])
            } else if (diff < 0 && idx > 0) {
              handleTabChange(keys[idx - 1])
            }
          }
          touchStartRef.current = null
        }}
      >

        {/* Mobile Header (Only show on Mobile and when not in Profile) */}
        {!isPC && activeKey !== 'me' && (
          <div className="glass-header"
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 99,
              padding: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 20, color: '#0F172A', letterSpacing: '-0.5px' }}>
              工程结算管理
            </div>
            <div
              onClick={() => navigate('/notifications')}
              style={{ position: 'relative', cursor: 'pointer', padding: 8, background: '#fff', borderRadius: '50%', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}
            >
              <IoNotificationsOutline size={20} color="#1E293B" className={unreadCount > 0 ? 'bell-shake' : ''} />
              {unreadCount > 0 && (
                <Badge
                  content={unreadCount > 99 ? '99+' : unreadCount}
                  style={{ position: 'absolute', top: -2, right: -2, '--color': '#B91C1C', border: '2px solid #fff' }}
                />
              )}
            </div>
          </div>
        )}

        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: activeKey === 'me' ? 0 : (isPC ? '32px 40px' : '0 20px'),
          maxWidth: isPC ? 1200 : '100%',
          margin: isPC ? '0 auto' : 0,
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeKey}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              style={{ height: '100%' }}
            >
              {activeKey === 'tasks' && (
                isEmployee ? (
                  <div style={{ paddingTop: 20 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, color: '#0f172a' }}>我的工作台</h2>

                    {/* 统计卡片 */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
                      <div style={{ background: '#fff', borderRadius: 14, padding: '14px 12px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#2563eb' }}>{activeTasks.length}</div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginTop: 2 }}>进行中</div>
                      </div>
                      <div style={{ background: overdueCount > 0 ? '#fef2f2' : '#fff', borderRadius: 14, padding: '14px 12px', textAlign: 'center', border: `1px solid ${overdueCount > 0 ? '#fecaca' : '#e2e8f0'}` }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: overdueCount > 0 ? '#dc2626' : '#94a3b8' }}>{overdueCount}</div>
                        <div style={{ fontSize: 11, color: overdueCount > 0 ? '#dc2626' : '#64748b', fontWeight: 600, marginTop: 2 }}>已逾期</div>
                      </div>
                      <div style={{ background: '#fff', borderRadius: 14, padding: '14px 12px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#059669' }}>{completedCount}</div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginTop: 2 }}>已完成</div>
                      </div>
                    </div>

                    {/* 截止日期紧急提醒 */}
                    {urgentCount > 0 && (
                      <div style={{
                        background: 'linear-gradient(135deg, #fff7ed, #fef3c7)', borderRadius: 12,
                        padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10,
                        border: '1px solid #fed7aa',
                      }}>
                        <IoFlameOutline size={20} color="#ea580c" />
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#9a3412' }}>
                          有 {urgentCount} 个任务即将到期，请尽快处理
                        </span>
                      </div>
                    )}

                    {/* 我的任务 */}
                    <div style={{ marginBottom: 32 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <IoCheckmarkCircleOutline size={20} color="#2563eb" />
                          我的任务
                        </h3>
                        <button onClick={() => navigate('/my-tasks')} style={{
                          background: 'none', border: 'none', color: '#2563eb', fontSize: 13, cursor: 'pointer'
                        }}>查看全部 →</button>
                      </div>
                      {currentTasks.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {currentTasks.map(task => {
                            const urgency = getDeadlineUrgency(task.deadline)
                            const isDeadlineWarn = urgency === 'overdue' || urgency === 'urgent'
                            return (
                              <div key={task.id} onClick={() => navigate(`/task/${task.id}`)} style={{
                                background: '#fff', borderRadius: 12, padding: 16, cursor: 'pointer',
                                border: `1px solid ${isDeadlineWarn ? '#fecaca' : '#e2e8f0'}`,
                                boxShadow: isDeadlineWarn ? '0 2px 8px rgba(239,68,68,0.08)' : '0 1px 3px rgba(0,0,0,0.05)',
                                borderLeft: task.priority === 'high' ? '4px solid #ef4444' : task.priority === 'low' ? '4px solid #10b981' : undefined,
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                  <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.stage_name}</div>
                                  {urgency === 'overdue' && <IoWarningOutline size={16} color="#dc2626" style={{ flexShrink: 0, marginLeft: 8 }} />}
                                  {urgency === 'urgent' && <IoFlameOutline size={16} color="#ea580c" style={{ flexShrink: 0, marginLeft: 8 }} />}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
                                  <span style={{
                                    padding: '2px 8px', borderRadius: 4,
                                    background: task.status === 'in_progress' ? '#dbeafe' : task.status === 'blocked' ? '#fee2e2' : task.status === 'overdue' ? '#fff7ed' : '#f1f5f9',
                                    color: task.status === 'in_progress' ? '#2563eb' : task.status === 'blocked' ? '#dc2626' : task.status === 'overdue' ? '#ea580c' : '#64748b',
                                    fontWeight: 600,
                                  }}>
                                    {task.status === 'in_progress' ? '进行中' : task.status === 'pending' ? '待办' : task.status === 'blocked' ? '卡点' : task.status === 'overdue' ? '逾期' : task.status}
                                  </span>
                                  {task.deadline && (
                                    <span style={{
                                      display: 'flex', alignItems: 'center', gap: 4,
                                      color: urgency === 'overdue' ? '#dc2626' : urgency === 'urgent' ? '#ea580c' : '#64748b',
                                      fontWeight: isDeadlineWarn ? 700 : 400,
                                    }}>
                                      <IoTimeOutline size={14} />
                                      {urgency === 'overdue' ? `逾期 ${Math.abs(dayjs(task.deadline).diff(dayjs(), 'day'))} 天` :
                                       urgency === 'urgent' ? '明天到期' :
                                       dayjs(task.deadline).format('MM/DD')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 14 }}>
                          暂无进行中的任务
                        </div>
                      )}
                    </div>

                    {/* 未读消息 */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <IoNotificationsOutline size={20} color="#ef4444" />
                          未读消息
                          {recentNotifications.length > 0 && (
                            <Badge content={recentNotifications.length} style={{ '--color': '#ef4444' }} />
                          )}
                        </h3>
                        <button onClick={() => navigate('/notifications')} style={{
                          background: 'none', border: 'none', color: '#2563eb', fontSize: 13, cursor: 'pointer'
                        }}>查看全部 →</button>
                      </div>
                      {recentNotifications.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {recentNotifications.map(notif => (
                            <div key={notif.id} onClick={() => navigate('/notifications')} style={{
                              background: '#fff', borderRadius: 12, padding: 16, cursor: 'pointer',
                              border: '1px solid #fee2e2', boxShadow: '0 1px 3px rgba(239,68,68,0.1)'
                            }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{notif.title}</div>
                              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>{notif.content}</div>
                              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                {dayjs(notif.created).format('MM/DD HH:mm')}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 14 }}>
                          暂无未读消息
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  // 经理/管理员显示原有的 Tasks 组件
                  <Tasks />
                )
              )}
              {activeKey === 'timeline' && (
                <div style={{ paddingTop: 20, paddingBottom: 40 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#0f172a' }}>项目时间轴</h2>
                  <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>点击项目查看甘特图</p>

                  {myProjects.filter(p => p.status === 'active').length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {myProjects.filter(p => p.status === 'active').map((project, index) => {
                        const pTasks = allVisibleTasks.filter(t => t.project === project.id)
                        const completed = pTasks.filter(t => t.status === 'completed').length
                        const progress = pTasks.length > 0 ? Math.round((completed / pTasks.length) * 100) : 0
                        return (
                          <div
                            key={project.id}
                            onClick={() => navigate(`/project/${project.id}/timeline`)}
                            style={{
                              background: '#fff', borderRadius: 16, padding: 20, cursor: 'pointer',
                              border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                              transition: 'all 0.2s'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                              <div style={{
                                width: 40, height: 40, borderRadius: 10,
                                background: ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6'][index % 4],
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'white', fontWeight: 700, fontSize: 14
                              }}>
                                {project.name?.charAt(0) || 'P'}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, color: '#1E293B', fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {project.name}
                                </div>
                                <div style={{ fontSize: 12, color: '#94a3b8' }}>{project.code || '暂无编号'}</div>
                              </div>
                              <IoChevronForwardOutline size={18} color="#94a3b8" />
                            </div>

                            <div style={{ background: '#f1f5f9', borderRadius: 4, height: 6, overflow: 'hidden', marginBottom: 8 }}>
                              <div style={{ height: '100%', borderRadius: 4, width: `${progress}%`, background: progress === 100 ? '#10b981' : '#3b82f6', transition: 'width 0.3s' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b' }}>
                              <span>进度 {progress}%</span>
                              <span>{completed}/{pTasks.length} 已完成</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 14 }}>
                      暂无参与中的项目
                    </div>
                  )}

                  {myProjects.filter(p => p.status === 'completed').length > 0 && (
                    <div style={{ marginTop: 32 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 600, color: '#64748b', marginBottom: 12 }}>已完成的项目</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {myProjects.filter(p => p.status === 'completed').map(project => (
                          <div
                            key={project.id}
                            onClick={() => navigate(`/project/${project.id}/timeline`)}
                            style={{
                              background: '#f8fafc', borderRadius: 12, padding: 16, cursor: 'pointer',
                              border: '1px solid #e2e8f0', opacity: 0.8
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ fontWeight: 600, color: '#475569', fontSize: 14 }}>{project.name}</div>
                              <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600, background: '#ecfdf5', padding: '2px 8px', borderRadius: 4 }}>已完成</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {activeKey === 'me' && <Profile />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Mobile TabBar (Hide on PC) */}
      {!isPC && (
        <TabBar
          activeKey={activeKey}
          onChange={handleTabChange}
          style={{
            borderTop: '1px solid rgba(0,0,0,0.05)',
            background: '#fff',
            paddingBottom: 'env(safe-area-inset-bottom)'
          }}
        >
          {tabs.map(item => (
            <TabBar.Item key={item.key} icon={item.icon} title={item.title} />
          ))}
        </TabBar>
      )}
    </div>
  )
}
