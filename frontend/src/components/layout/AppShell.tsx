import { Outlet } from 'react-router-dom'
import { useAppSurface } from '../../lib/useAppSurface'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { MobileNavigation } from './MobileNavigation'

export function AppShell() {
  const surface = useAppSurface()

  if (surface === 'compact') {
    return (
      <div
        data-shell="compact"
        style={{
          height: '100dvh',
          width: '100vw',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: '#f8fafc',
        }}
      >
        <main style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <Outlet />
        </main>
        <MobileNavigation />
      </div>
    )
  }

  const collapsed = surface === 'sidebar-collapsed'

  return (
    <div
      data-shell="desktop"
      style={{
        display: 'grid',
        gridTemplateColumns: `${collapsed ? 64 : 240}px 1fr`,
        gridTemplateRows: '56px 1fr',
        gridTemplateAreas: '"sidebar topbar" "sidebar main"',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
      }}
    >
      <div style={{ gridArea: 'sidebar' }}>
        <Sidebar collapsed={collapsed} />
      </div>
      <div style={{ gridArea: 'topbar' }}>
        <TopBar />
      </div>
      <main
        style={{
          gridArea: 'main',
          overflow: 'auto',
          background: '#f8fafc',
        }}
      >
        <Outlet />
      </main>
    </div>
  )
}
