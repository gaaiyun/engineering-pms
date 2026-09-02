import assert from 'node:assert/strict'

const baseUrl = process.env.EPMS_QA_BASE_URL
const adminEmail = process.env.EPMS_QA_ADMIN_EMAIL
const adminPassword = process.env.EPMS_QA_ADMIN_PASSWORD
if (!baseUrl || !adminEmail || !adminPassword) throw new Error('Missing isolated QA environment')

const results = []
async function request(path, { method = 'GET', token = '', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let data = {}
  if (text) data = JSON.parse(text)
  return { status: response.status, data }
}

function passed(name, response, expectedStatus) {
  assert.equal(response.status, expectedStatus, `${name}: ${JSON.stringify(response.data)}`)
  results.push({ name, status: response.status })
}

function key(label) {
  return `${label}.${Date.now()}.${Math.random().toString(36).slice(2, 10)}`
}

const adminAuth = await request('/api/admins/auth-with-password', { method: 'POST', body: { identity: adminEmail, password: adminPassword } })
passed('超级管理员登录', adminAuth, 200)
const superToken = adminAuth.data.token

const ownerPassword = 'QA-owner-initial-2026'
const owner = await request('/api/collections/users/records', {
  method: 'POST', token: superToken,
  body: { username: 'qa_people_owner', email: 'qa-owner@example.invalid', emailVisibility: true, password: ownerPassword, passwordConfirm: ownerPassword, name: 'QA 人员管理员', role: 'admin', department: '管理层', is_active: true },
})
passed('创建 QA 管理员', owner, 200)
assert.equal(owner.data.must_change_password, true)

const ownerLogin = await request('/api/collections/users/auth-with-password', { method: 'POST', body: { identity: 'qa_people_owner', password: ownerPassword } })
passed('QA 管理员登录', ownerLogin, 200)
const changedPassword = 'QA-owner-final-2026'
const passwordChange = await request('/api/custom/auth/change-password', {
  method: 'POST', token: ownerLogin.data.token,
  body: { current_password: ownerPassword, new_password: changedPassword, password_confirm: changedPassword },
})
passed('完成首次改密', passwordChange, 200)
const ownerToken = passwordChange.data.token

const serviceSecretExpiry = new Date(Date.now() + 86400000).toISOString()
const service = await request('/api/custom/agent/v1/admin/service-accounts', {
  method: 'POST', token: ownerToken,
  body: { owner: owner.data.id, name: 'QA 人员维护 Agent', scopes: ['read', 'write', 'delete', 'people_manage'], expires_at: serviceSecretExpiry, allowed_projects: [] },
})
passed('创建人员维护服务账号', service, 201)
assert.ok(service.data.secret)

const serviceAuth = await request('/api/collections/service_accounts/auth-with-password', {
  method: 'POST', body: { identity: service.data.username, password: service.data.secret },
})
passed('人员维护服务账号登录', serviceAuth, 200)
const agentToken = serviceAuth.data.token

const createKey = key('person-create')
const createBody = {
  action: 'person_create', request_id: key('request-create'), idempotency_key: createKey,
  payload: { username: 'qa_new_person', name: '新员工', email: 'qa-new@example.invalid', role: 'employee', department: '综合部' },
}
const created = await request('/api/custom/agent/v1/commands/execute', { method: 'POST', token: agentToken, body: createBody })
passed('Agent 创建员工', created, 200)
assert.equal(created.data.result.must_change_password, true)
assert.equal(created.data.result.department, '综合部')
assert.equal(created.data.replayed, false)
assert.ok(created.data.result.temporary_password)
const personId = created.data.result.id

const replay = await request('/api/custom/agent/v1/commands/execute', { method: 'POST', token: agentToken, body: createBody })
passed('相同幂等键回放', replay, 200)
assert.equal(replay.data.replayed, true)
assert.equal(replay.data.result.temporary_password_available, false)
assert.equal('temporary_password' in replay.data.result, false)

const conflict = await request('/api/custom/agent/v1/commands/execute', {
  method: 'POST', token: agentToken,
  body: { ...createBody, payload: { ...createBody.payload, name: '不同请求' } },
})
passed('相同幂等键不同载荷', conflict, 409)
assert.equal(conflict.data.error.code, 'IDEMPOTENCY_CONFLICT')

const operations = await request(`/api/collections/agent_operations/records?filter=${encodeURIComponent(`idempotency_key = "${createKey}"`)}`, { token: superToken })
passed('查询幂等记录', operations, 200)
const operationText = JSON.stringify(operations.data.items[0])
assert.equal(operationText.includes(created.data.result.temporary_password), false)
assert.equal(operationText.includes('password_notice'), true)

const audits = await request(`/api/collections/audit_logs/records?filter=${encodeURIComponent(`request_id = "${createBody.request_id}"`)}`, { token: superToken })
passed('查询人员审计', audits, 200)
assert.equal(audits.data.items.length, 1)
assert.equal(JSON.stringify(audits.data.items[0]).includes(created.data.result.temporary_password), false)
assert.equal(audits.data.items[0].source, 'agent')

const listed = await request('/api/custom/agent/v1/query', { method: 'POST', token: agentToken, body: { query: 'people', page: 1, per_page: 100, include_inactive: false } })
passed('查询启用人员', listed, 200)
assert.ok(listed.data.items.some(item => item.id === personId && item.department === '综合部'))

const updated = await request('/api/custom/agent/v1/commands/execute', {
  method: 'POST', token: agentToken,
  body: { action: 'person_update', request_id: key('request-update'), idempotency_key: key('person-update'), payload: { user_id: personId, name: '新员工甲', role: 'manager', department: '财务部', reset_password: true } },
})
passed('Agent 修改人员并重置密码', updated, 200)
assert.equal(updated.data.result.role, 'manager')
assert.equal(updated.data.result.department, '财务部')
assert.ok(updated.data.result.temporary_password)

const disabled = await request('/api/custom/agent/v1/commands/execute', {
  method: 'POST', token: agentToken,
  body: { action: 'person_disable', request_id: key('request-disable'), idempotency_key: key('person-disable'), payload: { user_id: personId } },
})
passed('Agent 停用人员', disabled, 200)
assert.equal(disabled.data.result.is_active, false)

const disabledLogin = await request('/api/collections/users/auth-with-password', { method: 'POST', body: { identity: 'qa_new_person', password: updated.data.result.temporary_password } })
passed('停用账号拒绝登录', disabledLogin, 401)

const activeOnly = await request('/api/custom/agent/v1/query', { method: 'POST', token: agentToken, body: { query: 'people', page: 1, per_page: 100 } })
passed('默认列表隐藏停用账号', activeOnly, 200)
assert.equal(activeOnly.data.items.some(item => item.id === personId), false)
const includeInactive = await request('/api/custom/agent/v1/query', { method: 'POST', token: agentToken, body: { query: 'people', page: 1, per_page: 100, include_inactive: true } })
passed('人员管理员可查询停用账号', includeInactive, 200)
assert.ok(includeInactive.data.items.some(item => item.id === personId && item.is_active === false))

const preview = await request('/api/custom/agent/v1/commands/preview', {
  method: 'POST', token: agentToken,
  body: { action: 'person_delete', request_id: key('request-delete'), idempotency_key: key('person-delete'), payload: { user_id: personId } },
})
passed('预览删除无引用停用账号', preview, 200)
assert.equal(preview.data.preview.user_id, personId)

const wrongConfirm = await request('/api/custom/agent/v1/commands/confirm', { method: 'POST', token: agentToken, body: { operation_id: preview.data.operation_id, confirmation_code: 'ZZZZZZZZ' } })
passed('错误确认码拒绝删除', wrongConfirm, 400)
assert.equal(wrongConfirm.data.error.code, 'CONFIRMATION_INVALID')
const confirmed = await request('/api/custom/agent/v1/commands/confirm', { method: 'POST', token: agentToken, body: { operation_id: preview.data.operation_id, confirmation_code: preview.data.confirmation_code } })
passed('确认删除无引用停用账号', confirmed, 200)
assert.equal(confirmed.data.result.deleted, personId)
const reused = await request('/api/custom/agent/v1/commands/confirm', { method: 'POST', token: agentToken, body: { operation_id: preview.data.operation_id, confirmation_code: preview.data.confirmation_code } })
passed('确认码禁止重复使用', reused, 409)
assert.equal(reused.data.error.code, 'CONFIRMATION_USED')

const activePerson = await request('/api/custom/agent/v1/commands/execute', {
  method: 'POST', token: agentToken,
  body: { action: 'person_create', request_id: key('request-active'), idempotency_key: key('person-active'), payload: { username: 'qa_active_person', name: '启用员工', email: 'qa-active@example.invalid', role: 'employee', department: '工程部' } },
})
passed('创建启用账号用于删除保护', activePerson, 200)
const activePreview = await request('/api/custom/agent/v1/commands/preview', {
  method: 'POST', token: agentToken,
  body: { action: 'person_delete', request_id: key('request-active-delete'), idempotency_key: key('person-active-delete'), payload: { user_id: activePerson.data.result.id } },
})
passed('启用账号不能预览删除', activePreview, 409)
assert.equal(activePreview.data.error.code, 'PERSON_ACTIVE')

const referencedPerson = await request('/api/custom/agent/v1/commands/execute', {
  method: 'POST', token: agentToken,
  body: { action: 'person_create', request_id: key('request-referenced'), idempotency_key: key('person-referenced'), payload: { username: 'qa_referenced_person', name: '有历史员工', email: 'qa-referenced@example.invalid', role: 'employee', department: '工程部' } },
})
passed('创建引用保护账号', referencedPerson, 200)
const referenceNotification = await request('/api/collections/notifications/records', {
  method: 'POST', token: superToken,
  body: { user: referencedPerson.data.result.id, title: 'QA 引用', message: '仅用于隔离删除保护验证', is_read: false, type: 'task', related_id: 'qa-reference' },
})
passed('写入隔离引用通知', referenceNotification, 200)
const disableReferenced = await request('/api/custom/agent/v1/commands/execute', {
  method: 'POST', token: agentToken,
  body: { action: 'person_disable', request_id: key('request-referenced-disable'), idempotency_key: key('person-referenced-disable'), payload: { user_id: referencedPerson.data.result.id } },
})
passed('停用引用保护账号', disableReferenced, 200)
const impact = await request('/api/custom/admin/users/delete-impact', { method: 'POST', token: ownerToken, body: { user_id: referencedPerson.data.result.id } })
passed('网页删除影响预检', impact, 200)
assert.equal(impact.data.can_delete, false)
assert.ok(impact.data.references.some(item => item.collection === 'notifications'))
const referencedPreview = await request('/api/custom/agent/v1/commands/preview', {
  method: 'POST', token: agentToken,
  body: { action: 'person_delete', request_id: key('request-referenced-delete'), idempotency_key: key('person-referenced-delete'), payload: { user_id: referencedPerson.data.result.id } },
})
passed('有历史账号拒绝删除预览', referencedPreview, 409)
assert.equal(referencedPreview.data.error.code, 'PERSON_REFERENCED')

const limitedService = await request('/api/custom/agent/v1/admin/service-accounts', {
  method: 'POST', token: ownerToken,
  body: { owner: owner.data.id, name: 'QA 只读 Agent', scopes: ['read'], expires_at: serviceSecretExpiry, allowed_projects: [] },
})
passed('创建只读服务账号', limitedService, 201)
const limitedAuth = await request('/api/collections/service_accounts/auth-with-password', { method: 'POST', body: { identity: limitedService.data.username, password: limitedService.data.secret } })
passed('只读服务账号登录', limitedAuth, 200)
const denied = await request('/api/custom/agent/v1/commands/execute', { method: 'POST', token: limitedAuth.data.token, body: { action: 'person_disable', request_id: key('request-denied'), idempotency_key: key('person-denied'), payload: { user_id: activePerson.data.result.id } } })
passed('缺少人员 scope 被拒绝', denied, 403)
assert.equal(denied.data.error.code, 'SCOPE_DENIED')

const invalidScope = await request('/api/custom/agent/v1/admin/service-accounts', {
  method: 'POST', token: ownerToken,
  body: { owner: owner.data.id, name: 'QA 范围冲突 Agent', scopes: ['read', 'people_manage'], expires_at: serviceSecretExpiry, allowed_projects: ['aaaaaaaaaaaaaaa'] },
})
passed('人员 scope 不允许项目范围限制', invalidScope, 400)

console.log(JSON.stringify({ passed: results.length, cases: results }))
