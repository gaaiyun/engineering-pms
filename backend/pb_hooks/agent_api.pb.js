/// <reference path="../pb_data/types.d.ts" />

var AGENT_HIGH_IMPACT_ACTIONS = ['project_archive', 'task_delete', 'task_bulk_reassign', 'handoff_decide', 'person_delete']
var AGENT_ACTION_SCOPES = {
  project_create: 'write', project_update: 'write', project_archive: 'archive',
  task_create: 'write', task_update: 'write', task_complete: 'write', task_block: 'write', task_unblock: 'write',
  task_delete: 'delete', task_bulk_reassign: 'reassign', handoff_decide: 'approve', comment_create: 'comment',
  person_create: 'people_manage', person_update: 'people_manage', person_disable: 'people_manage', person_delete: 'people_manage',
}
var AGENT_PERSON_ROLES = ['employee', 'manager']
var AGENT_DEPARTMENTS = ['工程部', '审计部', '财务部', '设计院', '监理部', '综合部', '管理层']

function agentError(c, status, code, message) { return c.json(status, { error: { code: code, message: message } }) }
function safeId(value) { return typeof value === 'string' && /^[a-z0-9]{15}$/.test(value) ? value : '' }
function safeKey(value) { return typeof value === 'string' && /^[A-Za-z0-9._:-]{8,120}$/.test(value) ? value : '' }
function stableStringify(value) {
  const encode = (item) => {
    if (item === null || typeof item !== 'object') return JSON.stringify(item)
    if (Array.isArray(item)) return `[${item.map((entry) => encode(entry)).join(',')}]`
    const keys = Object.keys(item).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${encode(item[key])}`).join(',')}}`
  }
  return encode(value)
}
function jsonObject(record, field) {
  const serialized = record.getString(field)
  if (serialized) {
    try { return JSON.parse(serialized) } catch (_) { /* fall through */ }
  }
  const raw = record.get(field)
  if (!raw) return {}
  if (typeof raw === 'string') return JSON.parse(raw || '{}')
  return JSON.parse(JSON.stringify(raw))
}
function pageInput(data) { return {
  page: Math.max(1, Math.min(100000, Number(data.page) || 1)),
  perPage: Math.max(1, Math.min(100, Number(data.per_page) || 20)),
} }
function isoNow() { return new Date().toISOString() }
function validDate(value) { return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value)) }
function assertPayload(payload, allowedKeys) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('INVALID_PAYLOAD')
  if (Object.keys(payload).some((key) => allowedKeys.indexOf(key) === -1)) throw new Error('INVALID_PAYLOAD')
}

function requirePeopleManager(dao, agent) {
  if (agent.projects.length > 0) throw new Error('PEOPLE_DENIED')
  const owner = dao.findRecordById('users', agent.owner)
  if (!owner.getBool('is_active') || owner.getBool('must_change_password') || owner.getString('role') !== 'admin') throw new Error('PEOPLE_DENIED')
  return owner
}

function userReferenceTypes(dao, userId) {
  const references = [
    ['projects', [['manager', '='], ['members', '?='], ['created_by', '=']]],
    ['tasks', [['assignees', '?='], ['created_by', '='], ['next_assignees', '?='], ['approved_by', '=']]],
    ['handoffs', [['submitter', '='], ['reviewer', '='], ['proposed_assignees', '?=']]],
    ['audit_logs', [['operator', '='], ['reviewed_by', '=']]],
    ['comments', [['author', '='], ['mentions', '?=']]],
    ['notifications', [['user', '=']]],
    ['progress_logs', [['user', '='], ['next_assignees', '?=']]],
    ['flower_logs', [['user', '=']]],
    ['ai_summaries', [['target_user', '=']]],
    ['app_settings', [['updated_by', '=']]],
    ['service_accounts', [['owner', '=']]],
    ['attachments', [['uploader', '=']]],
  ]
  const found = []
  references.forEach((reference) => {
    let collection
    try { collection = dao.findCollectionByNameOrId(reference[0]) } catch (_) { return }
    const terms = reference[1]
      .filter((term) => {
        try { return !!collection.schema.getFieldByName(term[0]) } catch (_) { return false }
      })
      .map((term) => `${term[0]} ${term[1]} {:userId}`)
    if (terms.length > 0 && dao.findRecordsByFilter(reference[0], terms.join(' || '), '', 1, 0, { userId: userId }).length > 0) found.push(reference[0])
  })
  return found
}

function validatePersonInput(payload, partial) {
  const runtime = $app.store().get('__epmsAgent')
  const username = typeof payload.username === 'string' ? payload.username.trim() : ''
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  const role = typeof payload.role === 'string' ? payload.role : ''
  const department = typeof payload.department === 'string' ? payload.department : ''
  if ((!partial || Object.prototype.hasOwnProperty.call(payload, 'username')) && !/^[A-Za-z0-9_]{3,30}$/.test(username)) throw new Error('INVALID_PAYLOAD')
  if ((!partial || Object.prototype.hasOwnProperty.call(payload, 'name')) && (!name || name.length > 30)) throw new Error('INVALID_PAYLOAD')
  if ((!partial || Object.prototype.hasOwnProperty.call(payload, 'email')) && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180)) throw new Error('INVALID_PAYLOAD')
  if ((!partial || Object.prototype.hasOwnProperty.call(payload, 'role')) && runtime.personRoles.indexOf(role) === -1) throw new Error('INVALID_PAYLOAD')
  if ((!partial || Object.prototype.hasOwnProperty.call(payload, 'department')) && runtime.departments.indexOf(department) === -1) throw new Error('INVALID_PAYLOAD')
  if (Object.prototype.hasOwnProperty.call(payload, 'reset_password') && typeof payload.reset_password !== 'boolean') throw new Error('INVALID_PAYLOAD')
  if (Object.prototype.hasOwnProperty.call(payload, 'is_active') && payload.is_active !== true) throw new Error('INVALID_PAYLOAD')
  return { username: username, name: name, email: email, role: role, department: department }
}

// 登录身份按大小写不敏感解析，而 Agent 走 dao.saveRecord 绕过了 REST 层的唯一性校验，
// 所以查重必须与登录同口径；精确匹配会放过仅大小写不同的账号，建出永远登不进去的记录。
function assertUniquePerson(dao, username, email, exceptId) {
  if (username) {
    let holder = null
    try { holder = dao.findAuthRecordByUsername('users', username) } catch (_) { holder = null }
    if (holder && holder.id !== exceptId) throw new Error('PERSON_CONFLICT')
  }
  if (email) {
    const wanted = email.toLowerCase()
    let candidates = []
    // `~` 是大小写不敏感的包含匹配，只用来收窄候选；相等判断仍在下面逐条精确比较。
    try { candidates = dao.findRecordsByFilter('users', 'email ~ {:email}', '', 200, 0, { email: wanted }) } catch (_) { candidates = [] }
    for (let i = 0; i < candidates.length; i += 1) {
      if (candidates[i].id !== exceptId && candidates[i].getString('email').toLowerCase() === wanted) throw new Error('PERSON_CONFLICT')
    }
  }
}

function operationPayload(action, payload) {
  return payload
}

function operationResult(action, result) {
  if ((action !== 'person_create' && action !== 'person_update') || !result || typeof result !== 'object') return result
  const safe = {}
  Object.keys(result).forEach((key) => {
    if (key !== 'temporary_password') safe[key] = result[key]
  })
  if (Object.prototype.hasOwnProperty.call(result, 'temporary_password')) safe.temporary_password_available = false
  return safe
}

