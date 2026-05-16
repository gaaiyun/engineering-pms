import { useState } from 'react'
import { Dialog, Toast } from 'antd-mobile'
import { IoCloseOutline, IoCheckmarkCircleOutline, IoTrashOutline } from 'react-icons/io5'
import { useQueryClient } from '@tanstack/react-query'
import type { Task } from '../../lib/api'
import { useDeleteTask, notifyProjectMembers } from '../../lib/api'
import { queryKeys } from '../../lib/queryClient'
import { pb } from '../../lib/pocketbase'

interface TasksBulkBarProps {
  selectedTasks: Task[]
  onClear: () => void
}

export function TasksBulkBar({ selectedTasks, onClear }: TasksBulkBarProps) {
  const [running, setRunning] = useState(false)
  const deleteTask = useDeleteTask()
  const queryClient = useQueryClient()

  // 批量改状态走直接 PB 更新（绕过 useMarkTaskComplete 的 handoff workflow）
  // handoff 流程仍在单条详情页保留 — 批量场景下用户预期是"直接改状态"
  async function batchMarkComplete() {
    const pending = selectedTasks.filter((t) => t.status !== 'completed')
    if (pending.length === 0) {
      Toast.show({ content: '所选任务都已完成' })
      return
    }
    const confirmed = await Dialog.confirm({
      content: `批量标记 ${pending.length} 个任务为已完成？将跳过 handoff 流程。`,
      confirmText: '确认',
      cancelText: '取消',
    })
    if (!confirmed) return
    setRunning(true)
    let success = 0
    let failed = 0
    const operatorId = pb.authStore.model?.id || ''
    const operatorName = pb.authStore.model?.name || pb.authStore.model?.username || '某用户'
    const completedAt = new Date().toISOString()
    // 用 Map 聚合每个项目下成功完成的任务，用于后面的项目级通知
    const succeededByProject = new Map<string, Task[]>()
    for (const t of pending) {
      try {
        await pb.collection('tasks').update(t.id, {
          status: 'completed',
          completed_at: completedAt,
        })
        // 写 audit_log（E2E 测试发现 PR 4 原版漏了这一步）
        await pb.collection('audit_logs').create({
          project: t.project,
          task: t.id,
          action_type: 'bulk_mark_complete',
          operator: operatorId,
          after_data: { status: 'completed', completed_at: completedAt },
        }).catch(() => {
          // 审计写失败不阻塞主流程
        })
        if (t.project) {
          const list = succeededByProject.get(t.project) || []
          list.push(t)
          succeededByProject.set(t.project, list)
        }
        success += 1
      } catch {
        failed += 1
      }
    }

    // ⚠️ Bug fix #2（Agent B HIGH-2 + 同 PR 4 与 Bug B 配套）：
    // 单条 useMarkTaskComplete 会通知项目成员，批量场景下静默 →
    // 团队成员看不到协作反馈。聚合通知（每项目一条，避免刷屏）。
    for (const [projectId, tasks] of succeededByProject.entries()) {
      const count = tasks.length
      notifyProjectMembers(
        projectId,
        '任务批量完成',
        `${operatorName} 批量完成了 ${count} 个任务`,
        'task_update',
        operatorId,
      ).catch((err) => console.warn('bulk complete notify failed', err))
    }

    // ⚠️ Bug fix #2 cache：原版只 invalidate tasks/myTasks，漏掉 projects、
    // projectTasks（项目详情）、notifications → 项目卡片进度条 / 看板不刷新
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks })
    queryClient.invalidateQueries({ queryKey: queryKeys.myTasks(operatorId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.projects })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
    queryClient.invalidateQueries({ queryKey: ['audit_logs'] })
    for (const projectId of succeededByProject.keys()) {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) })
    }

    setRunning(false)
    Toast.show({
      icon: failed === 0 ? 'success' : 'fail',
      content: `完成 ${success} 个${failed > 0 ? `，失败 ${failed} 个` : ''}`,
    })
    onClear()
  }

  async function batchDelete() {
    const confirmed = await Dialog.confirm({
      content: `确认删除选中的 ${selectedTasks.length} 个任务吗？此操作不可撤销。`,
      confirmText: '删除',
      cancelText: '取消',
    })
    if (!confirmed) return
    setRunning(true)
    let success = 0
    let failed = 0
    for (const t of selectedTasks) {
      try {
        await deleteTask.mutateAsync(t.id)
        success += 1
      } catch {
        failed += 1
      }
    }
    setRunning(false)
    Toast.show({
      icon: failed === 0 ? 'success' : 'fail',
      content: `删除 ${success} 个${failed > 0 ? `，失败 ${failed} 个` : ''}`,
    })
    onClear()
  }

  return (
    <div
      role="toolbar"
      aria-label="批量操作"
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#0f172a',
        color: '#fff',
        borderRadius: 12,
        padding: '12px 16px',
        boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        zIndex: 100,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600 }}>
        已选 <span style={{ color: '#818cf8' }}>{selectedTasks.length}</span> 项
      </span>

      <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)' }} />

      <button
        type="button"
        onClick={batchMarkComplete}
        disabled={running}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#fff',
          cursor: running ? 'not-allowed' : 'pointer',
          padding: '6px 10px',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 14,
          opacity: running ? 0.5 : 1,
        }}
      >
        <IoCheckmarkCircleOutline size={18} />
        标记完成
      </button>

      <button
        type="button"
        onClick={batchDelete}
        disabled={running}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#fca5a5',
          cursor: running ? 'not-allowed' : 'pointer',
          padding: '6px 10px',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 14,
          opacity: running ? 0.5 : 1,
        }}
      >
        <IoTrashOutline size={18} />
        删除
      </button>

      <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)' }} />

      <button
        type="button"
        onClick={onClear}
        aria-label="清空选择"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#94a3b8',
          cursor: 'pointer',
          padding: 4,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <IoCloseOutline size={20} />
      </button>
    </div>
  )
}
