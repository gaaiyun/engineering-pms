import { useEffect, useReducer, type ReactElement } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { pb } from '../../lib/pocketbase'
import { canAccessSystem, normalizeAppRole, resolveLegacyAdminPath } from '../../lib/navigation'

type GuardProps = { children: ReactElement }

type AuthModel = { role?: string; must_change_password?: boolean } | null

export const AUTH_MODEL_REFRESH_INTERVAL_MS = 15_000

function useAuthModelRefresh() {
  const [, refreshGuard] = useReducer((value: number) => value + 1, 0)

  useEffect(() => {
    let active = true
    let refreshing = false

    const refresh = async () => {
      if (!pb.authStore.isValid || refreshing) return
      refreshing = true
      try {
        await pb.collection('users').authRefresh()
      } catch (error: unknown) {
        const status = (error as { status?: number })?.status
        // 短暂离线时保留现有会话；只有服务端明确拒绝凭据时才退出。
        if (status === 400 || status === 401 || status === 403) pb.authStore.clear()
      } finally {
        refreshing = false
        if (active) refreshGuard()
      }
    }

    const timer = window.setInterval(() => { void refresh() }, AUTH_MODEL_REFRESH_INTERVAL_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])
}

function mustChangePassword() {
  return Boolean((pb.authStore.model as AuthModel)?.must_change_password)
}

function authenticatedDestination() {
  return mustChangePassword() ? '/change-password' : '/app'
}

export function PrivateRoute({ children }: GuardProps) {
  useAuthModelRefresh()
  if (!pb.authStore.isValid) return <Navigate to="/login" replace />
  return mustChangePassword() ? <Navigate to="/change-password" replace /> : children
}

export function PublicOnlyRoute({ children }: GuardProps) {
  return pb.authStore.isValid ? <Navigate to={authenticatedDestination()} replace /> : children
}

export function PasswordChangeRoute({ children }: GuardProps) {
  useAuthModelRefresh()
  if (!pb.authStore.isValid) return <Navigate to="/login" replace />
  return mustChangePassword() ? children : <Navigate to="/app" replace />
}

export function ManagerRoute({ children }: GuardProps) {
  useAuthModelRefresh()
  if (!pb.authStore.isValid) return <Navigate to="/login" replace />
  if (mustChangePassword()) return <Navigate to="/change-password" replace />
  const role = normalizeAppRole((pb.authStore.model as { role?: string } | null)?.role)
  return role === 'manager' || role === 'admin' ? children : <Navigate to="/app" replace />
}

export function AdminOnlyRoute({ children }: GuardProps) {
  useAuthModelRefresh()
  if (!pb.authStore.isValid) return <Navigate to="/login" replace />
  if (mustChangePassword()) return <Navigate to="/change-password" replace />
  const role = normalizeAppRole((pb.authStore.model as { role?: string } | null)?.role)
  return canAccessSystem(role) ? children : <Navigate to="/app" replace />
}

export function DefaultRedirect() {
  return pb.authStore.isValid
    ? <Navigate to={authenticatedDestination()} replace />
    : <Navigate to="/login" replace />
}

export function LegacyAdminRedirect() {
  const location = useLocation()
  if (!pb.authStore.isValid) return <Navigate to="/login" replace />
  const tab = new URLSearchParams(location.search).get('tab')
  return <Navigate to={resolveLegacyAdminPath(tab)} replace />
}