function getAgent(c) {
  const info = $apis.requestInfo(c)
  const auth = info.authRecord
  if (!auth || auth.collection().name !== 'service_accounts') return { error: [401, 'UNAUTHORIZED', '无效的服务账号凭证'] }
  let current
  try { current = $app.dao().findRecordById('service_accounts', auth.id) } catch (_) { return { error: [401, 'UNAUTHORIZED', '服务账号不存在'] } }
  if (!current.getBool('enabled')) return { error: [401, 'ACCOUNT_DISABLED', '服务账号已停用'] }
  const expiresAt = Date.parse(String(current.getString('expires_at') || '').replace(' ', 'T'))
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return { error: [401, 'TOKEN_EXPIRED', '服务账号已过期'] }
  let ownerRecord
  try { ownerRecord = $app.dao().findRecordById('users', current.getString('owner')) } catch (_) { return { error: [401, 'OWNER_INVALID', '服务账号所有者无效'] } }
  if (!ownerRecord.getBool('is_active')) return { error: [401, 'OWNER_DISABLED', '服务账号所有者已停用'] }
  return {
    record: current,
    scopes: current.getStringSlice('scopes') || [],
    projects: current.getStringSlice('allowed_projects') || [],
    owner: current.getString('owner'),
  }
}

function requireAgent(c, scope) {
  const runtime = $app.store().get('__epmsAgent')
  const agent = runtime.getAgent(c)
  if (agent.error) { runtime.agentError(c, agent.error[0], agent.error[1], agent.error[2]); return { denied: true } }
  if (scope && agent.scopes.indexOf(scope) === -1) { runtime.agentError(c, 403, 'SCOPE_DENIED', `缺少 ${scope} scope`); return { denied: true } }
  return agent
}

function projectAllowed(agent, projectId) {
  return agent.projects.length === 0 || agent.projects.indexOf(projectId) !== -1
}

function requireProject(agent, projectId, dao) {
  const runtime = $app.store().get('__epmsAgent')
  const id = runtime.safeId(projectId)
  if (!id || !runtime.projectAllowed(agent, id)) throw new Error('PROJECT_DENIED')
  return (dao || $app.dao()).findRecordById('projects', id)
}

function requireProjectMembers(dao, project, userIds) {
  const members = project.getStringSlice('members') || []
  const managerId = project.getString('manager')
  if (managerId && members.indexOf(managerId) === -1) members.push(managerId)
  userIds.forEach((userId) => {
    const user = dao.findRecordById('users', userId)
    if (!user.getBool('is_active') || members.indexOf(userId) === -1) throw new Error('PROJECT_MEMBER_REQUIRED')
  })
}

function recordFields(record, fields) {
  const result = { id: record.id, created: record.getString('created'), updated: record.getString('updated') }
  fields.forEach((field) => { result[field] = record.get(field) })
  return result
}

function listRecords(dao, collection, filter, sort, page, perPage) {
  const offset = (page - 1) * perPage
  const records = dao.findRecordsByFilter(collection, filter || '', sort || '-created', perPage + 1, offset)
  const hasMore = records.length > perPage
  return { page: page, per_page: perPage, has_more: hasMore, next_page: hasMore ? page + 1 : null, records: records.slice(0, perPage) }
}

function agentProjectFilter(agent, field) {
  if (agent.projects.length === 0) return 'id != ""'
  return agent.projects.map((id) => `${field || 'id'} = "${id}"`).join(' || ')
}

function validateHighImpactAccess(dao, agent, action, payload) {
  const runtime = $app.store().get('__epmsAgent')
  if (!payload || typeof payload !== 'object') throw new Error('INVALID_PAYLOAD')
  if (action === 'project_archive') {
    runtime.assertPayload(payload, ['project_id', 'archived'])
    runtime.requireProject(agent, runtime.safeId(payload.project_id), dao)
    return
  }
  if (action === 'task_delete') {
    runtime.assertPayload(payload, ['task_id'])
    const task = dao.findRecordById('tasks', runtime.safeId(payload.task_id))
    runtime.requireProject(agent, task.getString('project'), dao)
    return
  }
  if (action === 'task_bulk_reassign') {
    runtime.assertPayload(payload, ['project_id', 'task_ids', 'assignees'])
    const projectId = runtime.safeId(payload.project_id)
    const project = runtime.requireProject(agent, projectId, dao)
    const taskIds = Array.isArray(payload.task_ids) ? payload.task_ids : []
    const assignees = Array.isArray(payload.assignees) ? payload.assignees.map(runtime.safeId).filter(Boolean) : []
    if (!projectId || taskIds.length === 0 || taskIds.some((id) => !runtime.safeId(id)) || assignees.length === 0 || assignees.length !== payload.assignees.length || assignees.some((id, index) => assignees.indexOf(id) !== index)) throw new Error('INVALID_PAYLOAD')
    runtime.requireProjectMembers(dao, project, assignees)
    taskIds.forEach((id) => { if (dao.findRecordById('tasks', id).getString('project') !== projectId) throw new Error('PROJECT_DENIED') })
    return
  }
  if (action === 'handoff_decide') {
    runtime.assertPayload(payload, ['handoff_id', 'decision', 'review_note'])
    const handoff = dao.findRecordById('handoffs', runtime.safeId(payload.handoff_id))
    runtime.requireProject(agent, handoff.getString('project'), dao)
    return
  }
  if (action === 'person_delete') {
    runtime.assertPayload(payload, ['user_id'])
    runtime.requirePeopleManager(dao, agent)
    const userId = runtime.safeId(payload.user_id)
    if (!userId) throw new Error('INVALID_PAYLOAD')
    const user = dao.findRecordById('users', userId)
    if (user.getString('role') === 'admin' || user.id === agent.owner) throw new Error('PEOPLE_DENIED')
    if (user.getBool('is_active')) throw new Error('PERSON_ACTIVE')
    const references = runtime.userReferenceTypes(dao, userId)
    if (references.length > 0) throw new Error(`PERSON_REFERENCED:${references.join(',')}`)
    return { user_id: user.id, username: user.getString('username'), name: user.getString('name'), consequence: '永久删除无业务引用的停用账号' }
  }
  throw new Error('UNKNOWN_ACTION')
}

function saveAgentAudit(dao, agent, requestId, action, projectId, taskId, beforeData, afterData) {
  const audit = new Record(dao.findCollectionByNameOrId('audit_logs'))
  if (projectId) audit.set('project', projectId)
  if (taskId) audit.set('task', taskId)
  audit.set('action_type', action)
  audit.set('operator', agent.owner)
  audit.set('source', 'agent')
  audit.set('service_account', agent.record.id)
  audit.set('request_id', requestId)
  if (beforeData) audit.set('before_data', beforeData)
  if (afterData) audit.set('after_data', afterData)
  dao.saveRecord(audit)
}

