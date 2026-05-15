import { NavLink, useLocation } from 'react-router-dom'
import type { ComponentType } from 'react'
import {
  IoHomeOutline, IoListOutline, IoAppsOutline,
  IoCheckmarkDoneOutline,
  IoNotificationsOutline, IoBriefcaseOutline,
  IoSettingsOutline, IoShieldCheckmarkOutline,
} from 'react-icons/io5'
import { pb } from '../../lib/pocketbase'

interface SidebarProps {
  collapsed: boolean
}

interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ size?: number }>
  adminOnly?: boolean
}

const ITEMS: NavItem[] = [
  { to: '/app', label: '首页', icon: IoHomeOutline },
  { to: '/my-tasks', label: '我的任务', icon: IoListOutline },
  { to: '/my-projects', label: '我的项目', icon: IoBriefcaseOutline },
  { to: '/review-center', label: '审核中心', icon: IoCheckmarkDoneOutline, adminOnly: true },
  { to: '/notifications', label: '通知', icon: IoNotificationsOutline },
  { to: '/settings', label: '设置', icon: IoSettingsOutline },
  { to: '/admin', label: '管理后台', icon: IoShieldCheckmarkOutline, adminOnly: true },
]

export function Sidebar({ collapsed }: SidebarProps) {
  const location = useLocation()
  const role = (pb.authStore.model as { role?: string } | null)?.role?.toLowerCase()
  const isAdmin = role === 'admin' || role === 'manager'

  const visibleItems = ITEMS.filter((it) => !it.adminOnly || isAdmin)

  return (
    <nav
      aria-label="主导航"
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
          const Icon = item.icon
          const active =
            location.pathname === item.to ||
            (item.to === '/app' && location.pathname.startsWith('/app'))
          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: collapsed ? '12px 20px' : '12px 16px',
                color: active ? '#fff' : '#cbd5e1',
                background: active ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
                borderLeft: active ? '3px solid #6366f1' : '3px solid transparent',
                textDecoration: 'none',
                fontWeight: active ? 600 : 500,
                fontSize: 14,
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={20} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
