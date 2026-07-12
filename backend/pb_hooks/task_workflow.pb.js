/// <reference path="../pb_data/types.d.ts" />

// 解除卡点必须由服务端完成：员工通常无权修改 rollback_to 指向的其他负责人任务。
routerAdd('POST', '/api/custom/tasks/unblock', (c) => {
  const info = $apis.requestInfo(c)
  const actor = info.authRecord
  if (!actor) return c.json(401, { error: 'unauthorized' })
  if (!actor.getBool('is_active')) return c.json(401, { error: 'account disabled' })

  const data = info.data || {}
  const taskId = typeof data.task_id === 'string' ? data.task_id : ''
  const newStatus = data.status === 'completed' ? 'completed' : data.status === 'in_progress' ? 'in_progress' : ''
  if (!taskId || !newStatus) return c.json(400, { error: 'invalid unblock request' })

  const dao = $app.dao()
  let task
  try {
    task = dao.findRecordById('tasks', taskId)
  } catch (_) {
    return c.json(404, { error: 'task not found' })
  }

  const actorId = actor.id
  const role = actor.getString('role')
  const assignees = task.getStringSlice('assignees') || []
  if (role !== 'admin' && role !== 'manager' && assignees.indexOf(actorId) === -1) {
    return c.json(403, { error: 'forbidden' })
  }
  if (task.getString('status') !== 'blocked') {
    return c.json(409, { error: 'task is not blocked' })
  }

  let blocker = {}
  try {
    const blockerText = task.getString('blocker')
    if (blockerText) blocker = JSON.parse(blockerText)
    else {
      const rawBlocker = task.get('blocker')
      blocker = typeof rawBlocker === 'string' ? JSON.parse(rawBlocker) : JSON.parse(JSON.stringify(rawBlocker || {}))
    }
  } catch (_) {
    try { blocker = JSON.parse(task.getString('blocker') || '{}') } catch (_) { blocker = {} }
  }
  const rollbackId = blocker && typeof blocker.rollback_to === 'string' ? blocker.rollback_to : ''
  if (rollbackId) {
    try {
      const rollbackTask = dao.findRecordById('tasks', rollbackId)
      if (rollbackTask.getString('project') !== task.getString('project')) {
        return c.json(400, { error: 'rollback task belongs to another project' })
      }
    } catch (_) {
      return c.json(400, { error: 'rollback task not found' })
    }
  }

  try {
    let restoredTaskId = ''
    dao.runInTransaction((txDao) => {
      const currentTask = txDao.findRecordById('tasks', taskId)
      currentTask.set('status', newStatus)
      currentTask.set('blocker', null)
      if (newStatus === 'completed') currentTask.set('completed_at', new Date().toISOString())
      else currentTask.set('completed_at', '')
      txDao.saveRecord(currentTask)

      let restoredTask = null
      if (rollbackId) {
        const rollbackTask = txDao.findRecordById('tasks', rollbackId)
        if (rollbackTask.getString('status') === 'in_progress') {
          rollbackTask.set('status', 'completed')
          rollbackTask.set('completed_at', new Date().toISOString())
          txDao.saveRecord(rollbackTask)
          restoredTask = rollbackTask
          restoredTaskId = rollbackTask.id
        }
      }

      const auditCollection = txDao.findCollectionByNameOrId('audit_logs')
      const audit = new Record(auditCollection)
      audit.set('project', currentTask.getString('project'))
      audit.set('task', taskId)
      audit.set('action_type', 'unblock_task')
      audit.set('operator', actorId)
      audit.set('before_data', { status: 'blocked', rollback_to: rollbackId || null })
      audit.set('after_data', { status: newStatus })
      txDao.saveRecord(audit)

      if (restoredTask) {
        const notificationCollection = txDao.findCollectionByNameOrId('notifications')
        const restoredAssignees = restoredTask.getStringSlice('assignees') || []
        for (let i = 0; i < restoredAssignees.length; i++) {
          const uid = restoredAssignees[i]
          if (!uid || uid === actorId) continue
          const notification = new Record(notificationCollection)
          notification.set('user', uid)
          notification.set('type', 'task_update')
          notification.set('title', '上游卡点已解除')
          notification.set('content', `任务「${restoredTask.getString('stage_name')}」恢复完成状态`)
          notification.set('link_type', 'task')
          notification.set('link_id', rollbackId)
          notification.set('is_read', false)
          txDao.saveRecord(notification)
        }
      }
    })

    return c.json(200, {
      task_id: taskId,
      status: newStatus,
      restored_task_id: restoredTaskId || null,
    })
  } catch (error) {
    console.log('[task workflow] unblock failed', error)
    return c.json(500, { error: 'unblock failed' })
  }
}, $apis.requireRecordAuth())

