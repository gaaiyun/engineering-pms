/// <reference path="../pb_data/types.d.ts" />
/**
 * Trusted notification command.
 *
 * Clients may request a notification only when both the actor and recipient
 * belong to the project referenced by link_id (directly or through a task).
 * The server derives the audience and creates the record with DAO privileges,
 * allowing the notifications collection createRule to remain closed.
 */
routerAdd('POST', '/api/custom/notifications/send', (c) => {
  const info = $apis.requestInfo(c)
  const actor = info.authRecord
  if (!actor) return c.json(401, { error: 'unauthorized' })
  if (!actor.getBool('is_active')) return c.json(401, { error: 'account disabled' })
  if (actor.getBool('must_change_password')) return c.json(403, { error: 'password change required' })

  const data = info.data || {}
  const input = data.notification
  if (!input || typeof input !== 'object') {
    return c.json(400, { error: 'notification required' })
  }

  const userId = typeof input.user === 'string' ? input.user : ''
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  const content = typeof input.content === 'string' ? input.content.trim() : ''
  const type = typeof input.type === 'string' ? input.type : 'system'
  const linkType = input.link_type === 'task' ? 'task' : input.link_type === 'project' ? 'project' : ''
  const linkId = typeof input.link_id === 'string' ? input.link_id : ''

  if (!userId || !title || title.length > 160 || content.length > 4000 || !linkType || !linkId) {
    return c.json(400, { error: 'invalid notification' })
  }
  if (!/^[a-z0-9_]{1,60}$/.test(type)) {
    return c.json(400, { error: 'invalid notification type' })
  }

  const dao = $app.dao()
  let project
  let task = null
  try {
    if (linkType === 'task') {
      task = dao.findRecordById('tasks', linkId)
      project = dao.findRecordById('projects', task.getString('project'))
    } else {
      project = dao.findRecordById('projects', linkId)
    }
  } catch (_) {
    return c.json(404, { error: 'linked record not found' })
  }

  const actorId = actor.id
  const actorRole = actor.getString('role')
  const projectManager = project.getString('manager')
  const projectMembers = project.getStringSlice('members') || []
  const actorInProject = actorRole === 'admin' || actorRole === 'manager' || projectManager === actorId || projectMembers.indexOf(actorId) !== -1
  if (!actorInProject) return c.json(403, { error: 'forbidden' })

  const allowedRecipients = projectMembers.slice()
  if (projectManager) allowedRecipients.push(projectManager)
  if (task) {
    const assignees = task.getStringSlice('assignees') || []
    for (let i = 0; i < assignees.length; i++) allowedRecipients.push(assignees[i])
  }
  if (allowedRecipients.indexOf(userId) === -1 && userId !== actorId) {
    return c.json(403, { error: 'recipient outside project' })
  }

  try {
    const collection = dao.findCollectionByNameOrId('notifications')
    const record = new Record(collection)
    record.set('user', userId)
    record.set('title', title)
    record.set('content', content)
    record.set('type', type)
    record.set('is_read', false)
    record.set('link_type', linkType)
    record.set('link_id', linkId)
    dao.saveRecord(record)
    return c.json(201, { id: record.id })
  } catch (_) {
    return c.json(500, { error: 'notification create failed' })
  }
}, $apis.requireRecordAuth('users'))