function executeAgentAction(dao, agent, requestId, action, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('INVALID_PAYLOAD')
  const runtime = $app.store().get('__epmsAgent')
  let projectId = $app.store().get('__epmsAgent').safeId(payload.project_id)
  let taskId = $app.store().get('__epmsAgent').safeId(payload.task_id)
  let beforeData = null
  let afterData = null
  let result = null

  if (action === 'person_create') {
    runtime.assertPayload(payload, ['username', 'name', 'email', 'role', 'department'])
    runtime.requirePeopleManager(dao, agent)
    const person = runtime.validatePersonInput(payload, false)
    runtime.assertUniquePerson(dao, person.username, person.email, '')
    const record = new Record(dao.findCollectionByNameOrId('users'))
    record.set('username', person.username)
    record.set('name', person.name)
    record.set('email', person.email)
    record.set('emailVisibility', true)
    record.set('role', person.role)
    record.set('department', person.department)
    record.set('is_active', true)
    record.set('must_change_password', true)
    const temporaryPassword = $security.randomStringWithAlphabet(16, 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789')
    record.setPassword(temporaryPassword)
    dao.saveRecord(record)
    afterData = { username: person.username, name: person.name, email: person.email, role: person.role, department: person.department, is_active: true, must_change_password: true }
    result = { id: record.id, username: person.username, name: person.name, role: person.role, department: person.department, is_active: true, must_change_password: true, temporary_password: temporaryPassword, password_notice: '临时密码仅本次返回，请立即安全转交员工' }
  } else if (action === 'person_update') {
    runtime.assertPayload(payload, ['user_id', 'username', 'name', 'email', 'role', 'department', 'reset_password', 'is_active'])
    runtime.requirePeopleManager(dao, agent)
    const userId = runtime.safeId(payload.user_id)
    const hasUpdate = ['username', 'name', 'email', 'role', 'department'].some((field) => Object.prototype.hasOwnProperty.call(payload, field)) || payload.reset_password === true || payload.is_active === true
    if (!userId || !hasUpdate) throw new Error('INVALID_PAYLOAD')
    const record = dao.findRecordById('users', userId)
    if (record.getString('role') === 'admin' || record.id === agent.owner) throw new Error('PEOPLE_DENIED')
    const previousRole = record.getString('role')
    const person = runtime.validatePersonInput(payload, true)
    runtime.assertUniquePerson(dao, person.username, person.email, userId)
    beforeData = runtime.recordFields(record, ['username', 'name', 'email', 'role', 'department', 'is_active', 'must_change_password'])
    ;['username', 'name', 'email', 'role', 'department'].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(payload, field)) record.set(field, person[field])
    })
    if (Object.prototype.hasOwnProperty.call(payload, 'email')) record.set('emailVisibility', true)
    if (record.getString('role') !== previousRole) record.refreshTokenKey()
    if (Object.prototype.hasOwnProperty.call(payload, 'is_active') && record.getBool('is_active') !== payload.is_active) {
      record.set('is_active', payload.is_active)
      record.refreshTokenKey()
    }
    let temporaryPassword = ''
    if (payload.reset_password === true) {
      temporaryPassword = $security.randomStringWithAlphabet(16, 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789')
      record.setPassword(temporaryPassword)
      record.set('must_change_password', true)
      record.refreshTokenKey()
    }
    dao.saveRecord(record)
    afterData = runtime.recordFields(record, ['username', 'name', 'email', 'role', 'department', 'is_active', 'must_change_password'])
    result = temporaryPassword
      ? { ...afterData, temporary_password: temporaryPassword, password_notice: '临时密码仅本次返回，请立即安全转交员工' }
      : afterData
  } else if (action === 'person_disable') {
    runtime.assertPayload(payload, ['user_id'])
    runtime.requirePeopleManager(dao, agent)
    const userId = runtime.safeId(payload.user_id)
    if (!userId) throw new Error('INVALID_PAYLOAD')
    const record = dao.findRecordById('users', userId)
    if (record.getString('role') === 'admin' || record.id === agent.owner) throw new Error('PEOPLE_DENIED')
    beforeData = runtime.recordFields(record, ['username', 'name', 'role', 'department', 'is_active'])
    if (record.getBool('is_active')) {
      record.set('is_active', false)
      record.refreshTokenKey()
      dao.saveRecord(record)
    }
    afterData = runtime.recordFields(record, ['username', 'name', 'role', 'department', 'is_active'])
    result = afterData
  } else if (action === 'person_delete') {
    const preview = runtime.validateHighImpactAccess(dao, agent, action, payload)
    const record = dao.findRecordById('users', preview.user_id)
    beforeData = runtime.recordFields(record, ['username', 'name', 'email', 'role', 'department', 'is_active'])
    dao.deleteRecord(record)
    result = { deleted: record.id, username: record.getString('username') }
  } else if (action === 'project_create') {
    runtime.assertPayload(payload, ['name', 'description', 'manager_id', 'members', 'start_date', 'deadline'])
    const name = typeof payload.name === 'string' ? payload.name.trim() : ''
    const managerId = $app.store().get('__epmsAgent').safeId(payload.manager_id)
    if (!name || name.length > 160 || !managerId || String(payload.description || '').length > 4000 || (payload.start_date && !runtime.validDate(payload.start_date)) || (payload.deadline && !runtime.validDate(payload.deadline))) throw new Error('INVALID_PAYLOAD')
    if (agent.projects.length > 0) throw new Error('PROJECT_DENIED')
    const manager = dao.findRecordById('users', managerId)
    if (!manager.getBool('is_active')) throw new Error('INVALID_PAYLOAD')
    const record = new Record(dao.findCollectionByNameOrId('projects'))
    record.set('name', name)
    record.set('description', String(payload.description || '').trim())
    record.set('manager', managerId)
    const members = Array.isArray(payload.members) ? payload.members.map($app.store().get('__epmsAgent').safeId).filter(Boolean) : [managerId]
    if (members.length === 0) members.push(managerId)
    if (members.length > 100 || members.some((memberId, index) => members.indexOf(memberId) !== index)) throw new Error('INVALID_PAYLOAD')
    members.forEach((memberId) => { if (!dao.findRecordById('users', memberId).getBool('is_active')) throw new Error('INVALID_PAYLOAD') })
    record.set('members', members)
    record.set('status', 'active')
    if (payload.start_date) record.set('start_date', payload.start_date)
    if (payload.deadline) record.set('deadline', payload.deadline)
    dao.saveRecord(record)
    projectId = record.id
    afterData = { name: name, manager: managerId, status: 'active' }
    result = { id: record.id, name: name, status: 'active' }
  } else if (action === 'project_update' || action === 'project_archive') {
    runtime.assertPayload(payload, action === 'project_archive' ? ['project_id', 'archived'] : ['project_id', 'name', 'description', 'start_date', 'deadline'])
    const project = $app.store().get('__epmsAgent').requireProject(agent, projectId, dao)
    beforeData = $app.store().get('__epmsAgent').recordFields(project, ['name', 'description', 'status', 'manager', 'members', 'start_date', 'deadline'])
    if (action === 'project_archive') {
      project.set('status', payload.archived === false ? 'active' : 'archived')
    } else {
      if (Object.prototype.hasOwnProperty.call(payload, 'name') && (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.trim().length > 160)) throw new Error('INVALID_PAYLOAD')
      if (Object.prototype.hasOwnProperty.call(payload, 'description') && (typeof payload.description !== 'string' || payload.description.length > 4000)) throw new Error('INVALID_PAYLOAD')
      if ((payload.start_date && !runtime.validDate(payload.start_date)) || (payload.deadline && !runtime.validDate(payload.deadline))) throw new Error('INVALID_PAYLOAD')
      ;['name', 'description', 'start_date', 'deadline'].forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(payload, field)) project.set(field, payload[field])
      })
    }
    dao.saveRecord(project)
    afterData = $app.store().get('__epmsAgent').recordFields(project, ['name', 'description', 'status', 'manager', 'members', 'start_date', 'deadline'])
    result = { id: project.id, status: project.getString('status') }
  } else if (action === 'task_create') {
    runtime.assertPayload(payload, ['project_id', 'stage_name', 'description', 'assignees', 'deadline', 'priority', 'sequence'])
    const project = $app.store().get('__epmsAgent').requireProject(agent, projectId, dao)
    const title = typeof payload.stage_name === 'string' ? payload.stage_name.trim() : ''
    const assignees = Array.isArray(payload.assignees) ? payload.assignees.map($app.store().get('__epmsAgent').safeId).filter(Boolean) : []
    if (!title || title.length > 200 || !runtime.validDate(payload.deadline) || assignees.length === 0 || assignees.length > 30 || assignees.some((assigneeId, index) => assignees.indexOf(assigneeId) !== index) || (payload.description && String(payload.description).length > 4000) || ['low', 'normal', 'high'].indexOf(payload.priority || 'normal') === -1) throw new Error('INVALID_PAYLOAD')
    runtime.requireProjectMembers(dao, project, assignees)
    const task = new Record(dao.findCollectionByNameOrId('tasks'))
    task.set('project', projectId); task.set('stage_name', title); task.set('description', String(payload.description || ''))
    task.set('assignees', assignees); task.set('deadline', payload.deadline); task.set('status', 'pending')
    task.set('priority', payload.priority || 'normal'); task.set('created_by', agent.owner); task.set('sequence', Number(payload.sequence) || Date.now())
    dao.saveRecord(task); taskId = task.id
    afterData = { stage_name: title, status: 'pending', assignees: assignees }
    result = { id: task.id, project: projectId, status: 'pending' }
  } else if (action === 'task_update' || action === 'task_complete' || action === 'task_block' || action === 'task_unblock') {
    const taskKeys = action === 'task_update'
      ? ['task_id', 'stage_name', 'description', 'deadline', 'priority']
      : action === 'task_complete'
        ? ['task_id', 'proposed_title', 'proposed_description', 'proposed_assignees', 'proposed_due_date']
        : action === 'task_block'
          ? ['task_id', 'reason_type', 'reason_detail', 'need_help_from', 'expected_resolve', 'rollback_to_task_id']
          : ['task_id', 'status']
    runtime.assertPayload(payload, taskKeys)
    const task = dao.findRecordById('tasks', taskId)
    projectId = task.getString('project'); const project = $app.store().get('__epmsAgent').requireProject(agent, projectId, dao)
    beforeData = $app.store().get('__epmsAgent').recordFields(task, ['stage_name', 'description', 'status', 'assignees', 'deadline', 'priority', 'blocker'])
    if (action === 'task_update') {
      if (Object.prototype.hasOwnProperty.call(payload, 'stage_name') && (typeof payload.stage_name !== 'string' || !payload.stage_name.trim() || payload.stage_name.trim().length > 200)) throw new Error('INVALID_PAYLOAD')
      if (Object.prototype.hasOwnProperty.call(payload, 'description') && (typeof payload.description !== 'string' || payload.description.length > 4000)) throw new Error('INVALID_PAYLOAD')
      if (payload.deadline && !runtime.validDate(payload.deadline)) throw new Error('INVALID_PAYLOAD')
      if (payload.priority && ['low', 'normal', 'high'].indexOf(payload.priority) === -1) throw new Error('INVALID_PAYLOAD')
      ;['stage_name', 'description', 'deadline', 'priority'].forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(payload, field)) task.set(field, payload[field])
      })
    } else if (action === 'task_complete') {
      const proposedTitle = typeof payload.proposed_title === 'string' ? payload.proposed_title.trim() : ''
      const proposedDescription = typeof payload.proposed_description === 'string' ? payload.proposed_description.trim() : ''
      const proposedAssignees = Array.isArray(payload.proposed_assignees) ? payload.proposed_assignees.map($app.store().get('__epmsAgent').safeId).filter(Boolean) : []
      const proposedDueDate = typeof payload.proposed_due_date === 'string' ? payload.proposed_due_date : ''
      if (!proposedTitle || proposedTitle.length > 200 || proposedDescription.length > 2000 || !runtime.validDate(proposedDueDate) || proposedAssignees.length === 0 || proposedAssignees.length > 30 || proposedAssignees.some((assigneeId, index) => proposedAssignees.indexOf(assigneeId) !== index)) throw new Error('INVALID_PAYLOAD')
      runtime.requireProjectMembers(dao, project, proposedAssignees)
      const existingHandoffs = dao.findRecordsByFilter('handoffs', `from_task = "${taskId}" && (status = "pending" || status = "approved")`, '', 1, 0)
      if (existingHandoffs.length > 0 || task.getString('status') === 'completed') throw new Error('WORKFLOW_CONFLICT')
      task.set('status', 'completed'); task.set('completed_at', $app.store().get('__epmsAgent').isoNow())
      dao.saveRecord(task)
      const handoff = new Record(dao.findCollectionByNameOrId('handoffs'))
      handoff.set('project', projectId)
      handoff.set('from_task', taskId)
      handoff.set('proposed_title', proposedTitle)
      handoff.set('proposed_description', proposedDescription)
      handoff.set('proposed_assignees', proposedAssignees)
      handoff.set('proposed_due_date', proposedDueDate)
      handoff.set('status', 'pending')
      handoff.set('submitter', agent.owner)
      dao.saveRecord(handoff)
      const audience = (project.getStringSlice('members') || []).slice()
      const managerId = project.getString('manager')
      if (managerId && audience.indexOf(managerId) === -1) audience.push(managerId)
      audience.forEach((userId) => {
        if (!userId || userId === agent.owner) return
        const notification = new Record(dao.findCollectionByNameOrId('notifications'))
        notification.set('user', userId); notification.set('type', 'task_update')
        notification.set('title', '任务完成待交接审核')
        notification.set('content', `「${task.getString('stage_name')}」已完成并提交交接提案`)
        notification.set('link_type', 'task'); notification.set('link_id', taskId); notification.set('is_read', false)
        dao.saveRecord(notification)
      })
      result = { id: task.id, status: task.getString('status'), handoff_id: handoff.id }
    } else if (action === 'task_block') {
      const detail = String(payload.reason_detail || '').trim()
      if (!detail || detail.length > 4000 || (payload.need_help_from && !Array.isArray(payload.need_help_from))) throw new Error('INVALID_PAYLOAD')
      const helpers = Array.isArray(payload.need_help_from) ? payload.need_help_from.map(runtime.safeId).filter(Boolean) : []
      if (helpers.length !== (payload.need_help_from || []).length || helpers.some((userId, index) => helpers.indexOf(userId) !== index)) throw new Error('INVALID_PAYLOAD')
      runtime.requireProjectMembers(dao, project, helpers)
      if (task.getString('status') === 'completed' || task.getString('status') === 'blocked') throw new Error('WORKFLOW_CONFLICT')
      const rollbackId = $app.store().get('__epmsAgent').safeId(payload.rollback_to_task_id)
      if (payload.rollback_to_task_id && !rollbackId) throw new Error('INVALID_PAYLOAD')
      if (rollbackId) {
        const rollback = dao.findRecordById('tasks', rollbackId)
        if (rollback.getString('project') !== projectId) throw new Error('PROJECT_DENIED')
        rollback.set('status', 'in_progress'); rollback.set('completed_at', ''); dao.saveRecord(rollback)
        const rollbackAssignees = rollback.getStringSlice('assignees') || []
        rollbackAssignees.forEach((userId) => {
          if (!userId || userId === agent.owner) return
          const notification = new Record(dao.findCollectionByNameOrId('notifications'))
          notification.set('user', userId); notification.set('type', 'task_rollback'); notification.set('title', '任务被回退，需要重新处理')
          notification.set('content', `「${task.getString('stage_name')}」遇到卡点：${detail}`); notification.set('link_type', 'task')
          notification.set('link_id', rollbackId); notification.set('is_read', false); dao.saveRecord(notification)
        })
      }
      task.set('status', 'blocked')
      task.set('completed_at', '')
      task.set('blocker', { reason_type: payload.reason_type || 'other', reason_detail: detail, need_help_from: helpers, expected_resolve: payload.expected_resolve || '', rollback_to: rollbackId || null })
    } else {
      if (payload.status !== 'completed' && payload.status !== 'in_progress') throw new Error('INVALID_PAYLOAD')
      if (task.getString('status') !== 'blocked') throw new Error('WORKFLOW_CONFLICT')
      let blocker = task.get('blocker') || {}
      if (typeof blocker === 'string') { try { blocker = JSON.parse(blocker) } catch (_) { blocker = {} } }
      const rollbackId = blocker && typeof blocker.rollback_to === 'string' ? $app.store().get('__epmsAgent').safeId(blocker.rollback_to) : ''
      task.set('status', payload.status === 'completed' ? 'completed' : 'in_progress'); task.set('blocker', null)
      task.set('completed_at', payload.status === 'completed' ? $app.store().get('__epmsAgent').isoNow() : '')
      if (rollbackId) {
        const rollback = dao.findRecordById('tasks', rollbackId)
        if (rollback.getString('project') !== projectId) throw new Error('PROJECT_DENIED')
        if (rollback.getString('status') === 'in_progress') {
          rollback.set('status', 'completed'); rollback.set('completed_at', $app.store().get('__epmsAgent').isoNow()); dao.saveRecord(rollback)
        }
      }
    }
    if (action !== 'task_complete') dao.saveRecord(task)
    afterData = $app.store().get('__epmsAgent').recordFields(task, ['stage_name', 'description', 'status', 'assignees', 'deadline', 'priority', 'blocker'])
    result = {
      id: task.id,
      status: task.getString('status'),
      ...(action === 'task_complete' && result && result.handoff_id ? { handoff_id: result.handoff_id } : {}),
    }
  } else if (action === 'comment_create') {
    runtime.assertPayload(payload, ['task_id', 'content'])
    const task = dao.findRecordById('tasks', taskId); projectId = task.getString('project'); $app.store().get('__epmsAgent').requireProject(agent, projectId, dao)
    const content = String(payload.content || '').trim()
    if (!content || content.length > 4000) throw new Error('INVALID_PAYLOAD')
    const comment = new Record(dao.findCollectionByNameOrId('comments'))
    comment.set('project', projectId); comment.set('step', taskId); comment.set('author', agent.owner); comment.set('content', content)
    dao.saveRecord(comment); afterData = { content: content }; result = { id: comment.id }
  } else if (action === 'task_bulk_reassign') {
    runtime.assertPayload(payload, ['project_id', 'task_ids', 'assignees'])
    projectId = $app.store().get('__epmsAgent').safeId(payload.project_id); const project = $app.store().get('__epmsAgent').requireProject(agent, projectId, dao)
    const taskIds = Array.isArray(payload.task_ids) ? payload.task_ids.map($app.store().get('__epmsAgent').safeId).filter(Boolean) : []
    const assignees = Array.isArray(payload.assignees) ? payload.assignees.map($app.store().get('__epmsAgent').safeId).filter(Boolean) : []
    const uniqueTasks = taskIds.every((id, index) => taskIds.indexOf(id) === index)
    const uniqueAssignees = assignees.every((id, index) => assignees.indexOf(id) === index)
    if (taskIds.length === 0 || taskIds.length > 100 || assignees.length === 0 || !uniqueTasks || !uniqueAssignees) throw new Error('INVALID_PAYLOAD')
    runtime.requireProjectMembers(dao, project, assignees)
    taskIds.forEach((id) => { const task = dao.findRecordById('tasks', id); if (task.getString('project') !== projectId) throw new Error('PROJECT_DENIED'); task.set('assignees', assignees); dao.saveRecord(task) })
    afterData = { task_ids: taskIds, assignees: assignees }; result = { updated: taskIds.length }
  } else if (action === 'task_delete') {
    runtime.assertPayload(payload, ['task_id'])
    const task = dao.findRecordById('tasks', taskId); projectId = task.getString('project'); $app.store().get('__epmsAgent').requireProject(agent, projectId, dao)
    const refs = dao.findRecordsByFilter('handoffs', `from_task = "${taskId}"`, '', 1, 0)
    const next = dao.findRecordsByFilter('tasks', `predecessor_tasks ?= "${taskId}"`, '', 1, 0)
    if (refs.length || next.length) throw new Error('TASK_REFERENCED')
    beforeData = $app.store().get('__epmsAgent').recordFields(task, ['stage_name', 'status', 'assignees']); dao.deleteRecord(task); result = { deleted: taskId }
  } else if (action === 'handoff_decide') {
    runtime.assertPayload(payload, ['handoff_id', 'decision', 'review_note'])
    const handoffId = $app.store().get('__epmsAgent').safeId(payload.handoff_id)
    const handoff = dao.findRecordById('handoffs', handoffId); projectId = handoff.getString('project'); $app.store().get('__epmsAgent').requireProject(agent, projectId, dao)
    if (handoff.getString('status') !== 'pending') throw new Error('WORKFLOW_CONFLICT')
    const decision = payload.decision === 'approved' ? 'approved' : payload.decision === 'rejected' ? 'rejected' : ''
    const reviewNote = String(payload.review_note || '').trim()
    if (!decision || (decision === 'rejected' && !reviewNote)) throw new Error('INVALID_PAYLOAD')
    const source = dao.findRecordById('tasks', handoff.getString('from_task'))
    if (source.getString('project') !== projectId) throw new Error('PROJECT_DENIED')
    let approvedTaskId = ''
    handoff.set('status', decision); handoff.set('reviewer', agent.owner); handoff.set('review_note', reviewNote)
    if (decision === 'approved') {
      const project = dao.findRecordById('projects', projectId)
      runtime.requireProjectMembers(dao, project, handoff.getStringSlice('proposed_assignees') || [])
      const nextTask = new Record(dao.findCollectionByNameOrId('tasks'))
      nextTask.set('project', projectId)
      nextTask.set('stage_name', handoff.getString('proposed_title'))
      nextTask.set('next_steps', handoff.getString('proposed_description'))
      nextTask.set('assignees', handoff.getStringSlice('proposed_assignees') || [])
      nextTask.set('start_date', handoff.getString('proposed_start_date'))
      nextTask.set('deadline', handoff.getString('proposed_due_date'))
      nextTask.set('status', 'pending')
      nextTask.set('sequence', Date.now())
      nextTask.set('predecessor_tasks', [source.id])
      nextTask.set('created_by', agent.owner)
      dao.saveRecord(nextTask)
      approvedTaskId = nextTask.id
      handoff.set('approved_task', nextTask.id)
      source.set('status', 'completed'); source.set('completed_at', $app.store().get('__epmsAgent').isoNow()); dao.saveRecord(source)
      const members = project.getStringSlice('members') || []
      const nextAssignees = nextTask.getStringSlice('assignees') || []
      nextAssignees.forEach((userId) => {
        if (members.indexOf(userId) === -1) members.push(userId)
        const notification = new Record(dao.findCollectionByNameOrId('notifications'))
        notification.set('user', userId); notification.set('type', 'task_assigned'); notification.set('title', '您有新的项目任务')
        notification.set('content', `「${nextTask.getString('stage_name')}」已通过交接审核`); notification.set('link_type', 'task')
        notification.set('link_id', nextTask.id); notification.set('is_read', false); dao.saveRecord(notification)
      })
      project.set('members', members); dao.saveRecord(project)
    } else {
      source.set('status', 'in_progress'); source.set('completed_at', ''); dao.saveRecord(source)
      const submitter = handoff.getString('submitter')
      if (submitter) {
        const notification = new Record(dao.findCollectionByNameOrId('notifications'))
        notification.set('user', submitter); notification.set('type', 'audit_rejected'); notification.set('title', '交接审核未通过')
        notification.set('content', reviewNote); notification.set('link_type', 'task'); notification.set('link_id', source.id)
        notification.set('is_read', false); dao.saveRecord(notification)
      }
    }
    dao.saveRecord(handoff)
    taskId = decision === 'approved' ? approvedTaskId : source.id
    afterData = { handoff_id: handoff.id, status: decision, approved_task_id: approvedTaskId || null, reviewer: agent.owner }
    result = { id: handoff.id, status: decision, approved_task_id: approvedTaskId || null, source_task_id: source.id }
  } else {
    throw new Error('UNKNOWN_ACTION')
  }

  $app.store().get('__epmsAgent').saveAgentAudit(dao, agent, requestId, action, projectId, taskId, beforeData, afterData)
  return result
}