// 完成任务与创建交接必须一次提交成功或全部回滚。
routerAdd('POST', '/api/custom/tasks/complete-with-handoff', (c) => {
  const info = $apis.requestInfo(c)
  const actor = info.authRecord
  if (!actor || !actor.getBool('is_active')) return c.json(401, { error: 'unauthorized' })
  const canManage = (task) => {
    const role = actor.getString('role')
    const assignees = task.getStringSlice('assignees') || []
    return role === 'admin' || role === 'manager' || assignees.indexOf(actor.id) !== -1
  }
  const createNotification = (dao, userId, type, title, content, linkType, linkId) => {
    if (!userId) return
    const notification = new Record(dao.findCollectionByNameOrId('notifications'))
    notification.set('user', userId); notification.set('type', type); notification.set('title', title)
    notification.set('content', content); notification.set('link_type', linkType); notification.set('link_id', linkId)
    notification.set('is_read', false); dao.saveRecord(notification)
  }
  const projectAudience = (dao, projectId) => {
    const project = dao.findRecordById('projects', projectId)
    const audience = (project.getStringSlice('members') || []).slice()
    const managerId = project.getString('manager')
    if (managerId && audience.indexOf(managerId) === -1) audience.push(managerId)
    return audience
  }
  const data = info.data || {}
  const taskId = typeof data.task_id === 'string' ? data.task_id : ''
  const handoff = data.handoff || {}
  const title = typeof handoff.proposed_title === 'string' ? handoff.proposed_title.trim() : ''
  const description = typeof handoff.proposed_description === 'string' ? handoff.proposed_description.trim() : ''
  const assignees = Array.isArray(handoff.proposed_assignees) ? handoff.proposed_assignees.filter(Boolean) : []
  const dueDate = typeof handoff.proposed_due_date === 'string' ? handoff.proposed_due_date : ''
  if (!taskId || !title || !dueDate || assignees.length === 0) return c.json(400, { error: 'invalid handoff' })

  let task
  try { task = $app.dao().findRecordById('tasks', taskId) } catch (_) { return c.json(404, { error: 'task not found' }) }
  if (!canManage(task)) return c.json(403, { error: 'forbidden' })
  if (task.getString('status') === 'completed') return c.json(409, { error: 'task already completed' })

  try {
    let createdHandoffId = ''
    $app.dao().runInTransaction((dao) => {
      const current = dao.findRecordById('tasks', taskId)
      const existing = dao.findRecordsByFilter('handoffs', `from_task = "${taskId}" && (status = "pending" || status = "approved")`, '', 1, 0)
      if (existing.length > 0 || current.getString('status') === 'completed') throw new Error('WORKFLOW_CONFLICT')

      current.set('status', 'completed')
      current.set('completed_at', new Date().toISOString())
      dao.saveRecord(current)

      const handoffRecord = new Record(dao.findCollectionByNameOrId('handoffs'))
      handoffRecord.set('project', current.getString('project'))
      handoffRecord.set('from_task', taskId)
      handoffRecord.set('proposed_title', title)
      handoffRecord.set('proposed_description', description)
      handoffRecord.set('proposed_assignees', assignees)
      handoffRecord.set('proposed_due_date', dueDate)
      handoffRecord.set('status', 'pending')
      handoffRecord.set('submitter', actor.id)
      dao.saveRecord(handoffRecord)
      createdHandoffId = handoffRecord.id

      const audit = new Record(dao.findCollectionByNameOrId('audit_logs'))
      audit.set('project', current.getString('project'))
      audit.set('task', taskId)
      audit.set('action_type', 'mark_complete')
      audit.set('operator', actor.id)
      audit.set('before_data', { status: task.getString('status') })
      audit.set('after_data', { status: 'completed', handoff_id: handoffRecord.id })
      dao.saveRecord(audit)

      const audience = projectAudience(dao, current.getString('project'))
      audience.forEach((userId) => {
        if (userId !== actor.id) createNotification(dao, userId, 'task_update', '任务完成待交接审核', `「${current.getString('stage_name')}」已完成并提交交接提案`, 'task', taskId)
      })
    })
    return c.json(200, { task_id: taskId, handoff_id: createdHandoffId, status: 'completed' })
  } catch (error) {
    if (String(error).indexOf('WORKFLOW_CONFLICT') !== -1) return c.json(409, { error: 'workflow conflict' })
    console.log('[task workflow] complete failed', error)
    return c.json(500, { error: 'complete failed' })
  }
}, $apis.requireRecordAuth())

