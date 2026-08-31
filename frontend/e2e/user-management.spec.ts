import { expect, test, type Page } from '@playwright/test'
import { installMockSession, installStaticApp } from './mock-session'

const admin = {
  id: 'admin-1', collectionId: 'users', collectionName: 'users',
  username: 'admin_tester', name: '测试管理员', email: 'admin@example.com',
  role: 'admin', department: '管理层', is_active: true,
}

let employee = {
  id: 'employee-1', collectionId: 'users', collectionName: 'users',
  username: 'employee_tester', name: '李设计', email: 'employee@example.com',
  role: 'employee', department: '工程部', is_active: true,
}

function list(items: unknown[]) {
  return { page: 1, perPage: 200, totalItems: items.length, totalPages: 1, items }
}

async function mockUsers(page: Page) {
  await page.route('**/api/collections/users/records**', async (route) => {
    const url = new URL(route.request().url())
    const method = route.request().method()

    if (method === 'GET' && url.pathname.endsWith('/records')) {
      return route.fulfill({ json: list([admin, employee]) })
    }
    if (method === 'PATCH' && url.pathname.endsWith(`/records/${employee.id}`)) {
      employee = { ...employee, ...route.request().postDataJSON() }
      return route.fulfill({ json: employee })
    }
    if (method === 'DELETE' && url.pathname.endsWith(`/records/${employee.id}`)) {
      return route.fulfill({ status: 204, body: '' })
    }
    return route.fallback()
  })
}

test('管理员可调整部门、停用并删除无业务记录员工', async ({ page }) => {
  employee = { ...employee, department: '工程部', role: 'employee', is_active: true }
  await installStaticApp(page)
  await installMockSession(page, 'admin')
  await mockUsers(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/system/users')

  await page.getByText('李设计', { exact: true }).click()
  await expect(page.getByRole('heading', { name: '编辑成员账号' })).toBeVisible()
  await page.getByText('设计院', { exact: true }).click()

  const updateRequest = page.waitForRequest((request) =>
    request.method() === 'PATCH' && request.url().endsWith(`/users/records/${employee.id}`),
  )
  await page.getByRole('button', { name: '保存修改' }).click()
  expect((await updateRequest).postDataJSON()).toMatchObject({ department: '设计院' })
  await expect(page.getByText('用户已更新')).toBeVisible()

  await page.getByText('李设计', { exact: true }).click()
  await page.getByRole('button', { name: '停用账号' }).click()
  await page.getByRole('button', { name: '确认停用' }).click()
  await expect(page.getByRole('button', { name: '永久删除' })).toBeVisible()
  expect(employee.is_active).toBe(false)

  const deleteRequest = page.waitForRequest((request) =>
    request.method() === 'DELETE' && request.url().endsWith(`/users/records/${employee.id}`),
  )
  await page.getByRole('button', { name: '永久删除' }).click()
  await page.getByRole('button', { name: '确认删除' }).click()
  await deleteRequest
  await expect(page.getByText('账号已删除')).toBeVisible()
})
