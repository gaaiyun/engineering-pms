import { Capacitor } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import { Realtime } from '../native/realtime'
import { pb } from './pocketbase'
import { invalidateNotificationQueries } from './api'
import type { QueryClient } from '@tanstack/react-query'

/**
 * React/JS 端单例桥接器 — 管理 Realtime 原生服务的生命周期，
 * 把后台推送事件转成 React Query 缓存失效。
 *
 * 关键不变量：
 *   - 只有 Android 原生平台才启动 Service；Web 浏览器走 PB JS SDK 的 pb.realtime.subscribe
 *   - login → start；logout → stop
 *   - token 刷新（pb.authStore.onChange）→ updateToken（不重启 Service）
 *
 * 调用：
 *   import { initRealtimeBridge } from './realtimeBridge'
 *   const handle = initRealtimeBridge(queryClient)
 *   handle.stop()  // 卸载时
 */

let notifListener: PluginListenerHandle | null = null
let statusListener: PluginListenerHandle | null = null
let authUnsub: (() => void) | null = null
let started = false
let lastToken: string | null = null

function isAndroid() {
  return Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform()
}

function getBaseUrl(): string {
  // pb 实例的 baseUrl/baseURL 已经在 pocketbase.ts 配置好
  const inst = pb as unknown as { baseUrl?: string; baseURL?: string }
  const base = inst.baseUrl ?? inst.baseURL ?? ''
  return base.replace(/\/+$/, '')
}

async function startService() {
  if (!isAndroid()) return
  const token = pb.authStore.token
  if (!token || !pb.authStore.isValid) {
    console.info('[realtimeBridge] skip start — auth not valid')
    return
  }
  const baseUrl = getBaseUrl()
  if (!baseUrl) {
    console.warn('[realtimeBridge] missing baseUrl')
    return
  }
  try {
    await Realtime.start({ baseUrl, token })
    lastToken = token
    started = true
    console.info('[realtimeBridge] service started')
  } catch (e) {
    console.warn('[realtimeBridge] start failed', e)
  }
}

async function stopService() {
  if (!isAndroid() || !started) return
  try {
    await Realtime.stop()
  } catch (e) {
    console.warn('[realtimeBridge] stop failed', e)
  }
  started = false
  lastToken = null
}

async function maybeUpdateToken() {
  if (!isAndroid() || !started) return
  const t = pb.authStore.token
  if (!t || t === lastToken) return
  try {
    await Realtime.updateToken({ token: t })
    lastToken = t
    console.info('[realtimeBridge] token updated')
  } catch (e) {
    console.warn('[realtimeBridge] updateToken failed', e)
  }
}

export function initRealtimeBridge(queryClient: QueryClient): { stop: () => void } {
  if (!isAndroid()) {
    return { stop: () => {} }
  }

  // 监听 notification 事件 → 失效缓存（让 useNotificationAlerts 触发本地提示）
  Realtime.addListener('notification', () => {
    try {
      const userId = pb.authStore.model?.id
      if (userId) invalidateNotificationQueries(queryClient, [userId])
    } catch (err) {
      console.warn('[realtimeBridge] invalidate failed', err)
    }
  }).then((h) => { notifListener = h }).catch(() => {})

  Realtime.addListener('status', (e) => {
    console.info('[realtimeBridge] status', e)
  }).then((h) => { statusListener = h }).catch(() => {})

  // 登录态变化：login → start，logout → stop，token 续期 → updateToken
  const handler = () => {
    if (pb.authStore.isValid) {
      if (!started) {
        void startService()
      } else {
        void maybeUpdateToken()
      }
    } else {
      void stopService()
    }
  }
  authUnsub = pb.authStore.onChange(handler, false)

  // 初始触发一次
  if (pb.authStore.isValid && !started) {
    void startService()
  }

  return {
    stop: () => {
      try { authUnsub?.() } catch {}
      try { notifListener?.remove() } catch {}
      try { statusListener?.remove() } catch {}
      authUnsub = null
      notifListener = null
      statusListener = null
      void stopService()
    },
  }
}

/** 退出登录前主动停掉，确保旧 token 不残留 */
export async function stopRealtimeForLogout(): Promise<void> {
  await stopService()
}
