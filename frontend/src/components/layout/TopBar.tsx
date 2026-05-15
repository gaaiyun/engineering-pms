import { useNavigate } from 'react-router-dom'
import { IoNotificationsOutline, IoSearchOutline, IoPersonCircleOutline } from 'react-icons/io5'
import { Badge } from 'antd-mobile'
import { useNotificationAlerts } from '../../lib/useNotificationAlerts'
import { pb } from '../../lib/pocketbase'

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
      {/* 搜索占位（后续 PR 接 cmdk） */}
      <div
        style={{
          flex: '0 1 480px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: '#f1f5f9',
          borderRadius: 8,
          color: '#94a3b8',
        }}
      >
        <IoSearchOutline size={18} />
        <span style={{ fontSize: 13 }}>搜索任务、项目、通知…（敬请期待）</span>
      </div>

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
        onClick={() => navigate('/settings')}
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
