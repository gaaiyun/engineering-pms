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

// 有业务历史的人员只能停用，不能永久删除，避免责任人字段被置空。
onRecordBeforeDeleteRequest((e) => {
  const user = e.record
  if (!user) return
  const userId = user.id
  if (user.getString('role') === 'admin' && user.getBool('is_active')) {
    const otherAdmins = $app.dao().findRecordsByFilter(
      'users',
      `id != "${userId}" && role = "admin" && is_active = true`,
      '',
      1,
      0,
    )
    if (otherAdmins.length === 0) throw new BadRequestError('系统必须保留至少一个启用中的管理员')
  }
  const references = [
    ['projects', `manager = "${userId}" || members ?= "${userId}"`],
    ['tasks', `assignees ?= "${userId}" || created_by = "${userId}"`],
    ['handoffs', `submitter = "${userId}" || reviewer = "${userId}" || proposed_assignees ?= "${userId}"`],
    ['audit_logs', `operator = "${userId}"`],
    ['comments', `author = "${userId}"`],
    ['notifications', `user = "${userId}"`],
    ['progress_logs', `user = "${userId}" || next_assignees ?= "${userId}"`],
    ['flower_logs', `user = "${userId}"`],
    ['ai_summaries', `target_user = "${userId}"`],
    ['app_settings', `updated_by = "${userId}"`],
    ['service_accounts', `owner = "${userId}"`],
  ]

  for (let i = 0; i < references.length; i += 1) {
    try {
      const found = $app.dao().findRecordsByFilter(references[i][0], references[i][1], '', 1, 0)
      if (found.length > 0) throw new BadRequestError('该账号已有业务记录，请停用账号以保留历史责任人')
    } catch (error) {
      if (error && error.message && error.message.indexOf('该账号已有业务记录') === 0) throw error
      // 可选集合不存在时继续检查其他引用。
    }
  }
}, 'users')
