import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

/**
 * Android 原生 Capacitor Plugin — 启动/停止前台服务，
 * 服务内部用 OkHttp SSE 维持 PocketBase Realtime 长连接。
 *
 * Web 平台不实现（Web 用 PB JS SDK 的 pb.collection.subscribe）。
 */
export interface RealtimePlugin {
  /** 启动前台服务（必须先登录拿到 token） */
  start(opts: { baseUrl: string; token: string }): Promise<void>
  /** 停止前台服务（登出前调用） */
  stop(): Promise<void>
  /** Token 刷新时调用，避免重启整个 Service */
  updateToken(opts: { token: string }): Promise<void>

  addListener(
    eventName: 'notification',
    cb: (e: { type: 'message'; topic: string; action: string; record: string }) => void,
  ): Promise<PluginListenerHandle>

  addListener(
    eventName: 'status',
    cb: (e: { type: 'connected' | 'failed'; reason?: string }) => void,
  ): Promise<PluginListenerHandle>
}

export const Realtime = registerPlugin<RealtimePlugin>('Realtime')
