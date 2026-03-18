/**
 * 原生系统通知封装
 * 在 Capacitor 原生 App 中使用 LocalNotifications 插件
 * 实现系统通知栏弹窗 + 系统提示音
 */

import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

let permissionGranted = false

/**
 * 请求本地通知权限（仅原生平台）
 * 应在应用启动或首次进入首页时调用
 */
export async function requestNativeNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false

  try {
    const status = await LocalNotifications.checkPermissions()
    if (status.display === 'granted') {
      permissionGranted = true
      return true
    }

    const result = await LocalNotifications.requestPermissions()
    permissionGranted = result.display === 'granted'
    return permissionGranted
  } catch (e) {
    console.warn('请求通知权限失败', e)
    return false
  }
}

/**
 * 发送系统本地通知（即时触发）
 * 会在系统通知栏弹出 + 播放系统提示音
 */
export async function scheduleNewMessageNotification(count: number): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  if (!permissionGranted) {
    // 尝试再请求一次
    const ok = await requestNativeNotificationPermission()
    if (!ok) return
  }

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Date.now() % 2147483647, // Android 要求 32 位 int
          title: '工程结算管理',
          body: `您有 ${count} 条新消息`,
          // sound / smallIcon / largeIcon 不指定，使用系统默认通知音和应用图标
        },
      ],
    })
  } catch (e) {
    console.warn('发送本地通知失败', e)
  }
}