// 上报卡点、回退前序任务、审计和通知使用同一事务。
routerAdd('POST', '/api/custom/tasks/block', (c) => {
  const info = $apis.requestInfo(c)
  const actor = info.authRecord
  if (!actor || !actor.getBool('is_active')) return c.json(401, { error: 'unauthorized' })
  const canManage = (task) => {
    const role = actor.getString('role')
    const assignees = task.getStringSlice('assignees') || []
    return role === 'admin' || role === 'manager' || assignees.indexOf(actor.id) !== -1
  }
  const createNotification = (dao, userId, type, title, content, linkType, linkId) => {
    if (!userId) return
    const notification = new Record(dao.findCollectionByNameOrId('notifications'))
    notification.set('user', userId); notification.set('type', type); notification.set('title', title)
    notification.set('content', content); notification.set('link_type', linkType); notification.set('link_id', linkId)
    notification.set('is_read', false); dao.saveRecord(notification)
  }
  const projectAudience = (dao, projectId) => {
    const project = dao.findRecordById('projects', projectId)
    const audience = (project.getStringSlice('members') || []).slice()
    const managerId = project.getString('manager')
    if (managerId && audience.indexOf(managerId) === -1) audience.push(managerId)
    return audience
  }
  const data = info.data || {}
  const taskId = typeof data.task_id === 'string' ? data.task_id : ''
  const blocker = data.blocker && typeof data.blocker === 'object' ? data.blocker : {}
  const detail = typeof blocker.reason_detail === 'string' ? blocker.reason_detail.trim() : ''
  const rollbackId = typeof data.rollback_to_task_id === 'string' ? data.rollback_to_task_id : ''
  if (!taskId || !detail) return c.json(400, { error: 'invalid blocker' })
  let task
  try { task = $app.dao().findRecordById('tasks', taskId) } catch (_) { return c.json(404, { error: 'task not found' }) }
  if (!canManage(task)) return c.json(403, { error: 'forbidden' })

  try {
    $app.dao().runInTransaction((dao) => {
      const current = dao.findRecordById('tasks', taskId)
      if (current.getString('status') === 'completed' || current.getString('status') === 'blocked') {
        throw new Error('WORKFLOW_CONFLICT')
      }
      const blockerData = Object.assign({}, blocker)
      if (rollbackId) {
        let rollback
        try {
          rollback = dao.findRecordById('tasks', rollbackId)
        } catch (_) {
          throw new Error('INVALID_ROLLBACK')
        }
        if (rollback.getString('project') !== current.getString('project')) throw new Error('INVALID_ROLLBACK')
        rollback.set('status', 'in_progress')
        rollback.set('completed_at', '')
        dao.saveRecord(rollback)
        blockerData.rollback_to = rollbackId
        const rollbackAssignees = rollback.getStringSlice('assignees') || []
        rollbackAssignees.forEach((userId) => {
          if (userId !== actor.id) createNotification(dao, userId, 'task_rollback', '任务被回退，需要重新处理', `「${current.getString('stage_name')}」遇到卡点：${detail}`, 'task', rollbackId)
        })
      }

      current.set('status', 'blocked')
      current.set('blocker', blockerData)
      current.set('completed_at', '')
      dao.saveRecord(current)

      const audit = new Record(dao.findCollectionByNameOrId('audit_logs'))
      audit.set('project', current.getString('project'))
      audit.set('task', taskId)
      audit.set('action_type', 'mark_blocked')
      audit.set('operator', actor.id)
      audit.set('before_data', { status: task.getString('status') })
      audit.set('after_data', blockerData)
      dao.saveRecord(audit)

      const audience = projectAudience(dao, current.getString('project'))
      const helpers = Array.isArray(blocker.need_help_from) ? blocker.need_help_from : []
      helpers.forEach((userId) => { if (audience.indexOf(userId) === -1) audience.push(userId) })
      audience.forEach((userId) => {
        if (userId !== actor.id) createNotification(dao, userId, 'blocker', '项目任务遇到卡点', `「${current.getString('stage_name')}」：${detail}`, 'task', taskId)
      })
    })
    return c.json(200, { task_id: taskId, status: 'blocked', rollback_to_task_id: rollbackId || null })
  } catch (error) {
    if (String(error).indexOf('WORKFLOW_CONFLICT') !== -1) return c.json(409, { error: 'workflow conflict' })
    if (String(error).indexOf('INVALID_ROLLBACK') !== -1) return c.json(400, { error: 'invalid rollback task' })
    console.log('[task workflow] block failed', error)
    return c.json(500, { error: 'block failed' })
  }
}, $apis.requireRecordAuth())

