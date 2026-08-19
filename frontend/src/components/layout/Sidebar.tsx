import { NavLink, useLocation } from 'react-router-dom'
import { IoAppsOutline } from 'react-icons/io5'
import { pb } from '../../lib/pocketbase'
import { getVisibleNavigation, isNavigationItemActive, normalizeAppRole } from '../../lib/navigation'
import { NavigationIcon } from './NavigationIcon'

interface SidebarProps {
  collapsed: boolean
}

export function Sidebar({ collapsed }: SidebarProps) {
  const location = useLocation()
  const role = normalizeAppRole((pb.authStore.model as { role?: string } | null)?.role)
  const visibleItems = getVisibleNavigation(role, collapsed ? 'sidebar-collapsed' : 'sidebar-expanded')

  return (
    <nav
      aria-label="桌面主导航"
      data-collapsed={collapsed}
      style={{
        width: collapsed ? 64 : 240,
        height: '100%',
        background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 200ms ease',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: collapsed ? '20px 12px' : '20px 16px',
          fontSize: 18,
          fontWeight: 800,
          letterSpacing: 0.5,
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <IoAppsOutline size={22} />
        {!collapsed && <span>EngineeringPMS</span>}
      </div>
      <div style={{ flex: 1, paddingTop: 8, overflowY: 'auto' }}>
        {visibleItems.map((item) => {
          const active = isNavigationItemActive(location.pathname, item)
          return (
            <NavLink
              key={item.id}
              to={item.path}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: collapsed ? '12px 20px' : '12px 16px',
                marginTop: item.id === 'system' ? 16 : 0,
                color: active ? '#fff' : '#cbd5e1',
                background: active ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
                borderLeft: active ? '3px solid #6366f1' : '3px solid transparent',
                textDecoration: 'none',
                fontWeight: active ? 600 : 500,
                fontSize: 14,
                whiteSpace: 'nowrap',
              }}
            >
              <NavigationIcon iconKey={item.iconKey} size={20} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
