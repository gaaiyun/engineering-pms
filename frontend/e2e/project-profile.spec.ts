import { expect, test, type Page } from '@playwright/test'
import { installMockSession, installStaticApp } from './mock-session'

const project = {
  id: 'project-1', collectionId: 'projects', collectionName: 'projects',
  name: '10B结算项目', description: '完成工程资料复核、计量确认与结算交付。',
  status: 'active', start_date: '2026-06-01', deadline: '2026-08-31',
  manager: 'manager-1', members: ['manager-1', 'employee-1'], created: '2026-06-01 08:00:00.000Z', updated: '2026-07-12 08:00:00.000Z',
}

const tasks = [
  { id: 'task-1', collectionId: 'tasks', collectionName: 'tasks', project: 'project-1', stage_name: '复核变更签证', status: 'blocked', deadline: '2026-07-15', assignees: ['employee-1'], is_milestone: false },
  { id: 'task-2', collectionId: 'tasks', collectionName: 'tasks', project: 'project-1', stage_name: '提交结算成果', status: 'pending', deadline: '2026-08-31', assignees: ['manager-1'], is_milestone: true },
  { id: 'task-3', collectionId: 'tasks', collectionName: 'tasks', project: 'project-1', stage_name: '核对工程量', status: 'completed', deadline: '2026-07-01', assignees: ['employee-1'], is_milestone: false },
]

const users = [
  { id: 'manager-1', collectionId: 'users', collectionName: 'users', username: 'manager_tester', name: '测试经理', role: 'manager', department: '工程部', avatar: 'manager_tester_avatar_demo.svg' },
  { id: 'employee-1', collectionId: 'users', collectionName: 'users', username: 'employee_tester', name: '测试员工', role: 'employee', department: '审计部', avatar: 'employee_tester_avatar_demo.svg' },
]

function list(items: unknown[]) {
  return { page: 1, perPage: 200, totalItems: items.length, totalPages: 1, items }
}

async function mockProjectData(page: Page) {
  await page.route('**/api/collections/**', async route => {
    const url = new URL(route.request().url())
    if (route.request().method() !== 'GET') return route.fallback()
    if (url.pathname.endsWith('/projects/records/project-1')) return route.fulfill({ json: project })
    if (url.pathname.endsWith('/projects/records')) return route.fulfill({ json: list([project]) })
    if (url.pathname.endsWith('/tasks/records')) return route.fulfill({ json: list(tasks) })
    if (url.pathname.endsWith('/users/records')) return route.fulfill({ json: list(users) })
    if (url.pathname.endsWith('/audit_logs/records')) return route.fulfill({ json: list([]) })
    return route.fallback()
  })
}

test.beforeEach(async ({ page }) => {
  await installStaticApp(page)
  await installMockSession(page, 'manager')
  await mockProjectData(page)
})

test('项目卡片整体可点击并进入真实项目总览', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/my-projects')
  const card = page.getByRole('button', { name: /10B结算项目/ })
  await expect(card).toBeVisible()
  await card.click({ position: { x: 360, y: 30 } })
  await expect(page).toHaveURL(/\/project\/project-1$/)
  await expect(page.getByRole('heading', { name: '10B结算项目' })).toBeVisible()
  await expect(page.getByText('当前工作', { exact: true })).toBeVisible()
  await expect(page.getByText('项目资料', { exact: true })).toBeVisible()
  await expect(page.getByText('风险与卡点', { exact: true })).toBeVisible()
})

test('手机项目总览无横向溢出且保留唯一底部导航', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/project/project-1')
  await expect(page.getByLabel('底部导航')).toBeVisible()
  await expect(page.getByRole('navigation')).toHaveCount(2) // 项目功能 + App 底部导航
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)
  await expect(page.getByText('复核变更签证')).toBeVisible()
})

test('我的资料使用企业档案布局与正式头像', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/me')
  await expect(page.getByRole('heading', { name: '我的资料' })).toBeVisible()
  await expect(page.getByLabel('员工身份信息')).toBeVisible()
  await expect(page.getByText('基本信息', { exact: true })).toBeVisible()
  await expect(page.locator('.holographic-card')).toHaveCount(0)
  await expect(page.locator('.profile-avatar img')).toHaveAttribute('src', /^data:image\/svg\+xml/)
})

test('手机时间轴提供紧凑筛选和缩放且任务可直达', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/project/project-1/timeline')

  await expect(page.getByLabel('时间轴任务筛选')).toBeVisible()
  await expect(page.getByRole('button', { name: '缩小时间轴' })).toBeVisible()
  await expect(page.getByRole('button', { name: '放大时间轴' })).toBeVisible()
  await expect(page.getByText('3/3 项')).toBeVisible()

  await page.getByRole('button', { name: '阻塞', exact: true }).click()
  await expect(page.getByText('1/3 项')).toBeVisible()
  await expect(page.getByText('复核变更签证')).toBeVisible()
  await expect(page.getByText('提交结算成果')).toHaveCount(0)

  await page.getByRole('button', { name: '放大时间轴' }).click()
  await page.getByText('复核变更签证').click()
  await expect(page).toHaveURL(/\/task\/task-1$/)
})

test('经理通过独立手柄拖动任务且普通点按仍打开详情', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/project/project-1/kanban')

  const handle = page.getByRole('button', { name: '拖动任务 提交结算成果' })
  await expect(handle).toBeVisible()

  const updateRequest = page.waitForRequest(request =>
    request.method() === 'PATCH' && request.url().includes('/api/collections/tasks/records/task-2'),
  )
  const inProgressColumn = page.locator('.kanban-column').nth(1)
  await expect(inProgressColumn.getByText('进行中', { exact: true })).toBeVisible()
  const start = await handle.boundingBox()
  const target = await inProgressColumn.locator('.column-content').boundingBox()
  expect(start).not.toBeNull()
  expect(target).not.toBeNull()
  const startX = start!.x + start!.width / 2
  const startY = start!.y + start!.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 12, startY, { steps: 3 })
  await page.waitForTimeout(50)
  await page.mouse.move(target!.x + target!.width / 2, target!.y + Math.min(80, target!.height / 2), { steps: 12 })
  await page.mouse.up()

  const request = await updateRequest
  expect(request.postDataJSON()).toMatchObject({ status: 'in_progress' })

  await page.getByText('复核变更签证', { exact: true }).click()
  await expect(page.getByText('任务详情', { exact: true })).toBeVisible()
})