// 审批交接一次性完成：创建下游任务、状态变更、成员同步、审计和通知。
routerAdd('POST', '/api/custom/handoffs/decide', (c) => {
  const info = $apis.requestInfo(c)
  const actor = info.authRecord
  if (!actor || !actor.getBool('is_active')) return c.json(401, { error: 'unauthorized' })
  const createNotification = (dao, userId, type, title, content, linkType, linkId) => {
    if (!userId) return
    const notification = new Record(dao.findCollectionByNameOrId('notifications'))
    notification.set('user', userId); notification.set('type', type); notification.set('title', title)
    notification.set('content', content); notification.set('link_type', linkType); notification.set('link_id', linkId)
    notification.set('is_read', false); dao.saveRecord(notification)
  }
  const role = actor.getString('role')
  if (role !== 'admin' && role !== 'manager') return c.json(403, { error: 'forbidden' })
  const data = info.data || {}
  const handoffId = typeof data.handoff_id === 'string' ? data.handoff_id : ''
  const decision = data.decision === 'approved' ? 'approved' : data.decision === 'rejected' ? 'rejected' : ''
  const note = typeof data.review_note === 'string' ? data.review_note.trim() : ''
  if (!handoffId || !decision || (decision === 'rejected' && !note)) return c.json(400, { error: 'invalid decision' })

  try {
    let approvedTaskId = ''
    let sourceTaskId = ''
    $app.dao().runInTransaction((dao) => {
      const handoff = dao.findRecordById('handoffs', handoffId)
      if (handoff.getString('status') !== 'pending') throw new Error('WORKFLOW_CONFLICT')
      const source = dao.findRecordById('tasks', handoff.getString('from_task'))
      sourceTaskId = source.id
      handoff.set('status', decision)
      handoff.set('reviewer', actor.id)
      handoff.set('review_note', note)

      if (decision === 'approved') {
        const task = new Record(dao.findCollectionByNameOrId('tasks'))
        task.set('project', handoff.getString('project'))
        task.set('stage_name', handoff.getString('proposed_title'))
        task.set('next_steps', handoff.getString('proposed_description'))
        task.set('assignees', handoff.getStringSlice('proposed_assignees') || [])
        task.set('start_date', handoff.getString('proposed_start_date'))
        task.set('deadline', handoff.getString('proposed_due_date'))
        task.set('status', 'pending')
        task.set('sequence', Date.now())
        task.set('predecessor_tasks', [source.id])
        task.set('created_by', actor.id)
        dao.saveRecord(task)
        approvedTaskId = task.id
        handoff.set('approved_task', task.id)
        source.set('status', 'completed')
        source.set('completed_at', new Date().toISOString())
        dao.saveRecord(source)

        const project = dao.findRecordById('projects', handoff.getString('project'))
        const members = project.getStringSlice('members') || []
        const assignees = task.getStringSlice('assignees') || []
        assignees.forEach((userId) => { if (members.indexOf(userId) === -1) members.push(userId) })
        project.set('members', members)
        dao.saveRecord(project)
        assignees.forEach((userId) => createNotification(dao, userId, 'task_assigned', '您有新的项目任务', `「${task.getString('stage_name')}」已通过交接审核`, 'task', task.id))
      } else {
        source.set('status', 'in_progress')
        source.set('completed_at', '')
        dao.saveRecord(source)
        createNotification(dao, handoff.getString('submitter'), 'audit_rejected', '交接审核未通过', note, 'task', source.id)
      }
      dao.saveRecord(handoff)

      const audit = new Record(dao.findCollectionByNameOrId('audit_logs'))
      audit.set('project', handoff.getString('project'))
      audit.set('task', decision === 'approved' ? approvedTaskId : source.id)
      audit.set('action_type', decision === 'approved' ? 'approve_handoff' : 'reject_handoff')
      audit.set('operator', actor.id)
      audit.set('after_data', { handoff_id: handoffId, approved_task_id: approvedTaskId || null })
      audit.set('note', note)
      dao.saveRecord(audit)
    })
    return c.json(200, { handoff_id: handoffId, status: decision, approved_task_id: approvedTaskId || null, source_task_id: sourceTaskId })
  } catch (error) {
    if (String(error).indexOf('WORKFLOW_CONFLICT') !== -1) return c.json(409, { error: 'handoff already decided' })
    console.log('[task workflow] handoff decision failed', error)
    return c.json(500, { error: 'handoff decision failed' })
  }
}, $apis.requireRecordAuth())

