import PocketBase, { BaseAuthStore } from 'pocketbase'
import type { RecordModel } from 'pocketbase'

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

/**
 * Bug fix C2（Agent D v2 HIGH 安全 — 终极方案）：
 * 子类化 BaseAuthStore，根据 localStorage.rememberMe 决定 token 存哪儿：
 *   - rememberMe=1 → localStorage（跨会话保留）
 *   - 否则        → sessionStorage（关浏览器即失效）
 *
 * 修复路径：
 *   v1 (2807a50): 登录后立即删 localStorage → PB SDK 失去 token → S1/S6 FAIL，回滚
 *   v2: beforeunload handler 清 token → Playwright page.goto 触发 → 同 v1 失败
 *   v3 (本版): 子类化 AuthStore，从根上决定写入位置 → SDK 始终从对的地方读
 *
 * 关键点：
 *   - 构造时根据 rememberMe 决定 storage backend，但每次 onChange 时**重新检查**
 *     （因为 Login.tsx 在 authWithPassword 后才 set rememberMe）
 *   - load() 同时从两个 storage 找已有 token（兼容老用户跨升级）
 *   - save() 写入当前判定的 storage，**清掉另一个**避免双份
 *   - clear() 两个都清（彻底登出）
 */
const STORAGE_KEY = 'pocketbase_auth'

class HybridAuthStore extends BaseAuthStore {
  private getBackend(): Storage {
    if (typeof window === 'undefined') {
      // SSR / non-browser fallback
      return {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      } as Storage
    }
    const remembered = window.localStorage.getItem('rememberMe') === '1'
    return remembered ? window.localStorage : window.sessionStorage
  }

  private getOtherBackend(): Storage | null {
    if (typeof window === 'undefined') return null
    const remembered = window.localStorage.getItem('rememberMe') === '1'
    return remembered ? window.sessionStorage : window.localStorage
  }

  constructor() {
    super()
    if (typeof window === 'undefined') return
    // 初始化时尝试从 localStorage 和 sessionStorage 任一找到现有 token
    // （兼容：老用户曾用 localStorage、临时会话用 sessionStorage）
    const fromLocal = window.localStorage.getItem(STORAGE_KEY)
    const fromSession = window.sessionStorage.getItem(STORAGE_KEY)
    const raw = fromSession || fromLocal // 优先 session（更短期有效）
    if (raw) {
      try {
        const data = JSON.parse(raw)
        if (data && data.token && data.model) {
          super.save(data.token, data.model)
        } else if (data && data.token && data.record) {
          // 兼容旧 PB SDK 字段名 'record'
          super.save(data.token, data.record)
        }
      } catch {
        // ignore corrupted storage
      }
    }
  }

  save(token: string, model: RecordModel | null) {
    super.save(token, model)
    if (typeof window === 'undefined') return
    const payload = JSON.stringify({ token, model })
    try {
      this.getBackend().setItem(STORAGE_KEY, payload)
      // 清另一个 backend 防双份（核心安全约束）
      const other = this.getOtherBackend()
      if (other) other.removeItem(STORAGE_KEY)
    } catch (e) {
      // localStorage quota / sessionStorage disabled — 静默失败但内存中保有 token
      console.warn('[HybridAuthStore] save to storage failed:', e)
    }
  }

  clear() {
    super.clear()
    if (typeof window === 'undefined') return
    try {
      window.localStorage.removeItem(STORAGE_KEY)
      window.sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }
}

export const pb = new PocketBase(PB_URL, new HybridAuthStore())

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

// 注：以前在这里检查 rememberMe → pb.authStore.clear() 的兜底逻辑现在不需要了。
// HybridAuthStore 的构造函数已经从正确的 backend 读 token；如果用户上次没勾
// rememberMe 但 sessionStorage 已经被清（关浏览器），构造时也读不到 → 自然
// "未登录"状态。

export const isUserLoggedIn = () => pb.authStore.isValid

export const logout = () => {
  pb.authStore.clear()
  if (typeof window !== 'undefined') {
    localStorage.removeItem('rememberMe')
    // STORAGE_KEY 已经在 clear() 里清
  }
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
