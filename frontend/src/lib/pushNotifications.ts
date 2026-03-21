import { Capacitor } from '@capacitor/core'
import { PushNotifications, type Token } from '@capacitor/push-notifications'
import { pb, getPocketBaseErrorMessage } from './pocketbase'

const DEVICE_TOKENS_COLLECTION = 'device_tokens'
const DEVICE_ID_STORAGE_KEY = 'push_device_id'

let listenersBound = false

function isNativePushSupported() {
  return Capacitor.isNativePlatform()
}

function getCurrentUserId() {
  return pb.authStore.model?.id || ''
}

function getCurrentPlatform() {
  return Capacitor.getPlatform()
}

function getOrCreateDeviceId() {
  const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY)
  if (existing) return existing
  const created = `${getCurrentPlatform()}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, created)
  return created
}

function getDeviceName() {
  if (typeof navigator === 'undefined') return getCurrentPlatform()
  return navigator.userAgent.slice(0, 180)
}

async function findCurrentDeviceTokenRecord(userId: string) {
  const deviceId = getOrCreateDeviceId()
  const platform = getCurrentPlatform()
  try {
    return await pb.collection(DEVICE_TOKENS_COLLECTION).getFirstListItem(
      `user="${userId}" && device_id="${deviceId}" && platform="${platform}"`,
    )
  } catch {
    return null
  }
}

async function upsertDeviceToken(tokenValue: string) {
  const userId = getCurrentUserId()
  if (!userId) return

  const payload = {
    user: userId,
    platform: getCurrentPlatform(),
    device_id: getOrCreateDeviceId(),
    token: tokenValue,
    device_name: getDeviceName(),
    app_version: 'app-capacitor-v5',
    is_active: true,
    last_seen_at: new Date().toISOString(),
  }

  const existing = await findCurrentDeviceTokenRecord(userId)
  if (existing) {
    await pb.collection(DEVICE_TOKENS_COLLECTION).update(existing.id, payload)
    return
  }

  await pb.collection(DEVICE_TOKENS_COLLECTION).create(payload)
}

export async function deactivateCurrentDevicePushRegistration(userId = getCurrentUserId()) {
  if (!isNativePushSupported() || !userId) return

  const existing = await findCurrentDeviceTokenRecord(userId)
  if (existing) {
    await pb.collection(DEVICE_TOKENS_COLLECTION).update(existing.id, {
      is_active: false,
      last_seen_at: new Date().toISOString(),
    }).catch((error) => {
      console.warn('停用 device token 失败', getPocketBaseErrorMessage(error))
    })
  }

  await PushNotifications.unregister().catch((error) => {
    console.warn('注销 PushNotifications 失败', error)
  })
}

function bindPushListeners() {
  if (listenersBound || !isNativePushSupported()) return
  listenersBound = true

  PushNotifications.addListener('registration', (token: Token) => {
    void upsertDeviceToken(token.value).catch((error) => {
      console.warn('保存 push token 失败', getPocketBaseErrorMessage(error))
    })
  })

  PushNotifications.addListener('registrationError', (error) => {
    console.warn('Push 注册失败', error)
  })

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.info('收到系统 push', notification)
  })

  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.info('处理 push 点击', action)
  })
}

export async function syncPushRegistrationForCurrentUser() {
  if (!isNativePushSupported() || !pb.authStore.isValid || !getCurrentUserId()) return false

  bindPushListeners()

  try {
    const permission = await PushNotifications.requestPermissions()
    if (permission.receive !== 'granted') {
      console.warn('Push 通知权限未授予')
      return false
    }

    await PushNotifications.register()
    return true
  } catch (error) {
    console.warn('初始化 Push 注册失败', getPocketBaseErrorMessage(error))
    return false
  }
}