// PocketBase 0.22 invokes router callbacks in a separate JS scope. Expose the
// shared helpers explicitly so custom routes do not lose their closures.
$app.store().set('__epmsAgent', {
  highImpactActions: AGENT_HIGH_IMPACT_ACTIONS,
  actionScopes: AGENT_ACTION_SCOPES,
  personRoles: AGENT_PERSON_ROLES,
  departments: AGENT_DEPARTMENTS,
  agentError,
  safeId,
  safeKey,
  stableStringify,
  jsonObject,
  pageInput,
  isoNow,
  validDate,
  assertPayload,
  requirePeopleManager,
  userReferenceTypes,
  validatePersonInput,
  assertUniquePerson,
  operationPayload,
  operationResult,
  getAgent,
  requireAgent,
  projectAllowed,
  requireProject,
  requireProjectMembers,
  listRecords,
  agentProjectFilter,
  validateHighImpactAccess,
  recordFields,
  saveAgentAudit,
  executeAgentAction,
})

onRecordBeforeAuthWithPasswordRequest((e) => {
  if (!e.record || !e.record.getBool('enabled')) throw new UnauthorizedError('服务账号已停用')
  const expiresAt = Date.parse(String(e.record.getString('expires_at') || '').replace(' ', 'T'))
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new UnauthorizedError('服务账号已过期')
}, 'service_accounts')

