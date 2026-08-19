import { useMemo, useState } from 'react'
import { Avatar, Button, Input, Popup, Selector, SpinLoading, TextArea, Toast } from 'antd-mobile'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  IoAddOutline,
  IoAlertCircleOutline,
  IoArrowBackOutline,
  IoCalendarOutline,
  IoCheckmarkCircleOutline,
  IoChevronForward,
  IoCreateOutline,
  IoGridOutline,
  IoPeopleOutline,
  IoTimeOutline,
} from 'react-icons/io5'
import {
  isManager,
  useAuditLogs,
  useProject,
  useTasks,
  useUpdateProject,
  useUsers,
  type Project,
  type Task,
} from '../lib/api'
import { getUserAvatarUrl } from '../lib/avatar'
import { getPocketBaseErrorMessage } from '../lib/pocketbase'
import './ProjectDetail.css'

const STATUS_LABELS: Record<Task['status'], string> = {
  pending: '待开始',
  in_progress: '进行中',
  blocked: '卡点',
  completed: '已完成',
  overdue: '已逾期',
}

const PROJECT_STATUS = {
  active: '进行中',
  completed: '已完成',
  archived: '已归档',
} as const

function formatActivity(action: string) {
  const labels: Record<string, string> = {
    create_project: '创建了项目',
    update_project: '更新了项目信息',
    create_task: '新增了任务',
    update_task: '更新了任务',
    complete_task: '完成了任务',
    delete_task: '删除了任务',
    approve_handoff: '批准了任务交接',
    reject_handoff: '退回了任务交接',
  }
  return labels[action] || '更新了项目数据'
}

function getEffectiveTaskStatus(task: Task): Task['status'] {
  if (task.status === 'completed' || task.status === 'blocked') return task.status
  if (task.deadline && dayjs(task.deadline).endOf('day').isBefore(dayjs())) return 'overdue'
  return task.status
}

