export type AppRole = 'employee' | 'manager' | 'admin'

export type RouteId =
  | 'workbench'
  | 'tasks'
  | 'projects'
  | 'reviews'
  | 'notifications'
  | 'me'
  | 'system'

export type AppSurface = 'compact' | 'sidebar-collapsed' | 'sidebar-expanded'

export type NavigationIconKey =
  | 'home'
  | 'tasks'
  | 'projects'
  | 'reviews'
  | 'notifications'
  | 'me'
  | 'system'

export interface NavItem {
  id: RouteId
  path: string
  label: string
  compactLabel: string
  iconKey: NavigationIconKey
  roles: readonly AppRole[]
}

export interface AppSurfaceInput {
  width: number
  isNative: boolean
  pointerCoarse: boolean
}

const ALL_ROLES: readonly AppRole[] = ['employee', 'manager', 'admin']
const MANAGER_ROLES: readonly AppRole[] = ['manager', 'admin']

const NAVIGATION: readonly NavItem[] = [
  { id: 'workbench', path: '/app', label: '工作台', compactLabel: '工作台', iconKey: 'home', roles: ALL_ROLES },
  { id: 'tasks', path: '/my-tasks', label: '我的任务', compactLabel: '任务', iconKey: 'tasks', roles: ALL_ROLES },
  { id: 'projects', path: '/my-projects', label: '我的项目', compactLabel: '项目', iconKey: 'projects', roles: ALL_ROLES },
  { id: 'reviews', path: '/review-center', label: '审核中心', compactLabel: '审核', iconKey: 'reviews', roles: MANAGER_ROLES },
  { id: 'notifications', path: '/notifications', label: '通知', compactLabel: '通知', iconKey: 'notifications', roles: ALL_ROLES },
  { id: 'me', path: '/me', label: '我的', compactLabel: '我的', iconKey: 'me', roles: ALL_ROLES },
  { id: 'system', path: '/system/users', label: '系统管理', compactLabel: '系统', iconKey: 'system', roles: ['admin'] },
]

const COMPACT_IDS: readonly RouteId[] = ['workbench', 'tasks', 'projects', 'notifications', 'me']

export function normalizeAppRole(role?: string | null): AppRole {
  const normalized = role?.trim().toLowerCase()
  if (normalized === 'admin' || normalized === 'manager') return normalized
  return 'employee'
}

export function canAccessSystem(role: AppRole): boolean {
  return role === 'admin'
}

export function getVisibleNavigation(role: AppRole, surface: AppSurface): NavItem[] {
  return NAVIGATION
    .filter(item => item.roles.includes(role))
    .filter(item => surface !== 'compact' || COMPACT_IDS.includes(item.id))
    .map(item => ({
      ...item,
      label: item.id === 'projects' && role !== 'employee' ? '项目管理' : item.label,
    }))
}

export function isNavigationItemActive(pathname: string, item: Pick<NavItem, 'id' | 'path'>): boolean {
  if (item.id === 'workbench') return pathname === '/app' || pathname.startsWith('/app/')
  if (item.id === 'tasks') return pathname === '/my-tasks' || pathname.startsWith('/task/')
  if (item.id === 'projects') return pathname === '/my-projects' || pathname.startsWith('/project/')
  if (item.id === 'me') return pathname === '/me' || pathname === '/settings'
  if (item.id === 'system') return pathname.startsWith('/system/')
  return pathname === item.path || pathname.startsWith(`${item.path}/`)
}

export function resolveAppSurface(input: AppSurfaceInput): AppSurface {
  if (input.isNative || input.pointerCoarse) return 'compact'
  if (input.width >= 1024) return 'sidebar-expanded'
  if (input.width >= 769) return 'sidebar-collapsed'
  return 'compact'
}

export function resolveLegacyAdminPath(tab: string | null): string {
  if (tab === 'projects' || tab === 'timeline') return '/my-projects'
  if (tab === 'users') return '/system/users'
  if (tab === 'ai') return '/system/ai'
  if (tab === 'profile') return '/me'
  return '/app'
}

const POST_LOGIN_PATH: Record<AppRole, string> = {
  employee: '/app',
  manager: '/app',
  admin: '/app',
}

export function getPostLoginPath(role: AppRole): string {
  return POST_LOGIN_PATH[role]
}