onRecordBeforeAuthRefreshRequest((e) => {
  if (!e.record || !e.record.getBool('enabled')) throw new UnauthorizedError('服务账号已停用')
  const expiresAt = Date.parse(String(e.record.getString('expires_at') || '').replace(' ', 'T'))
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new UnauthorizedError('服务账号已过期')
}, 'service_accounts')

// 管理员创建服务账号；随机 secret 仅在本次响应中返回。
routerAdd('POST', '/api/custom/agent/v1/admin/service-accounts', (c) => {
  const runtime = $app.store().get('__epmsAgent')
  const info = $apis.requestInfo(c)
  const admin = info.authRecord
  let adminAllowed = false
  try {
    adminAllowed = !!admin && admin.collection().name === 'users' && admin.getBool('is_active') && !admin.getBool('must_change_password') && admin.getString('role') === 'admin'
  } catch (_) {
    return runtime.agentError(c, 500, 'ACTOR_CHECK_FAILED', '无法验证管理员身份')
  }
  if (!adminAllowed) {
    return runtime.agentError(c, 403, 'ADMIN_REQUIRED', '仅管理员可创建服务账号')
  }
  const data = info.data || {}
  const allowedKeys = ['owner', 'name', 'scopes', 'expires_at', 'allowed_projects']
  if (Object.keys(data).some((key) => allowedKeys.indexOf(key) === -1)) return runtime.agentError(c, 400, 'INVALID_INPUT', '服务账号参数无效')
  let owner = ''
  let name = ''
  let scopes = []
  let expiresAt = 0
  try {
    owner = typeof data.owner === 'string' && /^[a-z0-9]{15}$/.test(data.owner) ? data.owner : ''
    name = String(data.name || '').trim()
    scopes = Array.isArray(data.scopes) ? data.scopes.slice() : []
    expiresAt = new Date(String(data.expires_at || '')).getTime()
  } catch (_) {
    return runtime.agentError(c, 400, 'INVALID_INPUT', '服务账号参数无效')
  }
  const allowedScopes = ['read', 'write', 'comment', 'approve', 'archive', 'delete', 'reassign', 'people_manage']
  const hasAllowedProjects = Object.prototype.hasOwnProperty.call(data, 'allowed_projects')
  const requestedProjects = Array.isArray(data.allowed_projects) ? data.allowed_projects : []
  const validProjects = requestedProjects.every((value) => runtime.safeId(value))
  const uniqueScopes = scopes.every((scope, index) => scopes.indexOf(scope) === index)
  const uniqueProjects = requestedProjects.every((projectId, index) => requestedProjects.indexOf(projectId) === index)
  if (!owner || !name || name.length > 100 || !Array.isArray(data.scopes) || scopes.length === 0 || scopes.some((scope) => typeof scope !== 'string' || allowedScopes.indexOf(scope) === -1) || !uniqueScopes || !hasAllowedProjects || !Array.isArray(data.allowed_projects) || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || !validProjects || !uniqueProjects) return runtime.agentError(c, 400, 'INVALID_INPUT', '服务账号参数无效')
  let ownerRecord
  try { ownerRecord = $app.dao().findRecordById('users', owner) } catch (_) { return runtime.agentError(c, 400, 'INVALID_OWNER', '所有者不存在') }
  if (!ownerRecord.getBool('is_active')) return runtime.agentError(c, 400, 'INVALID_OWNER', '所有者必须是启用用户')
  if (scopes.indexOf('people_manage') !== -1 && (ownerRecord.getString('role') !== 'admin' || ownerRecord.getBool('must_change_password') || requestedProjects.length > 0)) return runtime.agentError(c, 400, 'INVALID_PEOPLE_SCOPE', '人员管理仅允许已完成改密的全项目管理员使用')
  for (let i = 0; i < requestedProjects.length; i += 1) {
    try { $app.dao().findRecordById('projects', requestedProjects[i]) } catch (_) { return runtime.agentError(c, 400, 'INVALID_PROJECT', '允许项目不存在') }
  }
  try {
    const secret = $security.randomString(64)
    const username = `agent_${$security.randomString(20).toLowerCase()}`
    const record = new Record($app.dao().findCollectionByNameOrId('service_accounts'))
    record.set('username', username); record.setPassword(secret); record.set('name', name); record.set('owner', owner)
    record.set('scopes', scopes); record.set('enabled', true); record.set('expires_at', new Date(expiresAt).toISOString())
    record.set('allowed_projects', requestedProjects)
    $app.dao().saveRecord(record)
    return c.json(201, { id: record.id, username: username, secret: secret, expires_at: record.getString('expires_at'), scopes: scopes, allowed_projects: requestedProjects, access_mode: requestedProjects.length === 0 ? 'all_projects' : 'selected_projects' })
  } catch (_) {
    return runtime.agentError(c, 400, 'SERVICE_ACCOUNT_CREATE_FAILED', '服务账号创建失败')
  }
})

