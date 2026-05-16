import { useState, useMemo } from 'react'
import { 
  IoArrowBackOutline, 
  IoNotificationsOutline, 
  IoCheckmarkCircle, 
  IoAlertCircle, 
  IoInformationCircle,
  IoCheckmarkDoneOutline,
  IoTrashOutline
} from 'react-icons/io5'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Toast, Dialog, Tabs, SwipeAction } from 'antd-mobile'
import { pb } from '../lib/pocketbase'
import { invalidateNotificationQueries, useNotifications as useNotificationsQuery } from '../lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import { useBreakpoint } from '../lib/useBreakpoint'

interface Notification {
  id: string
  title: string
  content: string
  type: string
  is_read: boolean
  created: string
  link_type?: string
  link_id?: string
  user: string
}

export default function Notifications() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const userId = pb.authStore.model?.id || ''
  const { data: rqNotifications = [], isLoading: loading } = useNotificationsQuery(userId)
  const notifications = rqNotifications as unknown as Notification[]
  const [activeTab, setActiveTab] = useState('all')
  // Bug fix J-1: 桌面端 AppShell 已有 Sidebar/TopBar，移动版 page header
  // 重复且 ← 在桌面端无意义。仅 mobile 渲染顶部 header。
  const bp = useBreakpoint()
  const isMobile = bp === 'mobile'

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'all') return notifications
    if (activeTab === 'unread') return notifications.filter(n => !n.is_read)
    if (activeTab === 'task') return notifications.filter(n => n.type?.startsWith('task') || n.type === 'step_updated' || n.type === 'overdue' || n.type === 'audit_rejected' || n.type === 'progress_update')
    if (activeTab === 'handoff') return notifications.filter(n => n.type?.startsWith('handoff'))
    if (activeTab === 'blocker') return notifications.filter(n => n.type?.startsWith('blocker') || n.type === 'escalation')
    if (activeTab === 'project') return notifications.filter(n => n.type?.startsWith('project'))
    return notifications.filter(n => n.type === activeTab)
  }, [notifications, activeTab])

  const unreadCount = useMemo(() => 
    notifications.filter(n => !n.is_read).length
  , [notifications])

  const markRead = async (notif: Notification) => {
    if (notif.is_read) return
    try {
      await pb.collection('notifications').update(notif.id, { is_read: true })
      invalidateNotificationQueries(queryClient, [userId])
    } catch (e) {
      console.error(e)
    }
  }

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.is_read)
    if (unread.length === 0) {
      Toast.show({ content: '没有未读消息' })
      return
    }
    
    try {
      await Promise.all(unread.map(n => 
        pb.collection('notifications').update(n.id, { is_read: true })
      ))
      invalidateNotificationQueries(queryClient, [userId])
      Toast.show({ content: `已全部标为已读`, icon: 'success' })
    } catch (e) {
      console.error(e)
      Toast.show({ content: '操作失败', icon: 'fail' })
    }
  }

  const deleteNotification = async (notif: Notification) => {
    const result = await Dialog.confirm({
      content: '确定删除此通知？',
      confirmText: '删除',
      cancelText: '取消',
    })
    
    if (result) {
      try {
        await pb.collection('notifications').delete(notif.id)
        invalidateNotificationQueries(queryClient, [userId])
        Toast.show({ content: '已删除', icon: 'success' })
      } catch {
        Toast.show({ content: '删除失败', icon: 'fail' })
      }
    }
  }

  const handleClick = (notif: Notification) => {
    markRead(notif)
    if (notif.link_id) {
      // 根据链接类型跳转不同页面
      if (notif.link_type === 'handoff' || notif.type === 'handoff' || notif.type === 'handoff_pending' || notif.type === 'handoff_result') {
        navigate('/review-center')
      } else if (notif.link_type === 'project') {
        navigate(`/project/${notif.link_id}/timeline`)
      } else {
        navigate(`/task/${notif.link_id}`)
      }
    }
  }

  const getIcon = (type: string) => {
    if (type === 'progress_update') return <IoCheckmarkCircle size={24} color="#10B981" />
    if (type.startsWith('task') || type === 'step_updated') return <IoAlertCircle size={24} color="#3B82F6" />
    if (type.startsWith('project')) return <IoInformationCircle size={24} color="#0EA5E9" />
    if (type.startsWith('blocker') || type === 'escalation') return <IoAlertCircle size={24} color="#F97316" />
    if (type.startsWith('handoff')) return <IoInformationCircle size={24} color="#8B5CF6" />
    if (type === 'overdue') return <IoAlertCircle size={24} color="#B91C1C" />
    if (type === 'audit_rejected') return <IoAlertCircle size={24} color="#DC2626" />
    if (type === 'flower') return <IoCheckmarkCircle size={24} color="#059669" />
    if (type === 'comment_mention') return <IoInformationCircle size={24} color="#10B981" />
    return <IoInformationCircle size={24} color="#64748B" />
  }

  const getTypeLabel = (type: string) => {
    if (type === 'progress_update') return '进度'
    if (type.startsWith('task')) return '任务'
    if (type.startsWith('project')) return '项目'
    if (type.startsWith('blocker') || type === 'escalation') return '卡点'
    if (type.startsWith('handoff')) return '交接'
    if (type === 'step_updated') return '进度'
    if (type === 'overdue') return '逾期'
    if (type === 'audit_rejected') return '审计驳回'
    if (type === 'flower') return '奖励'
    if (type === 'comment_mention') return '提及'
    return '系统'
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    
    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 7) return `${days}天前`
    return date.toLocaleDateString()
  }

  const getTimeGroup = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 86400000)
    const thisWeek = new Date(today.getTime() - 6 * 86400000)

    if (date >= today) return '今天'
    if (date >= yesterday) return '昨天'
    if (date >= thisWeek) return '本周'
    return '更早'
  }

  const groupedNotifications = useMemo(() => {
    const groups: { label: string; items: Notification[] }[] = []
    const groupMap = new Map<string, Notification[]>()
    const order = ['今天', '昨天', '本周', '更早']

    for (const n of filteredNotifications) {
      const label = getTimeGroup(n.created)
      if (!groupMap.has(label)) groupMap.set(label, [])
      groupMap.get(label)!.push(n)
    }

    for (const label of order) {
      const items = groupMap.get(label)
      if (items && items.length > 0) {
        groups.push({ label, items })
      }
    }
    return groups
  }, [filteredNotifications])

  return (
    <div className="page" style={{ background: '#f8fafc' }}>
      {/* Header — Bug fix J-1: 仅 mobile 渲染（桌面 AppShell 已有 TopBar） */}
      {isMobile && (
      <div style={{
        background: 'white',
        padding: '16px 20px',
        borderBottom: '1px solid #e2e8f0',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => navigate(-1)}
              style={{
                background: 'none',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <IoArrowBackOutline size={20} color="#64748B" />
            </button>
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, letterSpacing: 1 }}>消息通知</div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#0f172a' }}>消息中心</h2>
            </div>
          </div>
          
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              style={{
                background: 'none',
                border: 'none',
                color: '#3b82f6',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer'
              }}
            >
              <IoCheckmarkDoneOutline size={18} />
              全部已读
            </button>
          )}
        </div>
        
        {/* Tabs */}
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          style={{
            '--title-font-size': '13px',
            '--active-title-color': '#3b82f6',
            '--active-line-color': '#3b82f6',
          }}
        >
          <Tabs.Tab title={`全部 (${notifications.length})`} key="all" />
          <Tabs.Tab title={`未读 (${unreadCount})`} key="unread" />
          <Tabs.Tab title="任务" key="task" />
          <Tabs.Tab title="项目" key="project" />
          <Tabs.Tab title="卡点" key="blocker" />
          <Tabs.Tab title="交接" key="handoff" />
        </Tabs>
      </div>
      )}
      {!isMobile && (
        // 桌面端：仅渲染 Tabs（标题由 AppShell TopBar 接管）
        <div style={{
          background: 'white',
          padding: '0 24px',
          borderBottom: '1px solid #e2e8f0',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            style={{ '--title-font-size': '14px' }}
          >
            <Tabs.Tab title="全部" key="all" />
            <Tabs.Tab title="未读" key="unread" />
            <Tabs.Tab title="任务" key="task" />
            <Tabs.Tab title="项目" key="project" />
            <Tabs.Tab title="卡点" key="blocker" />
            <Tabs.Tab title="交接" key="handoff" />
          </Tabs>
        </div>
      )}

      {/* Content */}
      <div style={{ padding: '16px 20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
            加载中...
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: 60, color: '#94a3b8' }}>
            <IoNotificationsOutline size={64} style={{ opacity: 0.2, marginBottom: 16 }} />
            <div style={{ fontSize: 15, fontWeight: 600 }}>暂无消息</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              {activeTab === 'unread' ? '所有消息都已读' : '还没有收到任何通知'}
            </div>
          </div>
        ) : (
          <AnimatePresence>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {groupedNotifications.map(group => (
                <div key={group.label}>
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: '#94a3b8',
                    textTransform: 'uppercase', letterSpacing: 1,
                    padding: '12px 0 8px', borderBottom: '1px solid #f1f5f9', marginBottom: 8,
                  }}>
                    {group.label}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {group.items.map((notif, index) => (
                      <SwipeAction
                        key={notif.id}
                        rightActions={[
                          {
                            key: 'delete',
                            text: '删除',
                            color: 'danger',
                            onClick: () => deleteNotification(notif),
                          },
                          ...(!notif.is_read ? [{
                            key: 'read',
                            text: '已读',
                            color: 'primary' as const,
                            onClick: () => markRead(notif),
                          }] : []),
                        ]}
                      >
                        <motion.div
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -80 }}
                          transition={{ delay: index * 0.03 }}
                          style={{
                            background: 'white',
                            borderRadius: 14,
                            padding: 16,
                            display: 'flex',
                            alignItems: 'start',
                            gap: 12,
                            borderLeft: !notif.is_read ? '4px solid #3b82f6' : '4px solid transparent',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                            cursor: 'pointer',
                            position: 'relative',
                          }}
                          onClick={() => handleClick(notif)}
                        >
                          {!notif.is_read && (
                            <div style={{
                              position: 'absolute', top: 16, right: 16,
                              width: 8, height: 8, borderRadius: '50%', background: '#3b82f6',
                            }} />
                          )}

                          <div style={{ marginTop: 2 }}>{getIcon(notif.type)}</div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ fontWeight: 700, fontSize: 15, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                {notif.title}
                              </span>
                              <span style={{ fontSize: 10, color: '#94A3B8', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontWeight: 600, flexShrink: 0 }}>
                                {getTypeLabel(notif.type)}
                              </span>
                            </div>

                            <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {notif.content}
                            </div>

                            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span>{formatTime(notif.created)}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteNotification(notif) }}
                                style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: 4, display: 'flex' }}
                              >
                                <IoTrashOutline size={16} />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      </SwipeAction>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
