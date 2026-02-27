import { TabBar, Badge } from 'antd-mobile'
import {
  UnorderedListOutline,
  UserOutline,
  SetOutline,
} from 'antd-mobile-icons'
import { useState, useEffect, useRef } from 'react'
import { IoNotificationsOutline } from 'react-icons/io5'
import { useNavigate } from 'react-router-dom'
import Tasks from './Tasks'
// import Rankings from './Rankings' // 暂时隐藏，待领导确认需求
import Profile from './Profile'
import { pb } from '../lib/pocketbase'
import { motion, AnimatePresence } from 'framer-motion'
import { useUnreadNotificationCount } from '../lib/api'

export default function Home() {
  const [activeKey, setActiveKey] = useState('tasks')
  const touchStartRef = useRef<number | null>(null)
  const navigate = useNavigate()
  const userId = pb.authStore.model?.id || ''
  const { data: unreadCount = 0 } = useUnreadNotificationCount(userId)

  const role = pb.authStore.model?.role?.toLowerCase()
  const isManager = role === 'manager' || role === 'admin'

  const tabs = [
    {
      key: 'tasks',
      title: '工作进展',
      icon: <UnorderedListOutline />,
    },
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

  // Responsive Check
  const [isPC, setIsPC] = useState(window.innerWidth > 768)
  useEffect(() => {
    const handleResize = () => setIsPC(window.innerWidth > 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: isPC ? 'row' : 'column', background: 'var(--page-bg)' }}>

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
            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, letterSpacing: '1px' }}>ENTERPRISE</div>
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
                <IoNotificationsOutline size={20} />
                {unreadCount > 0 && (
                  <div style={{
                    position: 'absolute', top: -2, right: -2, width: 8, height: 8,
                    background: '#DC2626', borderRadius: '50%', border: '2px solid #fff'
                  }} />
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
              setActiveKey(keys[idx + 1])
            } else if (diff < 0 && idx > 0) {
              setActiveKey(keys[idx - 1])
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
              <IoNotificationsOutline size={20} color="#1E293B" />
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
              {activeKey === 'tasks' && <Tasks />}
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
