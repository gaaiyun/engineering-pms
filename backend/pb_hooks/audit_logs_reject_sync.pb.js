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
