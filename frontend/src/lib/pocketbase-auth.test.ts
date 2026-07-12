import { beforeEach, describe, expect, it } from 'vitest'
import { HybridAuthStore } from './pocketbase'

const key = 'pocketbase_auth'
const model = { id: 'user-1', collectionId: '_pb_users_auth_', collectionName: 'users', created: '', updated: '' }

describe('HybridAuthStore', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('persists remembered sessions and clears the short-lived copy', () => {
    localStorage.setItem('rememberMe', '1')
    localStorage.setItem(key, JSON.stringify({ token: 'token-1', model }))
    sessionStorage.setItem(key, JSON.stringify({ token: 'token-1', model }))
    const store = new HybridAuthStore()

    expect(store.token).toBe('token-1')
    expect(localStorage.getItem(key)).toContain('token-1')
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('keeps an explicitly temporary session out of localStorage', () => {
    localStorage.setItem('rememberMe', '0')
    sessionStorage.setItem(key, JSON.stringify({ token: 'token-2', model }))
    const store = new HybridAuthStore()

    expect(store.token).toBe('token-2')
    expect(sessionStorage.getItem(key)).toContain('token-2')
    expect(localStorage.getItem(key)).toBeNull()
  })

  it('clears both stores on logout', () => {
    localStorage.setItem('rememberMe', '1')
    const store = new HybridAuthStore()
    store.save('token-3', model)
    sessionStorage.setItem(key, 'stale')
    store.clear()

    expect(localStorage.getItem(key)).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('does not restore a stale persistent token after the user opted out', () => {
    localStorage.setItem('rememberMe', '0')
    localStorage.setItem(key, JSON.stringify({ token: 'stale-token', model }))
    const store = new HybridAuthStore()

    expect(store.token).toBe('')
    expect(localStorage.getItem(key)).toBeNull()
  })
})
