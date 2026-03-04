import { useEffect } from 'react'
import { Toast, Tabs, Button, Tag } from 'antd-mobile'
import { IoArrowBackOutline, IoTimeOutline } from 'react-icons/io5'
import { useNavigate } from 'react-router-dom'
import { pb } from '../lib/pocketbase'
import dayjs from 'dayjs'
import { SkeletonList } from '../components/Skeleton'
import { useMyTasks, useProjects } from '../lib/api'
import type { Task } from '../lib/api'

export default function MyTasks() {
  const navigate = useNavigate()
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
  const overdueTasks = tasks.filter(t => t.status === 'overdue')
  const doneTasks = tasks.filter(t => t.status === 'completed')

  const TaskCard = ({ task }: { task: Task }) => {
    const isOverdue = task.status === 'overdue'

    return (
      <div
        className="elevated-card fade-in"
        onClick={() => navigate(`/task/${task.id}`)}
        style={{ cursor: 'pointer', borderLeft: isOverdue ? '4px solid var(--danger-text)' : '1px solid var(--neutral-100)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <Tag fill='outline' style={{ border: 'none', background: 'var(--neutral-100)', color: 'var(--neutral-500)', fontWeight: 600 }}>
            {task.expand?.project?.name || '未知项目'}
          </Tag>
          {(task.status === 'in_progress' || (task.status as string) === 'processing') && <Tag color='primary'>进行中</Tag>}
          {task.status === 'pending' && <Tag color='default'>待办</Tag>}
          {task.status === 'overdue' && <Tag color='danger'>已逾期</Tag>}
          {task.status === 'completed' && <Tag color='success'>已完成</Tag>}
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px 0', color: 'var(--neutral-900)' }}>
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
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--neutral-400)' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>☕</div>
      <div>{text}</div>
    </div>
  )

  return (
    <div className="page" style={{ padding: 0, background: 'var(--page-bg)' }}>
      <div className="glass-header" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--neutral-600)', display: 'flex' }}
        >
          <IoArrowBackOutline size={24} />
        </button>
        <div style={{ fontSize: 18, fontWeight: 800 }}>我的任务</div>
      </div>

      <div style={{ height: 'calc(100dvh - 60px)', display: 'flex', flexDirection: 'column' }}>
        <Tabs
          defaultActiveKey='in_progress'
          style={{ '--title-font-size': '14px', '--active-title-color': 'var(--primary-color)', '--active-line-color': 'var(--accent-color)' }}
        >
          <Tabs.Tab title={`进行中 (${inProgressTasks.length})`} key='in_progress'>
            <div style={{ padding: 20, paddingBottom: 80, overflowY: 'auto', height: '100%' }}>
              {inProgressTasks.length > 0 ? inProgressTasks.map(t => <TaskCard key={t.id} task={t} />) : <EmptyState text="没有进行中的任务" />}
            </div>
          </Tabs.Tab>

          <Tabs.Tab title={`待办 (${todoTasks.length})`} key='pending'>
            <div style={{ padding: 20, paddingBottom: 80, overflowY: 'auto', height: '100%' }}>
              {todoTasks.length > 0 ? todoTasks.map(t => <TaskCard key={t.id} task={t} />) : <EmptyState text="没有待办任务" />}
            </div>
          </Tabs.Tab>

          <Tabs.Tab title={`逾期 (${overdueTasks.length})`} key='overdue'>
            <div style={{ padding: 20, paddingBottom: 80, overflowY: 'auto', height: '100%' }}>
              {overdueTasks.length > 0 ? overdueTasks.map(t => <TaskCard key={t.id} task={t} />) : <EmptyState text="暂无逾期任务" />}
            </div>
          </Tabs.Tab>

          <Tabs.Tab title={`已完成`} key='completed'>
            <div style={{ padding: 20, paddingBottom: 80, overflowY: 'auto', height: '100%' }}>
              {doneTasks.length > 0 ? doneTasks.map(t => <TaskCard key={t.id} task={t} />) : <EmptyState text="还没有完成的任务" />}
            </div>
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














