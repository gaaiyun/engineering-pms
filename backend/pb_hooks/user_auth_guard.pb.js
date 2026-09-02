/**
 * 禁止已停用员工继续使用密码登录或刷新会话。
 * 管理员在用户管理中把 is_active 设为 false 后立即生效。
 */
onRecordBeforeAuthWithPasswordRequest((e) => {
  if (e.record && e.record.getBool('is_active') === false) {
    throw new UnauthorizedError('该账号已停用，请联系管理员')
  }
}, 'users')

onRecordBeforeAuthRefreshRequest((e) => {
  if (e.record && e.record.getBool('is_active') === false) {
    throw new UnauthorizedError('该账号已停用，请联系管理员')
  }
}, 'users')

// 所有通过管理员界面创建的账号都必须先修改初始密码。
onRecordBeforeCreateRequest((e) => {
  const info = $apis.requestInfo(e.httpContext)
  const actor = info.authRecord
  if (info.admin) {
    e.record.set('must_change_password', true)
    return
  }
  if (!actor || actor.getString('role') !== 'admin' || !actor.getBool('is_active')) {
    throw new ForbiddenError('仅启用中的管理员可以创建账号')
  }
  e.record.set('must_change_password', true)
}, 'users')

// 管理员不能把自己降权；系统始终至少保留一个启用中的管理员。
onRecordBeforeUpdateRequest((e) => {
  const next = e.record
  if (!next) return
  const current = $app.dao().findRecordById('users', next.id)
  const info = $apis.requestInfo(e.httpContext)
  const actor = info.authRecord
  const currentRole = current.getString('role')
  const nextRole = next.getString('role')
  const nextActive = next.getBool('is_active')
  const input = info.data || {}

  if (Object.prototype.hasOwnProperty.call(input, 'must_change_password')) {
    throw new ForbiddenError('不能直接修改首次改密状态')
  }

  if (actor && actor.getString('role') === 'admin' && typeof input.password === 'string' && input.password) {
    next.set('must_change_password', true)
  }

  if (actor && actor.id === next.id && currentRole === 'admin' && nextRole !== 'admin') {
    throw new BadRequestError('不能降低当前登录管理员的角色')
  }

  if (currentRole === 'admin' && current.getBool('is_active') && (nextRole !== 'admin' || !nextActive)) {
    const otherAdmins = $app.dao().findRecordsByFilter(
      'users',
      `id != "${next.id}" && role = "admin" && is_active = true`,
      '',
      1,
      0,
    )
    if (otherAdmins.length === 0) throw new BadRequestError('系统必须保留至少一个启用中的管理员')
  }

  if (currentRole !== nextRole || current.getBool('is_active') !== nextActive) {
    next.refreshTokenKey()
  }
}, 'users')

// 通过受控接口校验当前密码、更新密码并清除首次改密标记。
routerAdd('POST', '/api/custom/auth/change-password', (c) => {
  const info = $apis.requestInfo(c)
  const actor = info.authRecord
  if (!actor || !actor.getBool('is_active')) return c.json(401, { error: 'unauthorized' })

  const data = info.data || {}
  const currentPassword = typeof data.current_password === 'string' ? data.current_password : ''
  const newPassword = typeof data.new_password === 'string' ? data.new_password : ''
  const passwordConfirm = typeof data.password_confirm === 'string' ? data.password_confirm : ''
  if (!currentPassword || newPassword.length < 8 || newPassword !== passwordConfirm) {
    return c.json(400, { error: 'invalid password request' })
  }
  if (!actor.validatePassword(currentPassword)) return c.json(400, { error: 'current password is incorrect' })
  if (actor.validatePassword(newPassword)) return c.json(400, { error: 'new password must be different' })

  try {
    let updatedUser
    $app.dao().runInTransaction((dao) => {
      const user = dao.findRecordById('users', actor.id)
      user.setPassword(newPassword)
      user.set('must_change_password', false)
      dao.saveRecord(user)
      updatedUser = user

      const audit = new Record(dao.findCollectionByNameOrId('audit_logs'))
      audit.set('action_type', 'change_password')
      audit.set('operator', actor.id)
      audit.set('after_data', { must_change_password: false })
      dao.saveRecord(audit)
    })
    return c.json(200, {
      success: true,
      token: $tokens.recordAuthToken($app, updatedUser),
      record: updatedUser.publicExport(),
    })
  } catch (_) {
    return c.json(400, { error: 'password change failed' })
  }
}, $apis.requireRecordAuth('users'))

