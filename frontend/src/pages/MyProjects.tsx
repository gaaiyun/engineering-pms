import { useMemo, useState } from 'react'
import { IoArrowBackOutline, IoFolderOpenOutline, IoArchiveOutline, IoTimeOutline, IoWarningOutline, IoTrashOutline, IoPeopleOutline, IoReturnUpBackOutline } from 'react-icons/io5'
import { useNavigate } from 'react-router-dom'
import { useProjects, useTasks, useUsers, useArchiveProject, useDeleteProject, useUpdateProjectMembers, isManager } from '../lib/api'
import { Dialog, Toast, Popup, SearchBar } from 'antd-mobile'
import dayjs from 'dayjs'

type FilterTab = 'all' | 'active' | 'blocked' | 'archived'

export default function MyProjects() {
  const navigate = useNavigate()
  const { data: projects = [] } = useProjects()
  const { data: allTasks = [] } = useTasks()
  const { data: allUsers = [] } = useUsers()
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [sortBy, setSortBy] = useState<'newest' | 'deadline'>('newest')
  const archiveProject = useArchiveProject()
  const deleteProject = useDeleteProject()
  const updateMembers = useUpdateProjectMembers()
  const managerUser = isManager()

  // 成员管理弹窗
  const [memberPopup, setMemberPopup] = useState<{ visible: boolean; projectId: string; members: string[] }>({ visible: false, projectId: '', members: [] })
  const [memberSearch, setMemberSearch] = useState('')

  // 计算每个项目是否有长期卡点（blocked 超过 7 天）
  const blockedProjectIds = useMemo(() => {
    const ids = new Set<string>()
    allTasks.forEach(t => {
      if (t.status === 'blocked' && t.updated) {
        const days = dayjs().diff(dayjs(t.updated), 'day')
        if (days >= 7) ids.add(t.project)
      }
    })
    return ids
  }, [allTasks])

  const filtered = useMemo(() => {
    let list = [...projects]
    if (activeTab === 'active') list = list.filter(p => p.status === 'active' && !blockedProjectIds.has(p.id))
    else if (activeTab === 'archived') list = list.filter(p => p.status === 'archived')
    else if (activeTab === 'blocked') list = list.filter(p => p.status === 'active' && blockedProjectIds.has(p.id))

    list.sort((a, b) => {
      if (sortBy === 'deadline') return (a.deadline || '').localeCompare(b.deadline || '')
      return (b.created || '').localeCompare(a.created || '')
    })
    return list
  }, [projects, activeTab, sortBy, blockedProjectIds])

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: projects.length },
    { key: 'active', label: '进行中', count: projects.filter(p => p.status === 'active' && !blockedProjectIds.has(p.id)).length },
    { key: 'blocked', label: '卡顿', count: projects.filter(p => p.status === 'active' && blockedProjectIds.has(p.id)).length },
    { key: 'archived', label: '已归档', count: projects.filter(p => p.status === 'archived').length },
  ]

  const statusBadge = (p: typeof projects[0]) => {
    if (p.status === 'archived') return { label: '已归档', bg: '#f1f5f9', color: '#94a3b8', icon: <IoArchiveOutline size={12} /> }
    if (blockedProjectIds.has(p.id)) return { label: '卡顿', bg: '#fef3c7', color: '#d97706', icon: <IoWarningOutline size={12} /> }
    if (p.status === 'completed') return { label: '已完成', bg: '#dcfce7', color: '#16a34a', icon: null }
    return { label: '进行中', bg: '#dbeafe', color: '#2563eb', icon: null }
  }

  return (
    <div className="page">
      <div className="page-header" style={{ borderBottom: 'none', marginBottom: 16 }}>
        <button onClick={() => navigate(-1)} style={{
          background: 'none', border: '1px solid var(--border-color)', color: '#64748B',
          borderRadius: '4px', width: '36px', height: '36px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <IoArrowBackOutline size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <div className="page-subtitle">PROJECTS</div>
          <h2 className="page-title">项目列表</h2>
        </div>
        {/* 排序切换 */}
        <button onClick={() => setSortBy(s => s === 'newest' ? 'deadline' : 'newest')} style={{
          background: 'var(--neutral-100)', border: 'none', borderRadius: 8, padding: '6px 10px',
          fontSize: 11, color: 'var(--neutral-600)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
        }}>
          <IoTimeOutline size={14} />
          {sortBy === 'newest' ? '最新创建' : '截止日期'}
        </button>
      </div>

      {/* 筛选 Tabs */}
      <div style={{ display: 'flex', gap: 8, padding: '0 16px', marginBottom: 20, overflowX: 'auto' }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            background: activeTab === tab.key ? 'var(--primary-color)' : 'var(--neutral-100)',
            color: activeTab === tab.key ? 'white' : 'var(--neutral-600)',
            transition: 'all 0.2s'
          }}>
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* 项目列表 */}
      <div style={{ padding: '0 16px' }}>
        {filtered.map(p => {
          const badge = statusBadge(p)
          return (
            <div key={p.id} className="project-card" style={{
              display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12,
              opacity: p.status === 'archived' ? 0.7 : 1
            }}>
              <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}
                onClick={() => navigate(`/project/${p.id}/timeline`)}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: p.status === 'archived' ? '#f1f5f9' : 'var(--neutral-100)',
                  color: p.status === 'archived' ? '#94a3b8' : 'var(--primary-color)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {p.status === 'archived' ? <IoArchiveOutline size={24} /> : <IoFolderOpenOutline size={24} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--neutral-900)', marginBottom: 4 }}>{p.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--neutral-500)' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 4,
                      background: badge.bg, color: badge.color, fontWeight: 600
                    }}>
                      {badge.icon} {badge.label}
                    </span>
                    <span>进度 {p.progress || 0}%</span>
                    {p.deadline && <span>截止 {dayjs(p.deadline).format('MM/DD')}</span>}
                  </div>
                </div>
              </div>
              {/* 经理操作按钮 */}
              {managerUser && (
                <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                  <button title="成员管理" onClick={() => setMemberPopup({ visible: true, projectId: p.id, members: p.members || [] })} style={{
                    background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', padding: 6
                  }}><IoPeopleOutline size={18} /></button>
                  {p.status === 'archived' ? (
                    <button title="取消归档" onClick={() => archiveProject.mutate({ projectId: p.id, archived: false })} style={{
                      background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', padding: 6
                    }}><IoReturnUpBackOutline size={18} /></button>
                  ) : (
                    <button title="归档" onClick={() => Dialog.confirm({
                      title: '归档项目', content: `确认归档「${p.name}」？归档后不计入概况统计。`,
                      onConfirm: () => archiveProject.mutate({ projectId: p.id, archived: true })
                    })} style={{
                      background: 'none', border: 'none', cursor: 'pointer', color: '#d97706', padding: 6
                    }}><IoArchiveOutline size={18} /></button>
                  )}
                  <button title="删除" onClick={() => Dialog.confirm({
                    title: '删除项目', content: `确认删除「${p.name}」？此操作不可恢复！`,
                    onConfirm: () => deleteProject.mutate(p.id)
                  })} style={{
                    background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 6
                  }}><IoTrashOutline size={18} /></button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ marginTop: 40, textAlign: 'center', color: 'var(--neutral-color)', fontSize: 13 }}>
          {activeTab === 'all' ? '暂无项目' : `暂无${tabs.find(t => t.key === activeTab)?.label}项目`}
        </div>
      )}

      {/* 成员管理弹窗 */}
      <Popup visible={memberPopup.visible} onMaskClick={() => setMemberPopup(p => ({ ...p, visible: false }))}
        bodyStyle={{ height: '60vh', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>项目成员管理</h3>
        <SearchBar placeholder="搜索用户" value={memberSearch} onChange={setMemberSearch} style={{ marginBottom: 12 }} />
        <div style={{ overflowY: 'auto', maxHeight: 'calc(60vh - 120px)' }}>
          {allUsers.filter(u => !memberSearch || u.name?.includes(memberSearch) || u.username?.includes(memberSearch)).map(u => {
            const checked = memberPopup.members.includes(u.id)
            return (
              <div key={u.id} onClick={() => {
                const newMembers = checked ? memberPopup.members.filter(id => id !== u.id) : [...memberPopup.members, u.id]
                setMemberPopup(p => ({ ...p, members: newMembers }))
                updateMembers.mutate({ projectId: memberPopup.projectId, members: checked ? memberPopup.members.filter(id => id !== u.id) : [...memberPopup.members, u.id] })
              }} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px',
                borderBottom: '1px solid #f1f5f9', cursor: 'pointer'
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 4, border: '2px solid',
                  borderColor: checked ? '#2563eb' : '#d1d5db',
                  background: checked ? '#2563eb' : 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: 12
                }}>{checked ? '✓' : ''}</div>
                <span style={{ fontSize: 14 }}>{u.name || u.username}</span>
                {u.department && <span style={{ fontSize: 11, color: '#94a3b8' }}>{u.department}</span>}
              </div>
            )
          })}
        </div>
      </Popup>
    </div>
  )
}














