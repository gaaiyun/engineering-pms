import { NavLink, useLocation } from 'react-router-dom'
import { pb } from '../../lib/pocketbase'
import { getVisibleNavigation, normalizeAppRole } from '../../lib/navigation'
import { NavigationIcon } from './NavigationIcon'

function isActive(pathname: string, path: string) {
  if (path === '/app') return pathname === '/app' || pathname.startsWith('/app/')
  if (path === '/my-projects') return pathname === path || pathname.startsWith('/project/')
  return pathname === path || pathname.startsWith(`${path}/`)
}

export function MobileNavigation() {
  const location = useLocation()
  const role = normalizeAppRole((pb.authStore.model as { role?: string } | null)?.role)
  const items = getVisibleNavigation(role, 'compact')

  return (
    <nav
      aria-label="底部导航"
      style={{
        flexShrink: 0,
        display: 'grid',
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        minHeight: 50,
        padding: '5px 4px calc(5px + env(safe-area-inset-bottom))',
        borderTop: '1px solid #e2e8f0',
        background: 'rgba(255,255,255,.96)',
        backdropFilter: 'blur(14px)',
        boxShadow: '0 -4px 18px rgba(15,23,42,.05)',
        zIndex: 50,
      }}
    >
      {items.map(item => {
        const active = isActive(location.pathname, item.path)
        return (
          <NavLink
            key={item.id}
            to={item.path}
            aria-label={item.compactLabel}
            style={{
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              color: active ? '#2563eb' : '#64748b',
              textDecoration: 'none',
              fontSize: 10,
              fontWeight: active ? 700 : 500,
            }}
          >
            <NavigationIcon iconKey={item.iconKey} size={19} />
            <span>{item.compactLabel}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