export default function ProjectDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const managerUser = isManager()
  const projectQuery = useProject(id)
  const tasksQuery = useTasks(id)
  const { data: project, isLoading: projectLoading } = projectQuery
  const { data: tasks = [], isLoading: tasksLoading } = tasksQuery
  const { data: users = [] } = useUsers()
  const { data: activities = [] } = useAuditLogs({ project: id })
  const updateProject = useUpdateProject()
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', description: '', start_date: '', deadline: '', status: 'active' as Project['status'] })

  const openEditor = () => {
    if (!project) return
    setEditForm({
      name: project.name || '',
      description: project.description || '',
      start_date: project.start_date ? dayjs(project.start_date).format('YYYY-MM-DD') : '',
      deadline: project.deadline ? dayjs(project.deadline).format('YYYY-MM-DD') : '',
      status: project.status || 'active',
    })
    setEditing(true)
  }

  const summary = useMemo(() => {
    const completed = tasks.filter(task => getEffectiveTaskStatus(task) === 'completed').length
    const blocked = tasks.filter(task => ['blocked', 'overdue'].includes(getEffectiveTaskStatus(task))).length
    const inProgress = tasks.filter(task => getEffectiveTaskStatus(task) === 'in_progress').length
    const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0
    return { completed, blocked, inProgress, progress }
  }, [tasks])

  const memberUsers = useMemo(() => {
    if (!project) return []
    const ids = new Set([...(project.members || []), ...(project.manager ? [project.manager] : [])])
    return users.filter(user => ids.has(user.id))
  }, [project, users])

  const priorityTasks = useMemo(() => [...tasks]
    .filter(task => task.status !== 'completed')
    .sort((a, b) => {
      const aRank = ['blocked', 'overdue'].includes(getEffectiveTaskStatus(a)) ? 0 : 1
      const bRank = ['blocked', 'overdue'].includes(getEffectiveTaskStatus(b)) ? 0 : 1
      return aRank - bRank || (a.deadline || '9999').localeCompare(b.deadline || '9999')
    })
    .slice(0, 6), [tasks])

  const saveProject = async () => {
    if (!project || !editForm.name.trim()) {
      Toast.show({ icon: 'fail', content: '项目名称不能为空' })
      return
    }
    try {
      await updateProject.mutateAsync({
        id: project.id,
        data: {
          name: editForm.name.trim(),
          description: editForm.description.trim(),
          start_date: editForm.start_date || '',
          deadline: editForm.deadline || '',
          status: editForm.status,
        },
      })
      Toast.show({ icon: 'success', content: '项目资料已更新' })
      setEditing(false)
    } catch (error: unknown) {
      Toast.show({ icon: 'fail', content: getPocketBaseErrorMessage(error, '项目更新失败') })
    }
  }

  if (projectLoading || tasksLoading) {
    return <div className="project-detail-loading"><SpinLoading style={{ '--size': '36px' }} /><span>正在加载项目</span></div>
  }

  if (projectQuery.isError || tasksQuery.isError) {
    return <div className="project-detail-empty"><h2>项目数据加载失败</h2><p>请检查网络连接后重试，系统没有用空数据覆盖项目进度。</p><Button onClick={() => { projectQuery.refetch(); tasksQuery.refetch() }}>重新加载</Button></div>
  }

  if (!project) {
    return <div className="project-detail-empty"><h2>项目不存在或无权访问</h2><Button onClick={() => navigate('/my-projects')}>返回项目列表</Button></div>
  }

  return (
    <div className="page project-detail-page">
      <header className="project-detail-header">
        <button type="button" className="project-detail-back" onClick={() => navigate('/my-projects')} aria-label="返回项目列表"><IoArrowBackOutline /></button>
        <div className="project-detail-title">
          <div className="project-detail-eyebrow"><span className={`project-status project-status--${project.status}`}>{PROJECT_STATUS[project.status]}</span><span>项目总览</span></div>
          <h1>{project.name}</h1>
          <p>{project.description || '尚未填写项目说明，可在编辑项目中补充目标、范围与交付要求。'}</p>
        </div>
        {managerUser && <Button fill="outline" onClick={openEditor}><IoCreateOutline />编辑项目</Button>}
      </header>

      <nav className="project-detail-tabs" aria-label="项目功能">
        <button type="button" className="is-active"><IoGridOutline />概览</button>
        <button type="button" onClick={() => navigate(`/project/${id}/kanban`)}>任务看板</button>
        <button type="button" onClick={() => navigate(`/project/${id}/timeline`)}>时间轴</button>
        {managerUser && <button type="button" onClick={() => navigate(`/task/create?projectId=${id}`)}><IoAddOutline />新建任务</button>}
      </nav>

      <section className="project-overview-strip" aria-label="项目关键指标">
        <div className="project-progress-block">
          <div><span>整体进度</span><strong>{summary.progress}%</strong></div>
          <div className="project-progress-track"><i style={{ width: `${summary.progress}%` }} /></div>
        </div>
        <dl>
          <div><dt>任务总数</dt><dd>{tasks.length}</dd></div>
          <div><dt>进行中</dt><dd>{summary.inProgress}</dd></div>
          <div><dt>已完成</dt><dd>{summary.completed}</dd></div>
          <div className={summary.blocked ? 'is-warning' : ''}><dt>风险与卡点</dt><dd>{summary.blocked}</dd></div>
        </dl>
      </section>

      <div className="project-detail-grid">
        <main>
          <section className="project-panel">
            <header><div><h2>当前工作</h2><p>优先显示卡点、逾期和临近截止任务</p></div><button type="button" onClick={() => navigate(`/project/${id}/kanban`)}>查看全部<IoChevronForward /></button></header>
            <div className="project-task-list">
              {priorityTasks.map(task => {
                const effectiveStatus = getEffectiveTaskStatus(task)
                return (
                <button type="button" key={task.id} className="project-task-row" onClick={() => navigate(`/task/${task.id}`)}>
                  <span className={`project-task-state project-task-state--${effectiveStatus}`}><i />{STATUS_LABELS[effectiveStatus]}</span>
                  <span className="project-task-name">{task.stage_name}</span>
                  <span className="project-task-assignees">
                    {(task.assignees || []).slice(0, 3).map(userId => {
                      const user = users.find(item => item.id === userId)
                      return user ? <Avatar key={userId} src={getUserAvatarUrl(user)} /> : null
                    })}
                  </span>
                  <span className="project-task-date">{task.deadline ? dayjs(task.deadline).format('MM月DD日') : '未设截止'}</span>
                  <IoChevronForward />
                </button>
              )})}
              {priorityTasks.length === 0 && <div className="project-panel-empty"><IoCheckmarkCircleOutline />当前没有待处理任务</div>}
            </div>
          </section>

          <section className="project-panel project-milestones">
            <header><div><h2>里程碑</h2><p>用于把握关键交付节点</p></div><button type="button" onClick={() => navigate(`/project/${id}/timeline`)}>打开时间轴<IoChevronForward /></button></header>
            <div className="project-milestone-list">
              {tasks.filter(task => task.is_milestone).slice(0, 4).map(task => (
                <button type="button" key={task.id} onClick={() => navigate(`/task/${task.id}`)}>
                  <IoCheckmarkCircleOutline /><span><strong>{task.stage_name}</strong><small>{task.deadline ? dayjs(task.deadline).format('YYYY年MM月DD日') : '未设置日期'}</small></span><em>{STATUS_LABELS[getEffectiveTaskStatus(task)]}</em>
                </button>
              ))}
              {!tasks.some(task => task.is_milestone) && <div className="project-panel-empty">暂未设置里程碑，可在新建任务时标记关键节点</div>}
            </div>
          </section>
        </main>

        <aside>
          <section className="project-side-panel">
            <h2>项目资料</h2>
            <dl className="project-facts">
              <div><dt><IoCalendarOutline />开始日期</dt><dd>{project.start_date ? dayjs(project.start_date).format('YYYY年MM月DD日') : '未设置'}</dd></div>
              <div><dt><IoTimeOutline />计划截止</dt><dd>{project.deadline ? dayjs(project.deadline).format('YYYY年MM月DD日') : '未设置'}</dd></div>
              <div><dt><IoPeopleOutline />项目成员</dt><dd>{memberUsers.length} 人</dd></div>
              <div><dt><IoAlertCircleOutline />风险任务</dt><dd>{summary.blocked} 项</dd></div>
            </dl>
            <div className="project-member-stack">
              {memberUsers.slice(0, 8).map(user => <Avatar key={user.id} src={getUserAvatarUrl(user)} />)}
              {memberUsers.length > 8 && <span>+{memberUsers.length - 8}</span>}
              {!memberUsers.length && <small>尚未添加项目成员</small>}
            </div>
          </section>

          <section className="project-side-panel">
            <h2>最近动态</h2>
            <div className="project-activity-list">
              {activities.slice(0, 6).map(activity => (
                <div key={activity.id}><i /><span><strong>{activity.expand?.operator?.name || activity.expand?.operator?.username || '项目成员'}</strong>{formatActivity(activity.action_type)}<small>{dayjs(activity.created).format('MM月DD日 HH:mm')}</small></span></div>
              ))}
              {!activities.length && <div className="project-panel-empty">暂无项目动态</div>}
            </div>
          </section>
        </aside>
      </div>

      <Popup visible={editing} onMaskClick={() => setEditing(false)} bodyClassName="project-edit-popup">
        <div className="project-edit-form">
          <header><div><h2>编辑项目资料</h2><p>保持名称、周期和当前状态准确</p></div><button type="button" onClick={() => setEditing(false)}>关闭</button></header>
          <label><span>项目名称</span><Input value={editForm.name} onChange={name => setEditForm(current => ({ ...current, name }))} maxLength={80} /></label>
          <label><span>项目说明</span><TextArea value={editForm.description} onChange={description => setEditForm(current => ({ ...current, description }))} rows={4} maxLength={500} showCount /></label>
          <div className="project-edit-dates">
            <label><span>开始日期</span><input type="date" value={editForm.start_date} onChange={event => setEditForm(current => ({ ...current, start_date: event.target.value }))} /></label>
            <label><span>计划截止</span><input type="date" value={editForm.deadline} onChange={event => setEditForm(current => ({ ...current, deadline: event.target.value }))} /></label>
          </div>
          <label><span>项目状态</span><Selector value={[editForm.status]} onChange={value => setEditForm(current => ({ ...current, status: value[0] as Project['status'] }))} options={[{ label: '进行中', value: 'active' }, { label: '已完成', value: 'completed' }, { label: '已归档', value: 'archived' }]} /></label>
          <Button block color="primary" loading={updateProject.isPending} onClick={saveProject}>保存项目资料</Button>
        </div>
      </Popup>
    </div>
  )
}
