import { useNavigate } from 'react-router-dom'
import { IoNotificationsOutline, IoPersonCircleOutline } from 'react-icons/io5'
import { Badge } from 'antd-mobile'
import { useNotificationAlerts } from '../../lib/useNotificationAlerts'
import { pb } from '../../lib/pocketbase'
import { GlobalSearch } from './GlobalSearch'

export function TopBar() {
  const navigate = useNavigate()
  const { unreadCount } = useNotificationAlerts()
  const user = pb.authStore.model as { name?: string; username?: string } | null
  const displayName = user?.name || user?.username || '用户'

  return (
    <header
      style={{
        height: 56,
        flexShrink: 0,
        background: '#fff',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: 16,
        boxShadow: '0 1px 2px rgba(0,0,0,.04)',
      }}
    >
      <GlobalSearch />

      <div style={{ flex: 1 }} />

      <button
        type="button"
        onClick={() => navigate('/notifications')}
        aria-label={unreadCount > 0 ? `通知 ${unreadCount} 条未读` : '通知'}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 6,
          cursor: 'pointer',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Badge content={unreadCount > 0 ? unreadCount : null}>
          <IoNotificationsOutline size={24} color="#475569" />
        </Badge>
      </button>

      <button
        type="button"
        onClick={() => navigate('/me')}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 6,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <IoPersonCircleOutline size={28} color="#475569" />
        <span style={{ fontSize: 14, color: '#0f172a', fontWeight: 500 }}>{displayName}</span>
      </button>
    </header>
  )
}
