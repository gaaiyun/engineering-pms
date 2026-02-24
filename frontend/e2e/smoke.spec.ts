import { test, expect } from '@playwright/test'

const PB_URL = 'http://127.0.0.1:8090'
const MANAGER = { username: 'zhang_manager', password: '12345678' }

/** 通过 API 获取 auth token，注入 localStorage 模拟登录 */
async function loginViaAPI(page: import('@playwright/test').Page, user = MANAGER) {
  const res = await fetch(`${PB_URL}/api/collections/users/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: user.username, password: user.password }),
  })
  const data = await res.json()
  const authData = JSON.stringify({ token: data.token, record: data.record })
  await page.addInitScript((val) => { localStorage.setItem('pocketbase_auth', val) }, authData)
}

test.describe('登录页', () => {
  test('加载登录页面', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=工程结算管理')).toBeVisible()
    await expect(page.locator('text=登 录')).toBeVisible()
  })

  test('显示服务器连接状态', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=服务器已连接')).toBeVisible({ timeout: 10000 })
  })
})

test.describe('经理核心页面', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page)
  })

  test('经理工作台', async ({ page }) => {
    await page.goto('/manager')
    await expect(page.locator('text=经理工作台')).toBeVisible({ timeout: 10000 })
  })

  test('项目列表', async ({ page }) => {
    await page.goto('/my-projects')
    await expect(page.locator('text=项目列表')).toBeVisible({ timeout: 10000 })
  })

  test('审核中心', async ({ page }) => {
    await page.goto('/review-center')
    await expect(page.locator('text=待复核')).toBeVisible({ timeout: 10000 })
  })

  test('消息中心', async ({ page }) => {
    await page.goto('/notifications')
    await expect(page.locator('text=消息')).toBeVisible({ timeout: 10000 })
  })

  test('设置页面', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('text=系统设置')).toBeVisible({ timeout: 10000 })
  })
})
