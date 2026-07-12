import { NavLink } from 'react-router-dom'
import {
  IoCloudUploadOutline,
  IoPeopleOutline,
  IoSettingsOutline,
  IoSparklesOutline,
} from 'react-icons/io5'
import { useAppSurface } from '../../lib/useAppSurface'

const ITEMS = [
  { path: '/system/users', label: '用户管理', icon: IoPeopleOutline },
  { path: '/system/ai', label: 'AI 助手', icon: IoSparklesOutline },
  { path: '/system/import', label: '数据导入', icon: IoCloudUploadOutline },
  { path: '/system/settings', label: '系统设置', icon: IoSettingsOutline },
]

export function SystemSectionNav() {
  const compact = useAppSurface() === 'compact'

  return (
    <nav
      aria-label="系统管理二级导航"
      style={{
        display: compact ? 'grid' : 'flex',
        gridTemplateColumns: compact ? 'repeat(4, minmax(0, 1fr))' : undefined,
        alignItems: 'center',
        gap: compact ? 2 : 6,
        padding: compact ? '8px 4px' : '10px 16px',
        overflowX: compact ? 'hidden' : 'auto',
        background: '#fff',
        borderBottom: '1px solid #e2e8f0',
        scrollbarWidth: 'none',
      }}
    >
      {ITEMS.map(item => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
              display: 'inline-flex',
              flexDirection: compact ? 'column' : 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: compact ? 3 : 6,
              flexShrink: 0,
              minWidth: 0,
              padding: compact ? '6px 2px' : '8px 12px',
              borderRadius: 8,
              background: isActive ? '#eff6ff' : 'transparent',
              color: isActive ? '#1d4ed8' : '#64748b',
              textDecoration: 'none',
              fontSize: compact ? 11 : 13,
              fontWeight: isActive ? 700 : 600,
            })}
          >
            <Icon size={17} />
            {item.label}
          </NavLink>
        )
      })}
    </nav>
  )
}