// 永久删除任务由服务端串行清理依赖，避免前端多请求造成幽灵交接、失效通知和断裂前置关系。
routerAdd('POST', '/api/custom/tasks/delete', (c) => {
  const info = $apis.requestInfo(c)
  const actor = info.authRecord
  if (!actor || !actor.getBool('is_active')) return c.json(401, { error: 'unauthorized' })
  const role = actor.getString('role')
  if (role !== 'admin' && role !== 'manager') return c.json(403, { error: 'forbidden' })
  const data = info.data || {}
  const taskId = typeof data.task_id === 'string' ? data.task_id : ''
  if (!taskId) return c.json(400, { error: 'invalid task id' })

  let projectId = ''
  try {
    $app.dao().runInTransaction((dao) => {
      const task = dao.findRecordById('tasks', taskId)
      projectId = task.getString('project')
      const taskName = task.getString('stage_name')

      const deleteMatching = (collectionName, filter) => {
        try {
          const records = dao.findRecordsByFilter(collectionName, filter, '', 500, 0)
          records.forEach((record) => dao.deleteRecord(record))
        } catch (error) {
          console.log(`[task workflow] optional cleanup skipped: ${collectionName}`, error)
        }
      }

      deleteMatching('handoffs', `from_task = "${taskId}" || approved_task = "${taskId}"`)
      deleteMatching('comments', `task = "${taskId}"`)
      deleteMatching('attachments', `task = "${taskId}"`)
      deleteMatching('notifications', `link_type = "task" && link_id = "${taskId}"`)

      const downstream = dao.findRecordsByFilter('tasks', `predecessor_tasks ?= "${taskId}"`, '', 500, 0)
      downstream.forEach((record) => {
        const predecessors = (record.getStringSlice('predecessor_tasks') || []).filter((id) => id !== taskId)
        record.set('predecessor_tasks', predecessors)
        dao.saveRecord(record)
      })

      const auditRecords = dao.findRecordsByFilter('audit_logs', `task = "${taskId}"`, '', 500, 0)
      auditRecords.forEach((record) => {
        record.set('task', '')
        dao.saveRecord(record)
      })

      const project = dao.findRecordById('projects', projectId)
      const audience = project.getStringSlice('members') || []
      const managerId = project.getString('manager')
      if (managerId && audience.indexOf(managerId) === -1) audience.push(managerId)
      const notificationCollection = dao.findCollectionByNameOrId('notifications')
      audience.forEach((userId) => {
        if (!userId || userId === actor.id) return
        const notification = new Record(notificationCollection)
        notification.set('user', userId)
        notification.set('type', 'task_update')
        notification.set('title', '任务已删除')
        notification.set('content', `任务「${taskName}」已由项目管理员删除`)
        notification.set('link_type', 'project')
        notification.set('link_id', projectId)
        notification.set('is_read', false)
        dao.saveRecord(notification)
      })

      dao.deleteRecord(task)

      const remaining = dao.findRecordsByFilter('tasks', `project = "${projectId}"`, '', 500, 0)
      const completed = remaining.filter((record) => record.getString('status') === 'completed').length
      project.set('total_tasks', remaining.length)
      project.set('completed_tasks', completed)
      project.set('progress', remaining.length > 0 ? Math.round(completed / remaining.length * 100) : 0)
      dao.saveRecord(project)

      const audit = new Record(dao.findCollectionByNameOrId('audit_logs'))
      audit.set('project', projectId)
      audit.set('action_type', 'delete_task')
      audit.set('operator', actor.id)
      audit.set('before_data', { id: taskId, stage_name: taskName, status: task.getString('status') })
      dao.saveRecord(audit)
    })
    return c.json(200, { task_id: taskId, project_id: projectId, deleted: true })
  } catch (error) {
    if (String(error).indexOf('Failed to find record') !== -1) return c.json(404, { error: 'task not found' })
    console.log('[task workflow] delete failed', error)
    return c.json(500, { error: 'task delete failed' })
  }
}, $apis.requireRecordAuth())

