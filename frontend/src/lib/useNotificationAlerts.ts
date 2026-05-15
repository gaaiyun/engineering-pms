/**
 * 全局通知提醒 hook
 *
 * 集中处理：提示音、Toast、振动、系统通知、红边闪烁。
 * 在 App 顶层挂载，确保无论用户在 /app 还是 /admin 都能收到提醒。
 */
import { useEffect, useRef, useCallback } from 'react'
import { Toast } from 'antd-mobile'
import { IoNotificationsOutline } from 'react-icons/io5'
import { pb } from './pocketbase'
import { useUnreadNotificationCount } from './api'
import { playNotificationSound, warmUpAudio } from './notificationSound'
import { requestNativeNotificationPermission, scheduleNewMessageNotification } from './nativeNotifications'
import React from 'react'

export function useNotificationAlerts() {
  const userId = pb.authStore.model?.id || ''
  const { data: unreadCount = 0, isFetched } = useUnreadNotificationCount(userId)
  const prevUnreadRef = useRef<number | null>(null)
  const audioWarmedUp = useRef(false)

  useEffect(() => {
    prevUnreadRef.current = null
  }, [userId])

  const warmUp = useCallback(() => {
    if (audioWarmedUp.current) return
    warmUpAudio()
    audioWarmedUp.current = true
  }, [])

  useEffect(() => {
    const handler = () => {
      warmUp()
      window.removeEventListener('click', handler)
      window.removeEventListener('touchstart', handler)
    }
    window.addEventListener('click', handler)
    window.addEventListener('touchstart', handler)
    return () => {
      window.removeEventListener('click', handler)
      window.removeEventListener('touchstart', handler)
    }
  }, [warmUp])

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    requestNativeNotificationPermission()
  }, [])

  useEffect(() => {
    if (!isFetched || !userId) return
    if (prevUnreadRef.current === null) {
      prevUnreadRef.current = unreadCount
      return
    }
    if (unreadCount > prevUnreadRef.current) {
      const newCount = unreadCount - prevUnreadRef.current

      playNotificationSound()
      scheduleNewMessageNotification(newCount)

      Toast.show({
        content: React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15 },
        },
          React.createElement(IoNotificationsOutline, { size: 20, color: '#fff', 'aria-hidden': true }),
          React.createElement('span', null, `收到 ${newCount} 条新消息`),
        ),
        position: 'top',
        duration: 6000,
        maskStyle: { background: 'transparent' },
      })

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('工程结算管理', { body: `您有 ${newCount} 条新消息`, icon: '/favicon.ico', tag: 'new-msg' })
      }

      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200, 100, 200])
      }

      window.dispatchEvent(new CustomEvent('notify-flash'))
    }
    prevUnreadRef.current = unreadCount
  }, [unreadCount, isFetched, userId])

  return { unreadCount }
}
