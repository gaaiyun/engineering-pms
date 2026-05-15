import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBreakpoint, type Breakpoint } from './useBreakpoint'

// matchMedia 在 happy-dom 中默认不存在 — 必须 mock
type Listener = (e: { matches: boolean }) => void

class FakeMQL {
  matches: boolean
  private listeners: Listener[] = []
  constructor(matches: boolean) { this.matches = matches }
  addEventListener(_: string, cb: Listener) { this.listeners.push(cb) }
  removeEventListener(_: string, cb: Listener) {
    this.listeners = this.listeners.filter(l => l !== cb)
  }
  trigger(matches: boolean) {
    this.matches = matches
    this.listeners.forEach(l => l({ matches }))
  }
}

let fakeQueries: Map<string, FakeMQL>

beforeEach(() => {
  fakeQueries = new Map()
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => {
      const existing = fakeQueries.get(query)
      if (existing) return existing
      const mql = new FakeMQL(false)
      fakeQueries.set(query, mql)
      return mql
    }),
  })
})

afterEach(() => {
  fakeQueries.clear()
})

function setWindowWidth(width: number) {
  // 触发媒体查询的匹配结果变化
  const desktop = fakeQueries.get('(min-width: 1024px)')
  const tablet = fakeQueries.get('(min-width: 769px)')
  if (desktop) desktop.trigger(width >= 1024)
  if (tablet) tablet.trigger(width >= 769)
}

describe('useBreakpoint', () => {
  it('returns "mobile" when both queries do not match', () => {
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toBe<Breakpoint>('mobile')
  })

  it('returns "tablet" when tablet query matches but desktop does not', () => {
    const { result } = renderHook(() => useBreakpoint())
    act(() => setWindowWidth(800))
    expect(result.current).toBe<Breakpoint>('tablet')
  })

  it('returns "desktop" when desktop query matches', () => {
    const { result } = renderHook(() => useBreakpoint())
    act(() => setWindowWidth(1280))
    expect(result.current).toBe<Breakpoint>('desktop')
  })

  it('updates when window resizes from mobile to desktop', () => {
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toBe('mobile')
    act(() => setWindowWidth(1920))
    expect(result.current).toBe('desktop')
  })

  it('cleans up listeners on unmount', () => {
    const { unmount } = renderHook(() => useBreakpoint())
    const mql = fakeQueries.get('(min-width: 1024px)')!
    const removeSpy = vi.spyOn(mql, 'removeEventListener')
    unmount()
    expect(removeSpy).toHaveBeenCalled()
  })
})
