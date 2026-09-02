import { test, expect } from '@playwright/test'
import { installMockSession, installStaticApp } from './mock-session'

test.beforeEach(async ({ page }) => {
  await installStaticApp(page)
})

test.describe('登录页', () => {
  test('加载登录页面', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=工程结算管理')).toBeVisible()
    await expect(page.locator('text=登 录')).toBeVisible()
  })

  test('显示服务器连接状态', async ({ page }) => {
    await page.route('**/api/health', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'API is healthy.' }),
    }))
    await page.goto('/')
    await expect(page.locator('text=服务器已连接')).toBeVisible({ timeout: 10000 })
  })
})

test.describe('经理核心页面', () => {
  test.beforeEach(async ({ page }) => {
    await installMockSession(page, 'manager')
  })

  test('经理工作台', async ({ page }) => {
    await page.goto('/manager')
    await expect(page).toHaveURL(/\/app$/)
    await expect(page.getByText('管理工作台', { exact: true })).toBeVisible({ timeout: 10000 })
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
    await expect(page.getByText('通用', { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('消息通知', { exact: true })).toBeVisible()
    await expect(page.getByText('AI 设置', { exact: true })).toHaveCount(0)
  })
})