var USER_REFERENCE_DEFINITIONS = [
  { collection: 'projects', label: '项目', fields: [['manager', '='], ['members', '?='], ['created_by', '=']] },
  { collection: 'tasks', label: '任务', fields: [['assignees', '?='], ['created_by', '='], ['next_assignees', '?='], ['approved_by', '=']] },
  { collection: 'handoffs', label: '交接', fields: [['submitter', '='], ['reviewer', '='], ['proposed_assignees', '?=']] },
  { collection: 'audit_logs', label: '审计记录', fields: [['operator', '='], ['reviewed_by', '=']] },
  { collection: 'comments', label: '评论与提及', fields: [['author', '='], ['mentions', '?=']] },
  { collection: 'notifications', label: '通知', fields: [['user', '=']] },
  { collection: 'progress_logs', label: '进度记录', fields: [['user', '='], ['next_assignees', '?=']] },
  { collection: 'flower_logs', label: '协作记录', fields: [['user', '=']] },
  { collection: 'ai_summaries', label: 'AI 摘要', fields: [['target_user', '=']] },
  { collection: 'app_settings', label: '系统设置记录', fields: [['updated_by', '=']] },
  { collection: 'service_accounts', label: 'Agent 服务账号', fields: [['owner', '=']] },
  { collection: 'attachments', label: '附件', fields: [['uploader', '=']] },
]

function getUserDeleteImpact(dao, userId) {
  const references = []
  USER_REFERENCE_DEFINITIONS.forEach((definition) => {
    let collection
    try { collection = dao.findCollectionByNameOrId(definition.collection) } catch (_) { return }
    const terms = definition.fields
      .filter((field) => {
        try { return !!collection.schema.getFieldByName(field[0]) } catch (_) { return false }
      })
      .map((field) => `${field[0]} ${field[1]} {:userId}`)
    if (terms.length > 0 && dao.findRecordsByFilter(definition.collection, terms.join(' || '), '', 1, 0, { userId: userId }).length > 0) {
      references.push({ collection: definition.collection, label: definition.label })
    }
  })
  return references
}

$app.store().set('__epmsUserGuard', { getUserDeleteImpact: getUserDeleteImpact })

// 有业务历史的人员只能停用，不能永久删除，避免责任人字段被置空。
onRecordBeforeDeleteRequest((e) => {
  const user = e.record
  if (!user) return
  const userId = user.id
  if (user.getBool('is_active')) throw new BadRequestError('永久删除前必须先停用账号')
  const runtime = $app.store().get('__epmsUserGuard')
  if (runtime.getUserDeleteImpact($app.dao(), userId).length > 0) throw new BadRequestError('该账号已有业务记录，只能停用或重新配置以保留历史责任人')
}, 'users')

routerAdd('POST', '/api/custom/admin/users/delete-impact', (c) => {
  const info = $apis.requestInfo(c)
  const actor = info.authRecord
  if (!actor || actor.collection().name !== 'users' || !actor.getBool('is_active') || actor.getBool('must_change_password') || actor.getString('role') !== 'admin') {
    return c.json(403, { error: { code: 'ADMIN_REQUIRED', message: '仅启用中的管理员可检查账号删除条件' } })
  }
  const data = info.data || {}
  const userId = typeof data.user_id === 'string' && /^[a-z0-9]{15}$/.test(data.user_id) ? data.user_id : ''
  if (!userId) return c.json(400, { error: { code: 'INVALID_USER', message: '用户 ID 无效' } })
  let user
  try {
    user = $app.dao().findRecordById('users', userId)
  } catch (_) {
    return c.json(404, { error: { code: 'USER_NOT_FOUND', message: '账号不存在' } })
  }
  try {
    const references = $app.store().get('__epmsUserGuard').getUserDeleteImpact($app.dao(), userId)
    const reasons = []
    if (user.id === actor.id) reasons.push('当前登录账号')
    if (user.getBool('is_active')) reasons.push('账号仍在启用')
    if (references.length > 0) reasons.push('账号已有业务记录')
    return c.json(200, {
      user: { id: user.id, username: user.getString('username'), name: user.getString('name'), is_active: user.getBool('is_active') },
      can_delete: reasons.length === 0,
      reasons: reasons,
      references: references,
    })
  } catch (_) {
    return c.json(500, { error: { code: 'DELETE_IMPACT_FAILED', message: '无法检查账号删除条件' } })
  }
}, $apis.requireRecordAuth('users'))
