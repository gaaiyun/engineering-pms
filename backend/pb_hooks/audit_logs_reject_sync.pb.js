/// <reference path="../pb_data/types.d.ts" />
/**
 * PB Hook — audit_logs.review_status='rejected' 时联动业务回滚
 *
 * 背景：前端 useUpdateAuditLogStatus（commit 4ceb918 + 6b64b77）已为
 * mark_complete / mark_blocked / update_task 三种 action_type 实现拒绝
 * 时的业务回滚 + 关联清理。但如果有人通过 PB Admin UI / 外部脚本 / 直接
 * REST API PATCH audit_logs.review_status='rejected'，前端 mutation
 * 不会执行 → 业务回滚漏。
 *
 * 本 hook 在 DB 层兜底（同 handoffs_status_sync.pb.js 思路）：
 *   - 拒绝 mark_complete  → task.status 回滚到 in_progress 或 overdue
 *   - 拒绝 mark_blocked   → task.status 回滚到 in_progress + blocker=null
 *   - 拒绝 update_task    → 按 before_data 部分字段回滚
 *
 * 注意：
 *   - 前端 mutation 已经做过的，此 hook 是冗余执行（幂等无副作用）
 *   - 失败仅 log，不阻塞 audit_log 本身的更新
 *   - 仅在 review_status 变成 'rejected' 时触发（pending/approved/read 不动）
 */
/**
 * Bug fix H-1（Agent H 通知 E2E + Agent C P1-1）：
 * useUnblockTask 解除卡点时联动把 blocker.rollback_to 任务 X 设回 completed，
 * 但操作者（卡点解除人）通常不在 X.assignees 中 → PB tasks.updateRule
 * 拒绝（403），前端 .catch 静默吞掉 → X 永远停在 in_progress，X assignees
 * 也收不到"上游卡点已解除"通知。
 *
 * 修复：监听 audit_logs.create 当 action_type='unblock_task' 时，读
 * before_data.rollback_to，用 PB hook 的系统权限（绕过 rule）把 X 设回
 * completed + 给 X.assignees 创建通知。
 */
onRecordAfterCreateRequest((e) => {
  try {
    const audit = e.record
    const actionType = audit.getString('action_type')
    if (actionType !== 'unblock_task') return

    let beforeData
    try {
      const raw = audit.get('before_data')
      beforeData = typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch {
      return
    }
    const rollbackTaskId = beforeData && beforeData.rollback_to
    if (!rollbackTaskId) return

    const dao = $app.dao()
    let rollbackTask
    try {
      rollbackTask = dao.findRecordById('tasks', rollbackTaskId)
    } catch (err) {
      console.log('[audit_logs hook] rollback_to task not found:', rollbackTaskId)
      return
    }

    // 仅当 X 当前是 in_progress 时设回 completed
    if (rollbackTask.getString('status') === 'in_progress') {
      rollbackTask.set('status', 'completed')
      rollbackTask.set('completed_at', new Date().toISOString())
      try {
        dao.saveRecord(rollbackTask)
        console.log('[audit_logs hook] unblock_task rollback_to', rollbackTaskId, 'set to completed')
      } catch (saveErr) {
        console.log('[audit_logs hook] save rollback task failed:', saveErr)
        return
      }

      // 给 X.assignees 创建通知（同样用 PB hook 系统权限绕 notifications createRule）
      const assignees = rollbackTask.get('assignees') || []
      const operatorId = audit.getString('operator')
      for (const uid of assignees) {
        if (!uid || uid === operatorId) continue
        try {
          const notif = new Record(dao.findCollectionByNameOrId('notifications'), {
            user: uid,
            type: 'task_update',
            title: '上游卡点已解除',
            content: `任务「${rollbackTask.getString('stage_name')}」恢复完成状态`,
            link_type: 'task',
            link_id: rollbackTaskId,
            is_read: false,
          })
          dao.saveRecord(notif)
        } catch (notifErr) {
          console.log('[audit_logs hook] create rollback notification failed:', notifErr)
        }
      }
    }
  } catch (e) {
    console.log('[audit_logs hook unblock_rollback] outer error:', e)
  }
}, 'audit_logs')

onRecordAfterUpdateRequest((e) => {
  try {
    const audit = e.record
    const status = audit.getString('review_status')
    if (status !== 'rejected') return

    const actionType = audit.getString('action_type')
    const taskId = audit.getString('task')
    if (!taskId) {
      console.log('[audit_logs hook] no task field, skip:', actionType)
      return
    }

    const dao = $app.dao()
    let task
    try {
      task = dao.findRecordById('tasks', taskId)
    } catch (err) {
      console.log('[audit_logs hook] task not found:', taskId, err)
      return
    }

    if (actionType === 'mark_complete') {
      // 回滚 completed → in_progress（或 overdue 若已过期）
      const currentStatus = task.getString('status')
      if (currentStatus !== 'completed') return  // 已被前端 mutation 处理过

      const deadline = task.getString('deadline')
      const isOverdue = deadline && new Date(deadline) < new Date()
      task.set('status', isOverdue ? 'overdue' : 'in_progress')
      task.set('completed_at', '')
      try {
        dao.saveRecord(task)
        console.log('[audit_logs hook] rollback mark_complete: task', taskId, 'set to', task.getString('status'))
      } catch (saveErr) {
        console.log('[audit_logs hook] save task failed:', saveErr)
        return
      }

      // 取消 pending handoffs（避免另一管理员批准后冲突）
      try {
        const records = $app.dao().findRecordsByFilter(
          'handoffs',
          `from_task = "${taskId}" && status = "pending"`,
          '',
          100,
          0,
        )
        for (let i = 0; i < records.length; i++) {
          const h = records[i]
          h.set('status', 'rejected')
          h.set('review_note', '任务完成被审计拒绝自动撤销')
          try { dao.saveRecord(h) } catch (e) { console.log('cancel handoff failed:', e) }
        }
      } catch (e) {
        console.log('[audit_logs hook] cleanup pending handoffs failed:', e)
      }
    } else if (actionType === 'mark_blocked') {
      // 回滚 blocked → in_progress + 清 blocker
      const currentStatus = task.getString('status')
      if (currentStatus === 'blocked') {
        task.set('status', 'in_progress')
      }
      task.set('blocker', null)
      try {
        dao.saveRecord(task)
        console.log('[audit_logs hook] rollback mark_blocked: task', taskId)
      } catch (saveErr) {
        console.log('[audit_logs hook] save task failed:', saveErr)
      }
    } else if (actionType === 'update_task') {
      // 按 before_data 部分字段回滚
      let beforeData
      try {
        const beforeStr = audit.get('before_data')
        beforeData = typeof beforeStr === 'string' ? JSON.parse(beforeStr) : beforeStr
      } catch (e) {
        console.log('[audit_logs hook] parse before_data failed:', e)
        return
      }
      if (!beforeData || typeof beforeData !== 'object') return

      const afterRaw = audit.get('after_data')
      let afterData
      try {
        afterData = typeof afterRaw === 'string' ? JSON.parse(afterRaw) : afterRaw
      } catch {
        afterData = {}
      }

      let dirty = false
      for (const key of Object.keys(afterData || {})) {
        if (key in beforeData) {
          task.set(key, beforeData[key])
          dirty = true
        }
      }
      if (dirty) {
        try {
          dao.saveRecord(task)
          console.log('[audit_logs hook] rollback update_task: task', taskId)
        } catch (saveErr) {
          console.log('[audit_logs hook] save task failed:', saveErr)
        }
      }
    }
  } catch (e) {
    console.log('[audit_logs hook] outer error:', e)
  }
}, 'audit_logs')
