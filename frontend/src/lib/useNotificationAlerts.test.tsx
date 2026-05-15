import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// ---- hoisted mocks ----
const mockAuthStore = vi.hoisted(() => ({
  model: { id: 'user-1' } as { id: string } | null,
}))
const mockUnreadHook = vi.hoisted(() => vi.fn())
const mockPlaySound = vi.hoisted(() => vi.fn())
const mockWarmUp = vi.hoisted(() => vi.fn())
const mockScheduleNotif = vi.hoisted(() => vi.fn())
const mockRequestPerm = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockToastShow = vi.hoisted(() => vi.fn())

vi.mock('./pocketbase', () => ({
  pb: { authStore: mockAuthStore },
}))
vi.mock('./api', () => ({
  useUnreadNotificationCount: mockUnreadHook,
}))
vi.mock('./notificationSound', () => ({
  playNotificationSound: mockPlaySound,
  warmUpAudio: mockWarmUp,
}))
vi.mock('./nativeNotifications', () => ({
  scheduleNewMessageNotification: mockScheduleNotif,
  requestNativeNotificationPermission: mockRequestPerm,
}))
vi.mock('antd-mobile', () => ({
  Toast: { show: mockToastShow },
}))

// Import after mocks are set up
import { useNotificationAlerts } from './useNotificationAlerts'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

beforeEach(() => {
  mockUnreadHook.mockReset()
  mockPlaySound.mockReset()
  mockScheduleNotif.mockReset()
  mockToastShow.mockReset()
  mockRequestPerm.mockReset().mockResolvedValue(undefined)
  mockAuthStore.model = { id: 'user-1' }

  // mock browser APIs — Notification must be usable with `new`
  const NotificationMock = vi.fn(function (this: object) {
    // constructor stub
    return this
  }) as unknown as typeof Notification & {
    permission: NotificationPermission
    requestPermission: () => Promise<NotificationPermission>
  }
  NotificationMock.permission = 'granted'
  NotificationMock.requestPermission = vi.fn().mockResolvedValue('granted')
  Object.defineProperty(global, 'Notification', {
    writable: true,
    configurable: true,
    value: NotificationMock,
  })

  Object.defineProperty(navigator, 'vibrate', {
    writable: true,
    configurable: true,
    value: vi.fn(),
  })

  // spy on dispatchEvent so we can assert the custom event was fired
  vi.spyOn(window, 'dispatchEvent')
})

describe('useNotificationAlerts', () => {
  it('does not fire alerts on first render (baseline establishment)', () => {
    mockUnreadHook.mockReturnValue({ data: 5, isFetched: true })
    renderHook(() => useNotificationAlerts(), { wrapper })
    expect(mockPlaySound).not.toHaveBeenCalled()
    expect(mockScheduleNotif).not.toHaveBeenCalled()
    expect(navigator.vibrate).not.toHaveBeenCalled()
    expect(mockToastShow).not.toHaveBeenCalled()
  })

  it('fires alerts when unread count increases', async () => {
    let unread = 3
    mockUnreadHook.mockImplementation(() => ({ data: unread, isFetched: true }))
    const { rerender } = renderHook(() => useNotificationAlerts(), { wrapper })
    // baseline registered with unread=3
    unread = 5
    rerender()
    await waitFor(() => {
      expect(mockPlaySound).toHaveBeenCalledTimes(1)
      expect(mockScheduleNotif).toHaveBeenCalledWith(2)
      expect(navigator.vibrate).toHaveBeenCalledWith([200, 100, 200, 100, 200])
    })
  })

  it('does not fire when unread count decreases (mark as read)', async () => {
    let unread = 5
    mockUnreadHook.mockImplementation(() => ({ data: unread, isFetched: true }))
    const { rerender } = renderHook(() => useNotificationAlerts(), { wrapper })
    unread = 2
    rerender()
    // Wait a tick to let any effects run
    await new Promise(r => setTimeout(r, 50))
    expect(mockPlaySound).not.toHaveBeenCalled()
    expect(mockScheduleNotif).not.toHaveBeenCalled()
  })

  it('dispatches notify-flash custom event on increase', async () => {
    let unread = 0
    mockUnreadHook.mockImplementation(() => ({ data: unread, isFetched: true }))
    const { rerender } = renderHook(() => useNotificationAlerts(), { wrapper })
    unread = 1
    rerender()
    await waitFor(() => {
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'notify-flash' })
      )
    })
  })

  it('returns current unreadCount', () => {
    mockUnreadHook.mockReturnValue({ data: 7, isFetched: true })
    const { result } = renderHook(() => useNotificationAlerts(), { wrapper })
    expect(result.current.unreadCount).toBe(7)
  })
})
