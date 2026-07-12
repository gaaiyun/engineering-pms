import PocketBase, { BaseAuthStore } from 'pocketbase'
import type { RecordModel } from 'pocketbase'
import { Capacitor } from '@capacitor/core'

const LOCAL_PB_URL = 'http://127.0.0.1:8090'
const NATIVE_CONFIGURATION_REQUIRED_URL = 'https://pocketbase.invalid'

type BrowserLocationLike = Pick<Location, 'protocol' | 'hostname' | 'origin'>

type ResolvePocketBaseUrlOptions = {
  envUrl?: string
  storedUrl?: string
  location?: BrowserLocationLike
  isNative?: boolean
}

// 连接策略：
// 1) localhost / 127.0.0.1：允许 localStorage.pb_url 临时覆盖，便于本地审计/切换临时 PB
// 2) 构建时注入：VITE_PB_URL（适用于 Web、APK 和多环境）
// 3) 非本地 Web：默认使用同源 /pb
// 4) Capacitor 必须在构建时注入完整 URL；缺失时连接显式无效域名，避免误连设备 localhost 或旧服务器
export function resolvePocketBaseUrl(options: ResolvePocketBaseUrlOptions): string {
  const envUrl = (options.envUrl || '').trim()
  const storedUrl = (options.storedUrl || '').trim()
  const location = options.location
  const hostname = location?.hostname || ''
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'

  if (options.isNative) return envUrl || NATIVE_CONFIGURATION_REQUIRED_URL
  if (isLocalhost && storedUrl) return storedUrl
  if (envUrl) return envUrl

  if (location) {
    if (isLocalhost) return LOCAL_PB_URL
    return `${location.origin.replace(/\/$/, '')}/pb`
  }

  return LOCAL_PB_URL
}

function getPocketBaseUrl(): string {
  return resolvePocketBaseUrl({
    envUrl: import.meta.env.VITE_PB_URL,
    storedUrl: typeof window !== 'undefined' ? window.localStorage.getItem('pb_url') || '' : '',
    location: typeof window !== 'undefined' ? window.location : undefined,
    isNative: Capacitor.isNativePlatform(),
  })
}

export const PB_URL = getPocketBaseUrl()

/**
 * 子类化 BaseAuthStore，根据 localStorage.rememberMe 决定 token 存储位置：
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

export class HybridAuthStore extends BaseAuthStore {
  constructor() {
    super()
    if (typeof window === 'undefined') return

    const fromLocal = window.localStorage.getItem(STORAGE_KEY)
    const fromSession = window.sessionStorage.getItem(STORAGE_KEY)
    const persistent = this.shouldPersist()
    const explicitChoice = window.localStorage.getItem('rememberMe')
    const raw = Capacitor.isNativePlatform()
      ? (fromLocal || fromSession)
      : explicitChoice === '1'
        ? fromLocal
        : explicitChoice === '0'
          ? fromSession
          : persistent
            ? (fromLocal || fromSession)
            : (fromSession || fromLocal)
    if (!raw) {
      if (explicitChoice === '0') window.localStorage.removeItem(STORAGE_KEY)
      if (explicitChoice === '1') window.sessionStorage.removeItem(STORAGE_KEY)
      return
    }

    try {
      const data = JSON.parse(raw)
      const model = data?.model || data?.record
      if (data?.token && model) {
        super.save(data.token, model)
        // 将旧版本或另一种会话策略留下的凭据迁移到当前选择的存储。
        this.getBackend().setItem(STORAGE_KEY, JSON.stringify({ token: data.token, model }))
        this.getOtherBackend()?.removeItem(STORAGE_KEY)
      }
    } catch {
      this.getBackend().removeItem(STORAGE_KEY)
    }
  }

  private shouldPersist(): boolean {
    if (Capacitor.isNativePlatform()) return true
    // 默认保持登录；用户明确取消时才使用 sessionStorage。
    return window.localStorage.getItem('rememberMe') !== '0'
  }

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
    return this.shouldPersist() ? window.localStorage : window.sessionStorage
  }

  private getOtherBackend(): Storage | null {
    if (typeof window === 'undefined') return null
    return this.shouldPersist() ? window.sessionStorage : window.localStorage
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

  const top = body && typeof body.message === 'string' ? body.message.trim() : ''
  if (top) return top

  if (typeof e.message === 'string' && e.message.trim()) return e.message.trim()

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
