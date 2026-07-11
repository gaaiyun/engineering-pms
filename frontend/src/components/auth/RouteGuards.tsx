import type { ReactElement } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { pb } from '../../lib/pocketbase'
import { canAccessSystem, normalizeAppRole, resolveLegacyAdminPath } from '../../lib/navigation'

type GuardProps = { children: ReactElement }

export function PrivateRoute({ children }: GuardProps) {
  return pb.authStore.isValid ? children : <Navigate to="/login" replace />
}

export function ManagerRoute({ children }: GuardProps) {
  if (!pb.authStore.isValid) return <Navigate to="/login" replace />
  const role = normalizeAppRole((pb.authStore.model as { role?: string } | null)?.role)
  return role === 'manager' || role === 'admin' ? children : <Navigate to="/app" replace />
}

export function AdminOnlyRoute({ children }: GuardProps) {
  if (!pb.authStore.isValid) return <Navigate to="/login" replace />
  const role = normalizeAppRole((pb.authStore.model as { role?: string } | null)?.role)
  return canAccessSystem(role) ? children : <Navigate to="/app" replace />
}

export function DefaultRedirect() {
  return pb.authStore.isValid
    ? <Navigate to="/app" replace />
    : <Navigate to="/login" replace />
}

export function LegacyAdminRedirect() {
  const location = useLocation()
  if (!pb.authStore.isValid) return <Navigate to="/login" replace />
  const tab = new URLSearchParams(location.search).get('tab')
  return <Navigate to={resolveLegacyAdminPath(tab)} replace />
}
