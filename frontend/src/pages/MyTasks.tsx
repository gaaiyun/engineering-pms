import { useEffect } from 'react'
import { Toast, Tabs, Button, Tag } from 'antd-mobile'
import { IoTimeOutline } from 'react-icons/io5'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { pb } from '../lib/pocketbase'
import dayjs from 'dayjs'
import { SkeletonList } from '../components/Skeleton'
import { useMyTasks, useProjects } from '../lib/api'
import type { Task } from '../lib/api'
import { useBreakpoint } from '../lib/useBreakpoint'
import { TasksTableView } from '../components/tasks/TasksTableView'

export default function MyTasks() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const bp = useBreakpoint()
  const isDesktop = bp !== 'mobile'
  const userId = pb.authStore.model?.id ?? ''
  const { data: tasks = [], isLoading: tasksLoading, error: tasksError } = useMyTasks(userId)
  const { isLoading: projectsLoading, error: projectsError } = useProjects()

  const loading = tasksLoading || projectsLoading
  const error = tasksError || projectsError

  useEffect(() => {
    if (error) {
      Toast.show({ icon: 'fail', content: '加载任务失败' })
    }
  }, [error])

  // Group Tasks
  const todoTasks = tasks.filter(t => t.status === 'pending')
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress' || (t.status as string) === 'processing' || t.status === 'blocked')
  const isEffectivelyOverdue = (task: Task) => task.status !== 'completed' && !!task.deadline && dayjs(task.deadline).endOf('day').isBefore(dayjs())
  const overdueTasks = tasks.filter(isEffectivelyOverdue)
  const doneTasks = tasks.filter(t => t.status === 'completed')
  const requestedTab = searchParams.get('tab')
  const activeTab = requestedTab === 'pending' || requestedTab === 'overdue' || requestedTab === 'completed'
    ? requestedTab
    : 'in_progress'

  const TaskCard = ({ task }: { task: Task }) => {
    const isOverdue = isEffectivelyOverdue(task)

    return (
      <div
        className="elevated-card"
        onClick={() => navigate(`/task/${task.id}`)}
        style={{ cursor: 'pointer', border: `1px solid ${isOverdue ? '#fca5a5' : 'var(--neutral-100)'}`, background: isOverdue ? '#fffafa' : 'var(--card-bg)', boxShadow: 'none' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
          <Tag fill='outline' style={{ border: 'none', background: 'var(--neutral-100)', color: 'var(--neutral-500)', fontWeight: 600 }}>
            {task.expand?.project?.name || '未知项目'}
          </Tag>
          {(task.status === 'in_progress' || (task.status as string) === 'processing') && <Tag color='primary'>进行中</Tag>}
          {task.status === 'pending' && <Tag color='default'>待办</Tag>}
          {task.status === 'overdue' && <Tag color='danger'>已逾期</Tag>}
          {task.status === 'completed' && <Tag color='success'>已完成</Tag>}
        </div>

        <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--neutral-900)' }}>
          {task.stage_name}
        </h3>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: isOverdue ? 'var(--danger-text)' : 'var(--neutral-500)', fontWeight: 500 }}>
            <IoTimeOutline />
            {task.deadline ? dayjs(task.deadline).format('MM月DD日 截止') : '无截止日期'}
          </div>

          {task.status !== 'completed' && (
            <Button
              size='mini'
              shape='rounded'
              color='primary'
              fill='outline'
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                navigate(`/task/${task.id}`)
              }}
            >
              处理
            </Button>
          )}
        </div>
      </div>
    )
  }

  const EmptyState = ({ text }: { text: string }) => (
    <div style={{ textAlign: 'center', padding: 34, color: 'var(--neutral-400)' }}>
      <div style={{ fontSize: 30, marginBottom: 9 }}>☕</div>
      <div>{text}</div>
    </div>
  )

  const renderTabContent = (list: Task[], emptyText: string) => {
    if (isDesktop) {
      return <TasksTableView tasks={list} />
    }
    return (
      <div style={{ padding: '10px 12px 14px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
        {list.length > 0 ? list.map(t => <TaskCard key={t.id} task={t} />) : <EmptyState text={emptyText} />}
      </div>
    )
  }

  return (
    <div className="page" style={{ padding: 0, background: 'var(--page-bg)' }}>
      {!isDesktop && (
        <div className="glass-header" style={{ padding: '10px 12px 8px', display: 'flex', alignItems: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 760 }}>我的任务</div>
        </div>
      )}

      <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            const next = new URLSearchParams(searchParams)
            next.set('tab', key)
            setSearchParams(next, { replace: true })
          }}
          style={{ '--title-font-size': isDesktop ? '14px' : '12px', '--active-title-color': 'var(--primary-color)', '--active-line-color': 'var(--accent-color)' }}
        >
          <Tabs.Tab title={`进行中 (${inProgressTasks.length})`} key='in_progress'>
            {renderTabContent(inProgressTasks, '没有进行中的任务')}
          </Tabs.Tab>

          <Tabs.Tab title={`待办 (${todoTasks.length})`} key='pending'>
            {renderTabContent(todoTasks, '没有待办任务')}
          </Tabs.Tab>

          <Tabs.Tab title={`逾期 (${overdueTasks.length})`} key='overdue'>
            {renderTabContent(overdueTasks, '暂无逾期任务')}
          </Tabs.Tab>

          <Tabs.Tab title={`已完成`} key='completed'>
            {renderTabContent(doneTasks, '还没有完成的任务')}
          </Tabs.Tab>
        </Tabs>
      </div>

      {loading && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'stretch', zIndex: 100, padding: '80px 20px 20px 20px' }}>
          <SkeletonList count={4} />
        </div>
      )}
    </div>
  )
}














