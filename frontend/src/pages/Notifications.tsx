import { useEffect, useState, useMemo } from 'react'
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
import { Toast, Dialog, Tabs } from 'antd-mobile'
import { pb } from '../lib/pocketbase'
import { motion, AnimatePresence } from 'framer-motion'

// 使用与 api.ts 一致的接口定义
interface Notification {
  id: string
  title: string
  content: string  // 消息内容
  type: 'task' | 'system' | 'overdue' | 'flower' | 'handoff' | 'blocker' | 'task_assigned' | 'step_updated' | 'handoff_pending' | 'handoff_result' | 'comment_mention' | 'escalation'
  is_read: boolean
  created: string
  link_type?: string  // project / step / handoff
  link_id?: string    // 关联记录 ID
  user: string
}

export default function Notifications() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    loadNotifications()
    
    // 实时订阅新通知
    const userId = pb.authStore.model?.id
    if (userId) {
      pb.collection('notifications').subscribe('*', (e) => {
        if (e.action === 'create' && e.record.user === userId) {
          setNotifications(prev => [e.record as unknown as Notification, ...prev])
          Toast.show({ content: '收到新消息', icon: 'success' })
        }
      })
    }
    
    return () => {
      pb.collection('notifications').unsubscribe('*')
    }
  }, [])

  const loadNotifications = async () => {
    setLoading(true)
    try {
      const userId = pb.authStore.model?.id
      if (!userId) return
      const list = await pb.collection('notifications').getList<Notification>(1, 100, {
        filter: `user = "${userId}"`,
        sort: '-created',
      })
      setNotifications(list.items)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'all') return notifications
    if (activeTab === 'unread') return notifications.filter(n => !n.is_read)
    return notifications.filter(n => n.type === activeTab)
  }, [notifications, activeTab])

  const unreadCount = useMemo(() => 
    notifications.filter(n => !n.is_read).length
  , [notifications])

  const markRead = async (notif: Notification) => {
    if (notif.is_read) return
    try {
      await pb.collection('notifications').update(notif.id, { is_read: true })
      setNotifications(prev => prev.map(n => (n.id === notif.id ? { ...n, is_read: true } : n)))
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
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
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
        setNotifications(prev => prev.filter(n => n.id !== notif.id))
        Toast.show({ content: '已删除', icon: 'success' })
      } catch (e) {
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
        navigate(`/project/${notif.link_id}`)
      } else {
        navigate(`/task/${notif.link_id}`)
      }
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'flower': return <IoCheckmarkCircle size={24} color="#059669" />
      case 'task': 
      case 'task_assigned': return <IoAlertCircle size={24} color="#3B82F6" />
      case 'step_updated': return <IoCheckmarkCircle size={24} color="#0EA5E9" />
      case 'overdue': return <IoAlertCircle size={24} color="#B91C1C" />
      case 'blocker': return <IoAlertCircle size={24} color="#F97316" />
      case 'escalation': return <IoAlertCircle size={24} color="#DC2626" />
      case 'handoff': 
      case 'handoff_pending':
      case 'handoff_result': return <IoInformationCircle size={24} color="#8B5CF6" />
      case 'comment_mention': return <IoInformationCircle size={24} color="#10B981" />
      default: return <IoInformationCircle size={24} color="#64748B" />
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'flower': return '奖励'
      case 'task': 
      case 'task_assigned': return '任务'
      case 'step_updated': return '进度'
      case 'overdue': return '逾期'
      case 'blocker': return '卡点'
      case 'escalation': return '升级'
      case 'handoff': 
      case 'handoff_pending':
      case 'handoff_result': return '交接'
      case 'comment_mention': return '提及'
      default: return '系统'
    }
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

  return (
    <div className="page" style={{ background: '#f8fafc' }}>
      {/* Header */}
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
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Notifications</div>
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
          <Tabs.Tab title="交接" key="handoff" />
        </Tabs>
      </div>

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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredNotifications.map((notif, index) => (
                <motion.div
                  key={notif.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ delay: index * 0.05 }}
                  style={{
                    background: 'white',
                    borderRadius: 16,
                    padding: 16,
                    display: 'flex',
                    alignItems: 'start',
                    gap: 12,
                    borderLeft: !notif.is_read ? '4px solid #3b82f6' : '4px solid transparent',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onClick={() => handleClick(notif)}
                >
                  {/* 未读指示器 */}
                  {!notif.is_read && (
                    <div style={{
                      position: 'absolute',
                      top: 16,
                      right: 16,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#3b82f6'
                    }} />
                  )}
                  
                  <div style={{ marginTop: 2 }}>{getIcon(notif.type)}</div>
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ 
                        fontWeight: 700, 
                        fontSize: 15, 
                        color: '#1E293B',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1
                      }}>
                        {notif.title}
                      </span>
                      <span style={{ 
                        fontSize: 10, 
                        color: '#94A3B8',
                        background: '#f1f5f9',
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontWeight: 600,
                        flexShrink: 0
                      }}>
                        {getTypeLabel(notif.type)}
                      </span>
                    </div>
                    
                    <div style={{ 
                      fontSize: 13, 
                      color: '#64748B', 
                      lineHeight: 1.5,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {notif.content}
                    </div>
                    
                    <div style={{ 
                      fontSize: 11, 
                      color: '#94A3B8', 
                      marginTop: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <span>{formatTime(notif.created)}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteNotification(notif)
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#cbd5e1',
                          cursor: 'pointer',
                          padding: 4,
                          display: 'flex'
                        }}
                      >
                        <IoTrashOutline size={16} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