// 已批准的交接代表下游任务已经生成，前序任务不能再被竞态改回卡点或进行中。
onRecordBeforeUpdateRequest((e) => {
  try {
    const task = e.record
    const nextStatus = task.getString('status')
    if (nextStatus === 'completed') return

    const approved = $app.dao().findRecordsByFilter(
      'handoffs',
      `from_task = "${task.id}" && status = "approved"`,
      '',
      1,
      0,
    )
    if (approved.length > 0) {
      throw new BadRequestError('该任务已有已批准交接，不能回退状态')
    }
  } catch (error) {
    if (error && error.message && error.message.indexOf('该任务已有已批准交接') === 0) throw error
    console.log('[task workflow] approved handoff guard failed open', error)
  }
}, 'tasks')

// 交接审核是一次性状态机：只允许 pending -> approved/rejected，阻止并发二次决策。
onRecordBeforeUpdateRequest((e) => {
  try {
    const nextStatus = e.record.getString('status')
    if (nextStatus !== 'approved' && nextStatus !== 'rejected') return
    const persisted = $app.dao().findRecordById('handoffs', e.record.id)
    const currentStatus = persisted.getString('status')
    if (currentStatus !== 'pending') {
      throw new BadRequestError('该交接已审核，不能重复变更结果')
    }
  } catch (error) {
    if (error && error.message && error.message.indexOf('该交接已审核') === 0) throw error
    console.log('[task workflow] handoff transition guard failed open', error)
  }
}, 'handoffs')
