import { useState } from 'react'
import { Dialog, Toast } from 'antd-mobile'
import { IoCloseOutline, IoCheckmarkCircleOutline, IoTrashOutline } from 'react-icons/io5'
import { useQueryClient } from '@tanstack/react-query'
import type { Task } from '../../lib/api'
import { useDeleteTask } from '../../lib/api'
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
    const completedAt = new Date().toISOString()
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
        success += 1
      } catch {
        failed += 1
      }
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks })
    queryClient.invalidateQueries({ queryKey: queryKeys.myTasks(operatorId) })
    queryClient.invalidateQueries({ queryKey: ['audit_logs'] })
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
