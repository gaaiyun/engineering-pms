import { useState } from 'react'
import { Dialog, Toast } from 'antd-mobile'
import { IoCloseOutline, IoTrashOutline } from 'react-icons/io5'
import type { Task } from '../../lib/api'
import { useDeleteTask } from '../../lib/api'

interface TasksBulkBarProps {
  selectedTasks: Task[]
  onClear: () => void
}

export function TasksBulkBar({ selectedTasks, onClear }: TasksBulkBarProps) {
  const [running, setRunning] = useState(false)
  const deleteTask = useDeleteTask()

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
