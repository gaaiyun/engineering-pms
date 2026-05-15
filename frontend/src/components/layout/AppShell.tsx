import { Outlet } from 'react-router-dom'
import { useBreakpoint } from '../../lib/useBreakpoint'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppShell() {
  const bp = useBreakpoint()

  // 移动端：透传，不接管布局（Home.tsx 继续渲染底部 TabBar）
  if (bp === 'mobile') {
    return <Outlet />
  }

  const collapsed = bp === 'tablet'

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