routerAdd('POST', '/api/custom/agent/v1/query', (c) => {
  const runtime = $app.store().get('__epmsAgent')
  let agent
  try {
    agent = runtime.requireAgent(c, 'read')
  } catch (_) {
    return runtime.agentError(c, 500, 'AUTH_CHECK_FAILED', '无法验证服务账号')
  }
  if (agent.denied) return
  const data = $apis.requestInfo(c).data || {}
  const query = String(data.query || '')
  const paging = runtime.pageInput(data)
  const dao = $app.dao()
  let list
  let items
  try {
    if (query === 'people') {
      const peopleManager = agent.scopes.indexOf('people_manage') !== -1
      const includeInactive = data.include_inactive === true
      if (includeInactive && !peopleManager) return runtime.agentError(c, 403, 'SCOPE_DENIED', '查询停用账号需要 people_manage scope')
      if (peopleManager) runtime.requirePeopleManager(dao, agent)
      list = runtime.listRecords(dao, 'users', includeInactive ? 'id != ""' : 'is_active = true', 'department,name', paging.page, paging.perPage)
      items = list.records.map((record) => runtime.recordFields(record, peopleManager
        ? ['name', 'username', 'email', 'role', 'department', 'is_active', 'must_change_password']
        : ['name', 'username', 'role', 'department', 'is_active']))
    } else if (query === 'projects') {
      list = runtime.listRecords(dao, 'projects', runtime.agentProjectFilter(agent), '-updated', paging.page, paging.perPage)
      items = list.records.map((record) => runtime.recordFields(record, ['name', 'description', 'status', 'manager', 'members', 'start_date', 'deadline', 'progress']))
    } else if (query === 'tasks') {
      const projectFilter = runtime.agentProjectFilter(agent, 'project')
      const requestedProject = runtime.safeId(data.project_id)
      if (data.project_id && !requestedProject) return runtime.agentError(c, 400, 'INVALID_PROJECT', '项目 ID 无效')
      if (requestedProject && !runtime.projectAllowed(agent, requestedProject)) return runtime.agentError(c, 403, 'PROJECT_DENIED', '项目超出服务账号范围')
      const filter = requestedProject ? `project = "${requestedProject}"` : projectFilter
      list = runtime.listRecords(dao, 'tasks', filter, 'deadline,sequence', paging.page, paging.perPage)
      items = list.records.map((record) => runtime.recordFields(record, ['project', 'stage_name', 'description', 'status', 'assignees', 'deadline', 'priority', 'blocker']))
    } else if (query === 'handoffs') {
      list = runtime.listRecords(dao, 'handoffs', runtime.agentProjectFilter(agent, 'project'), '-created', paging.page, paging.perPage)
      items = list.records.map((record) => runtime.recordFields(record, ['project', 'from_task', 'proposed_title', 'proposed_assignees', 'proposed_due_date', 'status', 'submitter', 'reviewer']))
    } else if (query === 'changes') {
      list = runtime.listRecords(dao, 'audit_logs', runtime.agentProjectFilter(agent, 'project'), '-created', paging.page, paging.perPage)
      items = list.records.map((record) => runtime.recordFields(record, ['project', 'task', 'action_type', 'operator', 'source', 'service_account', 'request_id', 'before_data', 'after_data']))
    } else if (query === 'management_summary' || query === 'daily_briefing') {
      const tasks = dao.findRecordsByFilter('tasks', runtime.agentProjectFilter(agent, 'project'), 'deadline', 2000, 0)
      const handoffs = dao.findRecordsByFilter('handoffs', runtime.agentProjectFilter(agent, 'project'), '-created', 2000, 0)
      const now = Date.now(); const inThreeDays = now + 3 * 86400000
      const summary = { total_tasks: tasks.length, overdue: 0, due_within_3_days: 0, blocked: 0, unassigned: 0, pending_handoffs: 0, workload: {} }
      tasks.forEach((task) => {
        const status = task.getString('status'); const deadline = new Date(task.getString('deadline')).getTime()
        if (status !== 'completed' && Number.isFinite(deadline) && deadline < now) summary.overdue += 1
        if (status !== 'completed' && Number.isFinite(deadline) && deadline >= now && deadline <= inThreeDays) summary.due_within_3_days += 1
        if (status === 'blocked') summary.blocked += 1
        const assignees = task.getStringSlice('assignees') || []; if (assignees.length === 0) summary.unassigned += 1
        assignees.forEach((id) => { summary.workload[id] = (summary.workload[id] || 0) + (status === 'completed' ? 0 : 1) })
      })
      handoffs.forEach((handoff) => { if (handoff.getString('status') === 'pending') summary.pending_handoffs += 1 })
      return c.json(200, { data: summary, generated_at: runtime.isoNow() })
    } else return runtime.agentError(c, 400, 'UNKNOWN_QUERY', '不支持的查询')
    return c.json(200, { page: list.page, per_page: list.per_page, has_more: list.has_more, next_page: list.next_page, items: items })
  } catch (error) {
    if (String(error).indexOf('PEOPLE_DENIED') !== -1) return runtime.agentError(c, 403, 'PEOPLE_DENIED', '人员管理仅允许全项目管理员服务账号执行')
    return runtime.agentError(c, 500, 'QUERY_FAILED', '查询失败')
  }
})

