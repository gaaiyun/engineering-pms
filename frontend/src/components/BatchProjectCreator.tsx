/**
 * 批量项目创建器 - 创建项目 + 批量添加任务
 * 三列式：任务名 | 执行人 | 截止时间
 */
import { useState, useMemo } from 'react'
import { Button, Input, Toast, Popup, SearchBar, TextArea } from 'antd-mobile'
import { IoAddCircleOutline, IoTrashOutline, IoCheckmarkCircle, IoPersonOutline } from 'react-icons/io5'
import { useCreateProject, useUsers, useBatchSaveTasks, type BatchTaskItem } from '../lib/api'
import { pb } from '../lib/pocketbase'

interface Props {
  visible: boolean
  onClose: () => void
  onSuccess?: () => void
}

interface TaskRow {
  key: string
  stage_name: string
  assignees: string[]
  deadline: string
}

export default function BatchProjectCreator({ visible, onClose, onSuccess }: Props) {
  const createProject = useCreateProject()
  const batchSaveTasks = useBatchSaveTasks()
  const { data: allUsers = [] } = useUsers()

  // 项目基本信息
  const [projectName, setProjectName] = useState('')
  const [projectDesc, setProjectDesc] = useState('')
  const [projectDeadline, setProjectDeadline] = useState('')
  const [projectMembers, setProjectMembers] = useState<string[]>([])
  const [showMemberPicker, setShowMemberPicker] = useState(false)
  const [memberSearchText, setMemberSearchText] = useState('')

  // 任务列表
  const [taskRows, setTaskRows] = useState<TaskRow[]>([
    { key: 'task-0', stage_name: '', assignees: [], deadline: '' }
  ])
  const [pickerRow, setPickerRow] = useState<number | null>(null)
  const [taskSearchText, setTaskSearchText] = useState('')

  // 可选成员（搜索过滤）
  const availableMembers = useMemo(() => {
    if (!memberSearchText) return allUsers
    return allUsers.filter(u =>
      (u.name || u.username).toLowerCase().includes(memberSearchText.toLowerCase()) ||
      (u.department || '').toLowerCase().includes(memberSearchText.toLowerCase())
    )
  }, [allUsers, memberSearchText])

  // 任务执行人选择（从项目成员中选）
  const availableTaskUsers = useMemo(() => {
    const list = projectMembers.length > 0
      ? allUsers.filter(u => projectMembers.includes(u.id))
      : allUsers
    if (!taskSearchText) return list
    return list.filter(u =>
      (u.name || u.username).toLowerCase().includes(taskSearchText.toLowerCase())
    )
  }, [allUsers, projectMembers, taskSearchText])

  const getUserName = (id: string) => {
    const u = allUsers.find(u => u.id === id)
    return u ? (u.name || u.username) : id.slice(0, 6)
  }

  // 任务操作
  const addTaskRow = () => {
    setTaskRows(prev => [...prev, { key: `task-${Date.now()}`, stage_name: '', assignees: [], deadline: '' }])
  }

  const removeTaskRow = (index: number) => {
    if (taskRows.length <= 1) return
    setTaskRows(prev => prev.filter((_, i) => i !== index))
  }

  const updateTaskRow = (index: number, field: keyof TaskRow, value: any) => {
    setTaskRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }

  // 保存项目和任务
  const handleSave = async () => {
    if (!projectName.trim()) {
      Toast.show({ icon: 'fail', content: '请填写项目名称' })
      return
    }

    const validTasks = taskRows.filter(r => r.stage_name.trim())

    try {
      // 1. 创建项目
      const project = await createProject.mutateAsync({
        name: projectName,
        description: projectDesc,
        deadline: projectDeadline,
        manager: pb.authStore.model?.id || '',
        members: projectMembers.length > 0 ? projectMembers : [pb.authStore.model?.id || '']
      })

      // 2. 批量创建任务（如果有）
      if (validTasks.length > 0) {
        const tasks: BatchTaskItem[] = validTasks.map(r => ({
          stage_name: r.stage_name,
          assignees: r.assignees.length > 0 ? r.assignees : [pb.authStore.model?.id].filter(Boolean) as string[],
          deadline: r.deadline,
        }))
        await batchSaveTasks.mutateAsync({ projectId: project.id, tasks })
      }

      Toast.show({ icon: 'success', content: `项目创建成功${validTasks.length > 0 ? `，已添加 ${validTasks.length} 个任务` : ''}` })
      
      // 重置表单
      setProjectName('')
      setProjectDesc('')
      setProjectDeadline('')
      setProjectMembers([])
      setTaskRows([{ key: 'task-0', stage_name: '', assignees: [], deadline: '' }])
      
      onSuccess?.()
      onClose()
    } catch (e: any) {
      Toast.show({ icon: 'fail', content: '创建失败: ' + (e.message || '未知错误') })
    }
  }

  return (
    <Popup visible={visible} onMaskClick={onClose} position="bottom"
      bodyStyle={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '92vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>创建项目</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>填写项目信息并批量添加任务</div>
        </div>
        <Button size="small" onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8 }}>关闭</Button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        
        {/* 项目基本信息 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 12 }}>项目信息</div>
          
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>项目名称 *</div>
            <Input value={projectName} onChange={setProjectName} placeholder="请输入项目名称"
              style={{ '--font-size': '14px', padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>项目描述</div>
            <TextArea value={projectDesc} onChange={setProjectDesc} placeholder="请输入项目描述"
              rows={2} style={{ '--font-size': '13px', padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>截止日期</div>
            <input type="date" value={projectDeadline} onChange={e => setProjectDeadline(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, color: '#334155' }} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>项目成员</div>
            <div onClick={() => { setShowMemberPicker(true); setMemberSearchText('') }} style={{
              padding: '10px 12px', background: projectMembers.length > 0 ? '#eff6ff' : '#f8fafc',
              borderRadius: 8, border: `1px solid ${projectMembers.length > 0 ? '#93c5fd' : '#e2e8f0'}`,
              fontSize: 13, color: projectMembers.length > 0 ? '#1e40af' : '#94a3b8', cursor: 'pointer',
              minHeight: 42, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4
            }}>
              {projectMembers.length > 0
                ? projectMembers.map(id => getUserName(id)).join(', ')
                : <><IoPersonOutline size={16} /> 选择项目成员</>}
            </div>
          </div>
        </div>

        {/* 任务批量编辑 */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 12 }}>批量添加任务（可选）</div>
          
          {/* Table Header */}
          <div style={{ display: 'flex', padding: '8px 0', fontSize: 11, fontWeight: 700, color: '#64748b', gap: 8 }}>
            <div style={{ flex: 3 }}>任务名称</div>
            <div style={{ flex: 2 }}>执行人员</div>
            <div style={{ flex: 2 }}>截止时间</div>
            <div style={{ width: 28 }}></div>
          </div>

          {/* Task Rows */}
          {taskRows.map((row, idx) => (
            <div key={row.key} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <div style={{ flex: 3 }}>
                <Input value={row.stage_name} onChange={v => updateTaskRow(idx, 'stage_name', v)}
                  placeholder="任务名称" style={{ '--font-size': '12px', padding: '7px 8px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }} />
              </div>
              <div style={{ flex: 2 }} onClick={() => { setPickerRow(idx); setTaskSearchText('') }}>
                <div style={{
                  padding: '7px 8px', background: row.assignees.length > 0 ? '#eff6ff' : '#f8fafc',
                  borderRadius: 6, border: `1px solid ${row.assignees.length > 0 ? '#93c5fd' : '#e2e8f0'}`,
                  fontSize: 11, color: row.assignees.length > 0 ? '#1e40af' : '#94a3b8', cursor: 'pointer',
                  minHeight: 32, display: 'flex', alignItems: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {row.assignees.length > 0
                    ? row.assignees.map(id => getUserName(id)).join(', ')
                    : <><IoPersonOutline size={12} /> 选择</>}
                </div>
              </div>
              <div style={{ flex: 2 }}>
                <input type="date" value={row.deadline} onChange={e => updateTaskRow(idx, 'deadline', e.target.value)}
                  style={{ width: '100%', padding: '6px 4px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11, color: '#334155' }} />
              </div>
              <div style={{ width: 28 }}>
                {taskRows.length > 1 && (
                  <IoTrashOutline size={16} color="#ef4444" style={{ cursor: 'pointer' }} onClick={() => removeTaskRow(idx)} />
                )}
              </div>
            </div>
          ))}

          <Button onClick={addTaskRow} style={{ width: '100%', background: '#f0fdf4', border: '2px dashed #86efac', borderRadius: 8, color: '#16a34a', fontWeight: 600, height: 38, marginTop: 8, fontSize: 12 }}>
            <IoAddCircleOutline size={16} style={{ marginRight: 4 }} /> 添加任务
          </Button>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 12 }}>
        <Button onClick={onClose} style={{ flex: 1, background: '#f1f5f9', border: 'none', borderRadius: 12, height: 48, fontWeight: 600, color: '#64748b' }}>取消</Button>
        <Button loading={createProject.isPending || batchSaveTasks.isPending} onClick={handleSave}
          style={{ flex: 2, background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', border: 'none', borderRadius: 12, height: 48, fontWeight: 700, color: 'white', boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }}>
          <IoCheckmarkCircle size={18} style={{ marginRight: 6 }} /> 创建项目
        </Button>
      </div>

      {/* 项目成员选择弹窗 */}
      <Popup visible={showMemberPicker} onMaskClick={() => setShowMemberPicker(false)}
        bodyStyle={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '65vh' }}>
        <div style={{ padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>选择项目成员</div>
          <SearchBar placeholder="搜索" value={memberSearchText} onChange={setMemberSearchText} style={{ marginBottom: 12 }} />
          <div style={{ maxHeight: '40vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {availableMembers.map(u => {
              const isSelected = projectMembers.includes(u.id)
              return (
                <div key={u.id} onClick={() => {
                  setProjectMembers(prev => isSelected ? prev.filter(i => i !== u.id) : [...prev, u.id])
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
          <Button block onClick={() => setShowMemberPicker(false)} style={{ marginTop: 12, background: '#3b82f6', border: 'none', color: 'white', borderRadius: 10, height: 44, fontWeight: 600 }}>
            确定
          </Button>
        </div>
      </Popup>

      {/* 任务执行人选择弹窗 */}
      <Popup visible={pickerRow !== null} onMaskClick={() => setPickerRow(null)}
        bodyStyle={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60dvh' }}>
        <div style={{ padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>选择执行人员</div>
          <SearchBar placeholder="搜索" value={taskSearchText} onChange={setTaskSearchText} style={{ marginBottom: 12 }} />
          <div style={{ maxHeight: '35vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {availableTaskUsers.map(u => {
              const isSelected = pickerRow !== null && taskRows[pickerRow]?.assignees.includes(u.id)
              return (
                <div key={u.id} onClick={() => {
                  if (pickerRow === null) return
                  updateTaskRow(pickerRow, 'assignees',
                    isSelected ? taskRows[pickerRow].assignees.filter(i => i !== u.id) : [...taskRows[pickerRow].assignees, u.id])
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
