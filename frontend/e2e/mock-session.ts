import type { Page } from '@playwright/test'
import { stat } from 'node:fs/promises'
import path from 'node:path'

export type MockRole = 'employee' | 'manager' | 'admin'

export async function installStaticApp(page: Page) {
  const distRoot = path.resolve(process.cwd(), 'dist')
  const indexPath = path.join(distRoot, 'index.html')

  await page.route('http://app.local/**', async route => {
    const url = new URL(route.request().url())
    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
    const filePath = path.resolve(distRoot, relativePath)

    if (!filePath.startsWith(distRoot)) {
      await route.fulfill({ status: 403, body: 'Forbidden' })
      return
    }

    try {
      const info = await stat(filePath)
      if (info.isFile()) {
        await route.fulfill({ status: 200, path: filePath })
        return
      }
    } catch {
      // BrowserRouter 路由回退到 index.html。
    }

    await route.fulfill({ status: 200, contentType: 'text/html', path: indexPath })
  })
}

function base64Url(value: object) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function fakeToken() {
  return `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url({ exp: Math.floor(Date.now() / 1000) + 3600 })}.mock`
}

export async function installMockSession(page: Page, role: MockRole) {
  const model = {
    id: `${role}-1`,
    collectionId: 'users',
    collectionName: 'users',
    username: `${role}_tester`,
    name: role === 'admin' ? '测试管理员' : role === 'manager' ? '测试经理' : '测试员工',
    role,
  }
  const auth = JSON.stringify({ token: fakeToken(), model })

  await page.addInitScript(value => {
    window.sessionStorage.setItem('pocketbase_auth', value)
    window.localStorage.removeItem('rememberMe')
  }, auth)

  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())

    if (url.pathname.endsWith('/api/health')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, message: 'API is healthy.' }) })
      return
    }

    if (url.pathname.endsWith('/api/realtime')) {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'event: PB_CONNECT\ndata: {"clientId":"mock-client"}\n\n',
      })
      return
    }

    if (route.request().method() === 'GET' && url.pathname.includes('/records/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(model) })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ page: 1, perPage: 30, totalItems: 0, totalPages: 0, items: [] }),
    })
  })
}