routerAdd('POST', '/api/custom/agent/v1/commands/execute', (c) => {
  const runtime = $app.store().get('__epmsAgent')
  const data = $apis.requestInfo(c).data || {}; const action = String(data.action || '')
  if (runtime.highImpactActions.indexOf(action) !== -1) return runtime.agentError(c, 409, 'CONFIRMATION_REQUIRED', '该操作必须先预览并确认')
  const scope = runtime.actionScopes[action]; if (!scope) return runtime.agentError(c, 400, 'UNKNOWN_ACTION', '不支持的操作')
  const agent = runtime.requireAgent(c, scope); if (agent.denied) return
  const idempotencyKey = runtime.safeKey(data.idempotency_key); const requestId = runtime.safeKey(data.request_id)
  if (!idempotencyKey || !requestId) return runtime.agentError(c, 400, 'INVALID_REQUEST_KEY', '幂等键或请求 ID 无效')
  const hash = $security.sha256(runtime.stableStringify({ action: action, payload: data.payload || {} }))
  try {
    let output
    let replayed = false
    $app.dao().runInTransaction((dao) => {
      const existing = dao.findRecordsByFilter('agent_operations', `service_account = "${agent.record.id}" && idempotency_key = "${idempotencyKey}"`, '', 1, 0)
      if (existing.length) {
        if (existing[0].getString('request_hash') !== hash) throw new Error('IDEMPOTENCY_CONFLICT')
        if (existing[0].getString('status') !== 'succeeded') throw new Error('IDEMPOTENCY_IN_PROGRESS')
        output = runtime.jsonObject(existing[0], 'result'); replayed = true; return
      }
      const operation = new Record(dao.findCollectionByNameOrId('agent_operations'))
      operation.set('service_account', agent.record.id); operation.set('idempotency_key', idempotencyKey); operation.set('request_id', requestId)
      operation.set('action', action); operation.set('request_hash', hash); operation.set('status', 'pending'); operation.set('payload', runtime.operationPayload(action, data.payload || {}))
      dao.saveRecord(operation)
      output = runtime.executeAgentAction(dao, agent, requestId, action, data.payload || {})
      operation.set('status', 'succeeded'); operation.set('result', runtime.operationResult(action, output)); operation.set('consumed_at', runtime.isoNow()); dao.saveRecord(operation)
    })
    return c.json(200, { result: output, idempotent: true, replayed: replayed })
  } catch (error) {
    const message = String(error)
    if (message.indexOf('IDEMPOTENCY_CONFLICT') !== -1) return runtime.agentError(c, 409, 'IDEMPOTENCY_CONFLICT', '幂等键已用于不同请求')
    if (message.indexOf('IDEMPOTENCY_IN_PROGRESS') !== -1) return runtime.agentError(c, 409, 'IDEMPOTENCY_IN_PROGRESS', '相同幂等请求正在执行')
    if (message.indexOf('PROJECT_DENIED') !== -1) return runtime.agentError(c, 403, 'PROJECT_DENIED', '项目超出服务账号范围')
    if (message.indexOf('PROJECT_MEMBER_REQUIRED') !== -1) return runtime.agentError(c, 400, 'PROJECT_MEMBER_REQUIRED', '任务人员必须是项目成员')
    if (message.indexOf('WORKFLOW_CONFLICT') !== -1) return runtime.agentError(c, 409, 'WORKFLOW_CONFLICT', '任务状态不允许该操作')
    if (message.indexOf('TASK_REFERENCED') !== -1) return runtime.agentError(c, 409, 'TASK_REFERENCED', '任务仍被交接或后续任务引用')
    if (message.indexOf('PERSON_CONFLICT') !== -1) return runtime.agentError(c, 409, 'PERSON_CONFLICT', '登录账号或邮箱已被使用')
    if (message.indexOf('PERSON_ACTIVE') !== -1) return runtime.agentError(c, 409, 'PERSON_ACTIVE', '永久删除前必须先停用账号')
    if (message.indexOf('PERSON_REFERENCED') !== -1) return runtime.agentError(c, 409, 'PERSON_REFERENCED', '账号已有业务记录，请修改或停用以保留历史')
    if (message.indexOf('PEOPLE_DENIED') !== -1) return runtime.agentError(c, 403, 'PEOPLE_DENIED', '人员管理仅允许全项目管理员服务账号执行')
    if (message.indexOf('INVALID_PAYLOAD') !== -1) return runtime.agentError(c, 400, 'INVALID_PAYLOAD', '操作参数无效')
    return runtime.agentError(c, 400, 'COMMAND_FAILED', '操作未执行')
  }
})

