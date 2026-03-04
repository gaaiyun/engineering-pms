/**
 * 批量任务编辑器 - 三列表格：任务名 | 执行人 | 截止时间
 * 支持动态增删行，一键保存
 */
import React, { useState, useMemo, useEffect } from 'react'
import { Button, Input, Toast, Popup, SearchBar } from 'antd-mobile'
import { IoAddCircleOutline, IoTrashOutline, IoCheckmarkCircle, IoPersonOutline } from 'react-icons/io5'
import { useBatchSaveTasks, type BatchTaskItem } from '../lib/api'
import { pb } from '../lib/pocketbase'
import dayjs from 'dayjs'

interface Props {
  visible: boolean
  onClose: () => void
  projectId: string
  projectMembers: string[] // 项目成员 ID 列表
  allUsers: Array<{ id: string; name?: string; username: string; department?: string }>
  existingTasks?: Array<{ id: string; stage_name: string; assignees: string[]; deadline: string }>
}

interface RowData {
  key: string
  id?: string
  stage_name: string
  assignees: string[]
  deadline: string
}

export default function BatchTaskEditor({ visible, onClose, projectId, projectMembers, allUsers, existingTasks = [] }: Props) {
  const batchSave = useBatchSaveTasks()

  const [rows, setRows] = useState<RowData[]>(() => {
    if (existingTasks.length > 0) {
      return existingTasks.map((t, i) => ({
        key: `existing-${i}`,
        id: t.id,
        stage_name: t.stage_name,
        assignees: t.assignees || [],
        deadline: t.deadline ? dayjs(t.deadline).format('YYYY-MM-DD') : '',
      }))
    }
    return [{ key: 'new-0', stage_name: '', assignees: [], deadline: '' }]
  })

  const prevVisibleRef = React.useRef(visible)
  useEffect(() => {
    const wasHidden = !prevVisibleRef.current
    prevVisibleRef.current = visible
    if (!visible || !wasHidden) return
    if (existingTasks.length > 0) {
      setRows(existingTasks.map((t, i) => ({
        key: `existing-${i}`,
        id: t.id,
        stage_name: t.stage_name,
        assignees: t.assignees || [],
        deadline: t.deadline ? dayjs(t.deadline).format('YYYY-MM-DD') : '',
      })))
    } else {
      setRows([{ key: 'new-0', stage_name: '', assignees: [], deadline: '' }])
    }
  }, [visible, existingTasks])

  const [pickerRow, setPickerRow] = useState<number | null>(null)
  const [searchText, setSearchText] = useState('')

  // 只显示项目成员（如果有），否则显示全部
  const availableUsers = useMemo(() => {
    const list = projectMembers.length > 0
      ? allUsers.filter(u => projectMembers.includes(u.id))
      : allUsers
    if (!searchText) return list
    return list.filter(u =>
      (u.name || u.username).toLowerCase().includes(searchText.toLowerCase()) ||
      (u.department || '').toLowerCase().includes(searchText.toLowerCase())
    )
  }, [allUsers, projectMembers, searchText])

  const addRow = () => {
    setRows(prev => [...prev, { key: `new-${Date.now()}`, stage_name: '', assignees: [], deadline: '' }])
  }

  const removeRow = (index: number) => {
    if (rows.length <= 1) return
    setRows(prev => prev.filter((_, i) => i !== index))
  }

  const updateRow = (index: number, field: keyof RowData, value: string | string[]) => {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }

  const getUserName = (id: string) => {
    const u = allUsers.find(u => u.id === id)
    return u ? (u.name || u.username) : id.slice(0, 6)
  }

  const handleSave = async () => {
    const validRows = rows.filter(r => r.stage_name.trim())
    if (validRows.length === 0) {
      Toast.show({ icon: 'fail', content: '请至少填写一个任务' })
      return
    }
    try {
      const tasks: BatchTaskItem[] = validRows.map(r => ({
        id: r.id,
        stage_name: r.stage_name,
        assignees: r.assignees.length > 0 ? r.assignees : [pb.authStore.model?.id].filter(Boolean) as string[],
        deadline: r.deadline,
      }))
      await batchSave.mutateAsync({ projectId, tasks })
      Toast.show({ icon: 'success', content: `已保存 ${tasks.length} 个任务` })
      onClose()
    } catch (e: any) {
      Toast.show({ icon: 'fail', content: '保存失败: ' + (e.message || '未知错误') })
    }
  }

  return (
    <Popup visible={visible} onMaskClick={onClose} position="bottom"
      bodyStyle={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, height: 'min(90vh, 90dvh)', maxHeight: '90dvh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>批量编辑任务</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>填写任务名、负责人和截止时间</div>
        </div>
        <Button size="small" onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8 }}>关闭</Button>
      </div>

      {/* Table Header */}
      <div style={{ display: 'flex', padding: '10px 20px', background: '#f8fafc', fontSize: 12, fontWeight: 700, color: '#64748b', gap: 8 }}>
        <div style={{ flex: 3 }}>任务名称</div>
        <div style={{ flex: 2 }}>执行人员</div>
        <div style={{ flex: 2 }}>截止时间</div>
        <div style={{ width: 32 }}></div>
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px' }}>
        {rows.map((row, idx) => (
          <div key={row.key} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <div style={{ flex: 3 }}>
              <Input value={row.stage_name} onChange={v => updateRow(idx, 'stage_name', v)}
                placeholder="任务名称" style={{ '--font-size': '13px', padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }} />
            </div>
            <div style={{ flex: 2 }} onClick={() => { setPickerRow(idx); setSearchText('') }}>
              <div style={{
                padding: '8px 10px', background: row.assignees.length > 0 ? '#eff6ff' : '#f8fafc',
                borderRadius: 8, border: `1px solid ${row.assignees.length > 0 ? '#93c5fd' : '#e2e8f0'}`,
                fontSize: 12, color: row.assignees.length > 0 ? '#1e40af' : '#94a3b8', cursor: 'pointer',
                minHeight: 36, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2
              }}>
                {row.assignees.length > 0
                  ? row.assignees.map(id => getUserName(id)).join(', ')
                  : <><IoPersonOutline size={14} /> 选择</>}
              </div>
            </div>
            <div style={{ flex: 2 }}>
              <input type="date" value={row.deadline} onChange={e => updateRow(idx, 'deadline', e.target.value)}
                style={{ width: '100%', padding: '8px 6px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, color: '#334155' }} />
            </div>
            <div style={{ width: 32 }}>
              {rows.length > 1 && (
                <IoTrashOutline size={18} color="#ef4444" style={{ cursor: 'pointer' }} onClick={() => removeRow(idx)} />
              )}
            </div>
          </div>
        ))}

        <Button onClick={addRow} style={{ width: '100%', background: '#f0fdf4', border: '2px dashed #86efac', borderRadius: 10, color: '#16a34a', fontWeight: 600, height: 44, marginTop: 8 }}>
          <IoAddCircleOutline size={18} style={{ marginRight: 6 }} /> 添加一行
        </Button>
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 12 }}>
        <Button onClick={onClose} style={{ flex: 1, background: '#f1f5f9', border: 'none', borderRadius: 12, height: 48, fontWeight: 600, color: '#64748b' }}>取消</Button>
        <Button loading={batchSave.isPending} onClick={handleSave}
          style={{ flex: 2, background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', border: 'none', borderRadius: 12, height: 48, fontWeight: 700, color: 'white', boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }}>
          <IoCheckmarkCircle size={18} style={{ marginRight: 6 }} /> 保存全部 ({rows.filter(r => r.stage_name.trim()).length} 个任务)
        </Button>
      </div>

      {/* 人员选择弹窗 */}
      <Popup visible={pickerRow !== null} onMaskClick={() => setPickerRow(null)}
        bodyStyle={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60dvh' }}>
        <div style={{ padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>选择执行人员</div>
          <SearchBar placeholder="搜索" value={searchText} onChange={setSearchText} style={{ marginBottom: 12 }} />
          <div style={{ maxHeight: '35vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {availableUsers.map(u => {
              const isSelected = pickerRow !== null && rows[pickerRow]?.assignees.includes(u.id)
              return (
                <div key={u.id} onClick={() => {
                  if (pickerRow === null) return
                  updateRow(pickerRow, 'assignees',
                    isSelected ? rows[pickerRow].assignees.filter(i => i !== u.id) : [...rows[pickerRow].assignees, u.id])
                }} style={{
                  padding: '10px 14px', background: isSelected ? '#eff6ff' : '#f8fafc', borderRadius: 10,
                  border: `1.5px solid ${isSelected ? '#3b82f6' : 'transparent'}`, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: isSelected ? '#3b82f6' : '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 13 }}>
                    {(u.name || u.username).charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{u.name || u.username}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{u.department || ''}</div>
                  </div>
                  {isSelected && <IoCheckmarkCircle size={20} color="#3b82f6" />}
                </div>
              )
            })}
          </div>
          <Button block onClick={() => setPickerRow(null)} style={{ marginTop: 12, background: '#3b82f6', border: 'none', color: 'white', borderRadius: 10, height: 44, fontWeight: 600 }}>
            确定
          </Button>
        </div>
      </Popup>
    </Popup>
  )
}
