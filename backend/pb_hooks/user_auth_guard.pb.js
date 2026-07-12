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
}, 'users')

// 有业务历史的人员只能停用，不能永久删除，避免责任人字段被置空。
onRecordBeforeDeleteRequest((e) => {
  const user = e.record
  if (!user) return
  const userId = user.id
  const references = [
    ['projects', `manager = "${userId}" || members ?= "${userId}"`],
    ['tasks', `assignees ?= "${userId}" || created_by = "${userId}"`],
    ['handoffs', `submitter = "${userId}" || reviewer = "${userId}" || proposed_assignees ?= "${userId}"`],
    ['audit_logs', `operator = "${userId}"`],
    ['comments', `author = "${userId}"`],
    ['notifications', `user = "${userId}"`],
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
