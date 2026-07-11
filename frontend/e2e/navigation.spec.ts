import { expect, test, type Browser } from '@playwright/test'
import { installMockSession, installStaticApp, type MockRole } from './mock-session'

const BASE_URL = 'http://app.local'

const viewportCases = [
  { name: '手机 390x844', width: 390, height: 844, hasTouch: true, shell: 'compact' },
  { name: '触控平板 820x1180', width: 820, height: 1180, hasTouch: true, shell: 'compact' },
  { name: '键鼠窗口 900x700', width: 900, height: 700, hasTouch: false, shell: 'desktop', collapsed: 'true' },
  { name: '桌面 1440x900', width: 1440, height: 900, hasTouch: false, shell: 'desktop', collapsed: 'false' },
] as const

for (const role of ['employee', 'manager', 'admin'] as const) {
  for (const scenario of viewportCases) {
    test(`${role} · ${scenario.name} 只显示一套主导航`, async ({ browser }) => {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        viewport: { width: scenario.width, height: scenario.height },
        hasTouch: scenario.hasTouch,
      })
      const page = await context.newPage()
      await installStaticApp(page)
      await installMockSession(page, role)
      await page.goto('/app')

      await expect(page.locator(`[data-shell="${scenario.shell}"]`)).toBeVisible()
      await expect(page.getByRole('navigation')).toHaveCount(1)

      if (scenario.shell === 'compact') {
        const bottomNav = page.getByLabel('底部导航')
        await expect(bottomNav).toBeVisible()
        await expect(page.getByLabel('桌面主导航')).toHaveCount(0)
        for (const label of ['工作台', '任务', '项目', '通知', '我的']) {
          await expect(bottomNav.getByLabel(label, { exact: true })).toBeVisible()
        }
      } else {
        await expect(page.getByLabel('桌面主导航')).toHaveAttribute('data-collapsed', scenario.collapsed)
        await expect(page.getByLabel('底部导航')).toHaveCount(0)
      }

      if (role === 'admin' && scenario.shell === 'desktop' && scenario.collapsed === 'false') {
        await expect(page.getByText('系统管理', { exact: true })).toBeVisible()
      } else {
        await expect(page.getByText('系统管理', { exact: true })).toHaveCount(0)
      }

      await context.close()
    })
  }
}

async function openAsRole(browser: Browser, role: MockRole, path: string) {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await installStaticApp(page)
  await installMockSession(page, role)
  await page.goto(path)
  return { context, page }
}

test('旧 admin AI 链接跳转到新系统路由', async ({ browser }) => {
  const { context, page } = await openAsRole(browser, 'admin', '/admin?tab=ai')
  await expect(page).toHaveURL(/\/system\/ai$/)
  await context.close()
})

test('manager 不能访问系统管理', async ({ browser }) => {
  const { context, page } = await openAsRole(browser, 'manager', '/system/users')
  await expect(page).toHaveURL(/\/app$/)
  await context.close()
})

test('employee 不能访问审核中心', async ({ browser }) => {
  const { context, page } = await openAsRole(browser, 'employee', '/review-center')
  await expect(page).toHaveURL(/\/app$/)
  await context.close()
})
