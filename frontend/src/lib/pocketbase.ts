import PocketBase from 'pocketbase'

// 线上 PocketBase 地址（APK / localhost 均走此地址）
const PRODUCTION_PB_URL = 'http://127.0.0.1:8090'

// 连接策略（按优先级）：
// 1) 构建时注入：VITE_PB_URL（适用于 App 打包/多环境）
// 2) localStorage 覆盖：pb_url（运行时临时调试）
// 3) localhost / 127.0.0.1 → 线上地址（Capacitor WebView 和本地开发共用）
// 4) https 站点 → 同域 /pb（Nginx 反代）
// 5) http 站点 → 同域名 :8090

function getPocketBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_PB_URL || '').trim()
  if (envUrl) return envUrl

  if (typeof window !== 'undefined') {
    const storedUrl = (window.localStorage.getItem('pb_url') || '').trim()
    if (storedUrl) return storedUrl

    const { protocol, hostname, origin } = window.location
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'

    // Capacitor WebView 以 http://localhost 加载，直接走线上地址
    if (isLocalhost) return PRODUCTION_PB_URL

    if (protocol === 'https:') return `${origin}/pb`

    return `${protocol}//${hostname}:8090`
  }

  return 'http://127.0.0.1:8090'
}

export const PB_URL = getPocketBaseUrl()

export const pb = new PocketBase(PB_URL)

/**
 * 统一解析 PocketBase JS SDK 抛出的错误文案。
 * `ClientResponseError` 的响应体在 `err.response`（与 `err.data` 同义），主消息为 `response.message`。
 */
export function getPocketBaseErrorMessage(err: unknown, fallback = '操作失败'): string {
  if (err == null) return fallback

  const e = err as {
    message?: string
    response?: Record<string, unknown>
    data?: Record<string, unknown>
  }

  const body = (e.response && typeof e.response === 'object' ? e.response : null)
    ?? (e.data && typeof e.data === 'object' ? e.data : null)

  const top = body && typeof body.message === 'string' ? body.message.trim() : ''
  if (top) return top

  if (typeof e.message === 'string' && e.message.trim()) return e.message.trim()

  // 字段级校验：{ data: { field: { message } } }
  const nested = body?.data
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const parts: string[] = []
    for (const [key, val] of Object.entries(nested as Record<string, unknown>)) {
      if (val && typeof val === 'object' && 'message' in val) {
        const m = (val as { message?: unknown }).message
        if (typeof m === 'string' && m.trim()) parts.push(`${key}: ${m.trim()}`)
      }
    }
    if (parts.length) return parts.join('；')
  }

  return fallback
}

// 未勾选"记住登录"时，关闭浏览器后清除 token
if (typeof window !== 'undefined') {
  const remembered = localStorage.getItem('rememberMe') === '1'
  if (!remembered && !sessionStorage.getItem('pocketbase_auth')) {
    pb.authStore.clear()
  }
}

export const isUserLoggedIn = () => pb.authStore.isValid

export const logout = () => {
  pb.authStore.clear()
  localStorage.removeItem('rememberMe')
  sessionStorage.removeItem('pocketbase_auth')
}

// ========== 实时数据订阅 ==========
let _subscribed = false

export function subscribeToChanges(invalidate: (keys: string[][]) => void) {
  if (_subscribed || !pb.authStore.isValid) return
  _subscribed = true

  const collections = ['tasks', 'projects', 'handoffs', 'notifications', 'audit_logs', 'comments']
  
  const keyMap: Record<string, string[][]> = {
    tasks: [['tasks'], ['projects'], ['notifications'], ['audit_logs']],
    projects: [['projects'], ['notifications']],
    handoffs: [['handoffs'], ['notifications']],
    notifications: [['notifications']],
    audit_logs: [['audit_logs']],
    comments: [['comments']],
  }

  for (const col of collections) {
    try {
      pb.collection(col).subscribe('*', () => {
        invalidate(keyMap[col] || [[col]])
      })
    } catch { /* collection may not exist */ }
  }
}

export function unsubscribeAll() {
  try {
    pb.realtime.unsubscribe()
  } catch { /* ignore */ }
  _subscribed = false
}
