import type { ReactNode } from 'react'
import { SystemSectionNav } from './SystemSectionNav'

export function SystemSectionLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100%', minWidth: 0, background: '#f8fafc' }}>
      <SystemSectionNav />
      {children}
    </div>
  )
}
