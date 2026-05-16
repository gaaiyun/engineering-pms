/// <reference path="../pb_data/types.d.ts" />
/**
 * PB Hook — handoffs.status 变更时联动 from_task.status
 *
 * 背景（Agent C 数据流审计 P0 hook 建议 #2 + Bug #1 + Bug A 配套兜底）：
 *
 * 前端 useApproveHandoff / useRejectHandoff 已经在 mutation 里同步 from_task
 * 状态（commit bf0dc0a + 29e1a93），但如果有人通过 PB Admin UI / 外部脚本 /
 * 直接 REST API 修改 handoffs.status，前端 mutation 不会执行，from_task 不联动。
 *
 * 本 hook 在 PB 数据库层提供兜底保证 I3 / I4 不变量：
 *   I3 — handoffs.status='approved' 必同步 from_task.status='completed'
 *   I4 — handoffs.status='rejected' 必回滚 from_task.status='in_progress'
 *
 * 触发时机：onRecordAfterUpdate('handoffs') — 任何方式更新 handoffs 都会触发。
 *
 * 注意：
 *   - 前端 mutation 已经更新过的，PB hook 会冗余更新一次（结果一致，无副作用）
 *   - PB hook 用 dao.saveRecord 而不是 dao.findRecordById + update，避免触发递归
 *   - 失败仅 log，不阻塞 handoff 状态更新本身
 */

onRecordAfterUpdateRequest((e) => {
  try {
    const handoff = e.record
    const status = handoff.getString('status')
    const fromTaskId = handoff.getString('from_task')

    if (!fromTaskId) {
      console.log('[handoffs hook] no from_task, skip')
      return
    }

    // 只在 status 变成 approved / rejected 时联动（pending / 其它状态不动）
    if (status !== 'approved' && status !== 'rejected') {
      return
    }

    const dao = $app.dao()
    let task
    try {
      task = dao.findRecordById('tasks', fromTaskId)
    } catch (err) {
      console.log('[handoffs hook] from_task not found:', fromTaskId, err)
      return
    }

    const currentTaskStatus = task.getString('status')

    if (status === 'approved') {
      // I3 — 批准 handoff 强制 from_task=completed
      if (currentTaskStatus !== 'completed') {
        task.set('status', 'completed')
        task.set('completed_at', new Date().toISOString())
        try {
          dao.saveRecord(task)
          console.log('[handoffs hook] approved → from_task', fromTaskId, 'set to completed')
        } catch (saveErr) {
          console.log('[handoffs hook] save task failed:', saveErr)
        }
      }
    } else if (status === 'rejected') {
      // I4 — 拒绝 handoff 回滚 from_task 到 in_progress
      if (currentTaskStatus === 'completed') {
        task.set('status', 'in_progress')
        task.set('completed_at', '')
        try {
          dao.saveRecord(task)
          console.log('[handoffs hook] rejected → from_task', fromTaskId, 'rolled back to in_progress')
        } catch (saveErr) {
          console.log('[handoffs hook] save task failed:', saveErr)
        }
      }
    }
  } catch (e) {
    console.log('[handoffs hook] outer error:', e)
  }
}, 'handoffs')
