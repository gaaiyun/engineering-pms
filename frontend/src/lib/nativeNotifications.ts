/**
 * 原生系统通知封装
 * 在 Capacitor 原生 App 中使用 LocalNotifications 插件
 * 实现系统通知栏弹窗 + 系统提示音
 *
 * 注意：
 * - 这里负责的是“前台已启动 App 的本地提醒桥接”
 * - 它不是后台真推送实现，不覆盖 App 被系统杀掉后的通知下发
 */

import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

let permissionGranted = false

const ANDROID_CHANNEL_ID = 'engineering_pms_default'

async function ensureAndroidChannel(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await LocalNotifications.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: '工程结算管理',
      description: '任务与消息提醒',
      importance: 5,
      vibration: true,
    })
  } catch (e) {
    console.warn('创建通知渠道失败（可忽略）', e)
  }
}

/**
 * 请求本地通知权限（仅原生平台）
 * 应在应用启动或首次进入首页时调用
 */
export async function requestNativeNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false

  try {
    await ensureAndroidChannel()
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
    await ensureAndroidChannel()
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Date.now() % 2147483647, // Android 要求 32 位 int
          title: '工程结算管理',
          body: `您有 ${count} 条新消息`,
          channelId: ANDROID_CHANNEL_ID,
        },
      ],
    })
  } catch (e) {
    console.warn('发送本地通知失败', e)
  }
}