routerAdd('POST', '/api/custom/agent/v1/commands/preview', (c) => {
  const runtime = $app.store().get('__epmsAgent')
  const data = $apis.requestInfo(c).data || {}; const action = String(data.action || '')
  if (runtime.highImpactActions.indexOf(action) === -1) return runtime.agentError(c, 400, 'PREVIEW_NOT_REQUIRED', '该操作无需二次确认')
  const agent = runtime.requireAgent(c, runtime.actionScopes[action]); if (agent.denied) return
  const idempotencyKey = runtime.safeKey(data.idempotency_key); const requestId = runtime.safeKey(data.request_id)
  if (!idempotencyKey || !requestId) return runtime.agentError(c, 400, 'INVALID_REQUEST_KEY', '幂等键或请求 ID 无效')
  const code = $security.randomStringWithAlphabet(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789')
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  const hash = $security.sha256(runtime.stableStringify({ action: action, payload: data.payload || {} }))
  try {
    const preview = runtime.validateHighImpactAccess($app.dao(), agent, action, data.payload || {})
    const existing = $app.dao().findRecordsByFilter('agent_operations', `service_account = "${agent.record.id}" && idempotency_key = "${idempotencyKey}"`, '', 1, 0)
    if (existing.length) return runtime.agentError(c, 409, 'IDEMPOTENCY_CONFLICT', '幂等键已存在')
    const operation = new Record($app.dao().findCollectionByNameOrId('agent_operations'))
    operation.set('service_account', agent.record.id); operation.set('idempotency_key', idempotencyKey); operation.set('request_id', requestId)
    operation.set('action', action); operation.set('request_hash', hash); operation.set('status', 'pending'); operation.set('payload', data.payload || {})
    operation.set('confirmation_hash', $security.sha256(code)); operation.set('expires_at', expiresAt); $app.dao().saveRecord(operation)
    return c.json(200, { operation_id: operation.id, action: action, preview: preview || data.payload || {}, confirmation_code: code, expires_at: expiresAt })
  } catch (error) {
    const message = String(error)
    if (message.indexOf('PROJECT_DENIED') !== -1) return runtime.agentError(c, 403, 'PROJECT_DENIED', '项目超出服务账号范围')
    if (message.indexOf('PROJECT_MEMBER_REQUIRED') !== -1) return runtime.agentError(c, 400, 'PROJECT_MEMBER_REQUIRED', '任务人员必须是项目成员')
    if (message.indexOf('IDEMPOTENCY_CONFLICT') !== -1) return runtime.agentError(c, 409, 'IDEMPOTENCY_CONFLICT', '幂等键已存在')
    if (message.indexOf('PERSON_ACTIVE') !== -1) return runtime.agentError(c, 409, 'PERSON_ACTIVE', '永久删除前必须先停用账号')
    if (message.indexOf('PERSON_REFERENCED') !== -1) return runtime.agentError(c, 409, 'PERSON_REFERENCED', '账号已有业务记录，请修改或停用以保留历史')
    if (message.indexOf('PEOPLE_DENIED') !== -1) return runtime.agentError(c, 403, 'PEOPLE_DENIED', '人员管理仅允许全项目管理员服务账号执行')
    return runtime.agentError(c, 400, 'PREVIEW_FAILED', '无法创建操作预览')
  }
})

routerAdd('POST', '/api/custom/agent/v1/commands/confirm', (c) => {
  const runtime = $app.store().get('__epmsAgent')
  const agent = runtime.requireAgent(c); if (agent.denied) return
  const data = $apis.requestInfo(c).data || {}; const operationId = runtime.safeId(data.operation_id); const code = String(data.confirmation_code || '')
  if (!operationId || !code) return runtime.agentError(c, 400, 'INVALID_CONFIRMATION', '确认参数无效')
  try {
    let output
    $app.dao().runInTransaction((dao) => {
      const operation = dao.findRecordById('agent_operations', operationId)
      if (operation.getString('service_account') !== agent.record.id) throw new Error('CONFIRMATION_DENIED')
      if (operation.getString('status') === 'succeeded') throw new Error('CONFIRMATION_USED')
      if (operation.getString('status') !== 'pending' || operation.getString('consumed_at')) throw new Error('CONFIRMATION_USED')
      if (Date.parse(String(operation.getString('expires_at') || '').replace(' ', 'T')) <= Date.now()) throw new Error('CONFIRMATION_EXPIRED')
      if ($security.sha256(code) !== operation.getString('confirmation_hash')) throw new Error('CONFIRMATION_INVALID')
      const action = operation.getString('action'); const scope = runtime.actionScopes[action]
      if (!scope || agent.scopes.indexOf(scope) === -1) throw new Error('SCOPE_DENIED')
      output = runtime.executeAgentAction(dao, agent, operation.getString('request_id'), action, runtime.jsonObject(operation, 'payload'))
      operation.set('status', 'succeeded'); operation.set('result', output); operation.set('consumed_at', runtime.isoNow()); dao.saveRecord(operation)
    })
    return c.json(200, { result: output })
  } catch (error) {
    const text = String(error)
    if (text.indexOf('EXPIRED') !== -1) return runtime.agentError(c, 410, 'CONFIRMATION_EXPIRED', '确认码已过期')
    if (text.indexOf('USED') !== -1) return runtime.agentError(c, 409, 'CONFIRMATION_USED', '确认码已使用')
    if (text.indexOf('PROJECT_DENIED') !== -1) return runtime.agentError(c, 403, 'PROJECT_DENIED', '项目超出服务账号范围')
    if (text.indexOf('PROJECT_MEMBER_REQUIRED') !== -1) return runtime.agentError(c, 400, 'PROJECT_MEMBER_REQUIRED', '任务人员必须是项目成员')
    if (text.indexOf('WORKFLOW_CONFLICT') !== -1) return runtime.agentError(c, 409, 'WORKFLOW_CONFLICT', '业务状态不允许该操作')
    if (text.indexOf('TASK_REFERENCED') !== -1) return runtime.agentError(c, 409, 'TASK_REFERENCED', '任务仍被交接或后续任务引用')
    if (text.indexOf('PERSON_ACTIVE') !== -1) return runtime.agentError(c, 409, 'PERSON_ACTIVE', '永久删除前必须先停用账号')
    if (text.indexOf('PERSON_REFERENCED') !== -1) return runtime.agentError(c, 409, 'PERSON_REFERENCED', '账号已有业务记录，请修改或停用以保留历史')
    if (text.indexOf('PEOPLE_DENIED') !== -1) return runtime.agentError(c, 403, 'PEOPLE_DENIED', '人员管理仅允许全项目管理员服务账号执行')
    if (text.indexOf('DENIED') !== -1 || text.indexOf('SCOPE') !== -1) return runtime.agentError(c, 403, 'CONFIRMATION_DENIED', '无权确认该操作')
    return runtime.agentError(c, 400, 'CONFIRMATION_INVALID', '确认失败')
  }
})
