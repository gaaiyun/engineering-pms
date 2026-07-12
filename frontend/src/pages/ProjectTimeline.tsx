import { useCallback, useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { pb } from '../lib/pocketbase'
import { useQueryClient } from '@tanstack/react-query'
import { isManager, useUsers, useProject, useTasks, useNotifications } from '../lib/api'
import { queryKeys } from '../lib/queryClient'
import dayjs from 'dayjs'
import isBetween from 'dayjs/plugin/isBetween'
import 'dayjs/locale/zh-cn'
import { IoArrowBack, IoAdd, IoCreateOutline, IoChevronUp, IoChevronDown, IoRemove } from 'react-icons/io5'
import { Button, Toast, Avatar, Badge } from 'antd-mobile'
import BatchTaskEditor from '../components/BatchTaskEditor'
import { motion } from 'framer-motion'
import { SkeletonTimeline } from '../components/Skeleton'
import { getUserAvatarUrl } from '../lib/avatar'

dayjs.extend(isBetween)

// --- Types ---
interface Task {
  id: string
  stage_name: string
  status: 'pending' | 'in_progress' | 'processing' | 'completed' | 'overdue' | 'blocked'
  start_date: string
  deadline: string
  created: string
  updated: string
  next_steps?: string
  priority?: 'low' | 'normal' | 'high'
  description?: string // Added for blocker reason parsing
  blocker?: {
    reason_detail?: string
    reason_type?: string
  } | null
  expand?: {
    assignees?: TimelineUser[]
  }
}

interface TimelineUser {
  id: string
  name: string
  avatar: string
  department?: string
  collectionId?: string
  collectionName?: string
}

interface Project {
  id: string
  name: string
  status: string
  members?: string[]
}

interface TimelineGroup {
  id: string
  user: { id: string, name: string, avatar: string } | null
  tasks: TaskLayout[]
  height: number // Grid height based on max overlapping tasks
}

interface TaskLayout extends Task {
  visualRow: number // Visual vertical stack index within the group (0, 1, 2...)
}

// --- Constants ---
const BASE_CELL_WIDTH = 60
const MOBILE_MIN_CELL_WIDTH = 44 // 手机端最小宽度，防止过于拥挤
const DESKTOP_SIDEBAR_WIDTH = 104
const MOBILE_SIDEBAR_WIDTH = 64
const TASK_HEIGHT_PC = 52
const TASK_HEIGHT_MOBILE = 44
const TASK_GAP_PC = 10
const TASK_GAP_MOBILE = 6
const ROW_PADDING_TOP_PC = 14
const ROW_PADDING_TOP_MOBILE = 8
const ROW_PADDING_BOTTOM_PC = 14
const ROW_PADDING_BOTTOM_MOBILE = 8

type TimelineFilter = 'all' | 'active' | 'blocked' | 'overdue' | 'completed'

const FILTERS: { value: TimelineFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '进行中' },
  { value: 'blocked', label: '阻塞' },
  { value: 'overdue', label: '逾期' },
  { value: 'completed', label: '完成' },
]

export default function ProjectTimeline() {
  const { id } = useParams()
  const navigate = useNavigate()

  const queryClient = useQueryClient()
  const { data: rqProject } = useProject(id || '')
  const { data: rqTasks = [], isLoading: tasksLoading } = useTasks(id || '')
  const project = (rqProject as unknown as Project) || null

  const [groups, setGroups] = useState<TimelineGroup[]>([])
  const [loading, setLoading] = useState(true)

  // View State
  const [timelineStart, setTimelineStart] = useState(dayjs().subtract(7, 'day'))
  const [timelineDays, setTimelineDays] = useState(45)
  const [scale, setScale] = useState(1.0) // 0.5 - 2.0
  const [statusFilter, setStatusFilter] = useState<TimelineFilter>('all')
  
  // Responsive Check
  const checkIsPC = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    if (w > 1024) return true
    if (w > 768 && !isTouch) return true
    if (w > 768 && h < 500) return false
    return false
  }
  const [isPC, setIsPC] = useState(checkIsPC)
  
  // Landscape detection (natural orientation, not forced)
  const [isNaturalLandscape, setIsNaturalLandscape] = useState(
    window.innerWidth > window.innerHeight
  )
  const [showBatchEditor, setShowBatchEditor] = useState(false)
  const [summaryCollapsed, setSummaryCollapsed] = useState(() => !checkIsPC())

  const { data: allUsers = [] } = useUsers()
  const userId = pb.authStore.model?.id || ''
  const { data: allNotifs = [] } = useNotifications(userId)
  const projectNotifCount = useMemo(() => {
    if (!id) return 0
    const taskIds = new Set(rqTasks.map(t => t.id))
    let count = 0
    for (const n of allNotifs) {
      if (n.is_read) continue
      if (n.link_type === 'project' && n.link_id === id) count++
      else if (n.link_type === 'task' && n.link_id && taskIds.has(n.link_id)) count++
    }
    return count
  }, [id, allNotifs, rqTasks])

  // 移动端动态间距
  const TASK_GAP = isPC ? TASK_GAP_PC : TASK_GAP_MOBILE
  const TASK_HEIGHT = isPC ? TASK_HEIGHT_PC : TASK_HEIGHT_MOBILE
  const ROW_PADDING_TOP = isPC ? ROW_PADDING_TOP_PC : ROW_PADDING_TOP_MOBILE
  const ROW_PADDING_BOTTOM = isPC ? ROW_PADDING_BOTTOM_PC : ROW_PADDING_BOTTOM_MOBILE

  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const focusedDateRef = useRef<string | null>(null)

  // Detect PC/Mobile resize + natural orientation + landscape collapse
  useEffect(() => {
    const handleResize = () => {
      setIsPC(checkIsPC())
      setIsNaturalLandscape(window.innerWidth > window.innerHeight)
      const nowPhoneLandscape = window.innerHeight < 500 && window.innerWidth > window.innerHeight
      if (nowPhoneLandscape || !checkIsPC()) setSummaryCollapsed(true)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!id) return
    pb.collection('tasks').subscribe('*', (e) => {
      if (e.record.project === id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(id) })
      }
    })
    return () => { pb.collection('tasks').unsubscribe('*') }
  }, [id, queryClient])

  // --- Core Layout Logic ---
  const processGroups = useCallback((allTasks: Task[]) => {
    const tempGroups: Record<string, TimelineGroup> = {}
    const unassignedTasks: Task[] = []

    // 1. Group by First Assignee
    allTasks.forEach(task => {
      const assignees = task.expand?.assignees
      const assigneeList = Array.isArray(assignees) ? assignees : (assignees ? [assignees] : [])

      if (assigneeList.length === 0) {
        unassignedTasks.push(task)
      } else {
        const u = assigneeList[0] // Group by primary assignee
        if (!tempGroups[u.id]) {
          tempGroups[u.id] = { id: u.id, user: u, tasks: [], height: 0 }
        }
        // Add task with initialized layout prop
        tempGroups[u.id].tasks.push({ ...task, visualRow: 0 })
      }
    })

    // 2. Add Unassigned Group
    if (unassignedTasks.length > 0) {
      tempGroups['unassigned'] = {
        id: 'unassigned',
        user: null,
        tasks: unassignedTasks.map(t => ({ ...t, visualRow: 0 })),
        height: 0
      }
    }

    // 3. Calculate Stacking (Visual Rows) for each group
    const calcLayout = (groupTasks: TaskLayout[]): { tasks: TaskLayout[], maxRow: number } => {
      // Sort by start time
      const sorted = [...groupTasks].sort((a, b) => {
        const startA = dayjs(a.start_date || a.created).unix()
        const startB = dayjs(b.start_date || b.created).unix()
        return startA - startB
      })

      // Pre-compute adjusted date ranges (same logic as getTaskStyle)
      const getRange = (t: Task) => {
        const s = dayjs(t.start_date || t.created)
        let e = t.deadline ? dayjs(t.deadline) : s.add(1, 'day')
        if (e.diff(s, 'day', true) < 0.5) e = s.add(1, 'day')
        return { s, e }
      }

      const processed: { task: TaskLayout, s: dayjs.Dayjs, e: dayjs.Dayjs }[] = []
      let maxRow = 0

      sorted.forEach(task => {
        const { s, e } = getRange(task)

        // Find first available visual row (no overlap)
        let currentRow = 0
        while (true) {
          const collision = processed.find(p =>
            p.task.visualRow === currentRow &&
            p.s.isBefore(e) &&
            p.e.isAfter(s)
          )
          if (!collision) break
          currentRow++
        }

        task.visualRow = currentRow
        processed.push({ task, s, e })
        if (currentRow > maxRow) maxRow = currentRow
      })

      return { tasks: sorted, maxRow }
    }

    // 4. Finalize Groups
    const finalGroups: TimelineGroup[] = Object.values(tempGroups).map(g => {
      const { tasks, maxRow } = calcLayout(g.tasks)
      const height = (maxRow + 1) * (TASK_HEIGHT + TASK_GAP) + ROW_PADDING_TOP + ROW_PADDING_BOTTOM
      return { ...g, tasks, height: Math.max(height, 80) } // Min height
    })

    // 5. Update Timeline Range
    if (allTasks.length > 0) {
      // Determine min/max date from tasks
      let minT = dayjs().subtract(3, 'day')
      let maxT = dayjs().add(14, 'day')

      allTasks.forEach(t => {
        const s = dayjs(t.start_date || t.created)
        const e = t.deadline ? dayjs(t.deadline) : s.add(1, 'day')
        if (s.isBefore(minT)) minT = s.subtract(2, 'day')
        if (e.isAfter(maxT)) maxT = e.add(5, 'day')
      })

      setTimelineStart(minT)
      setTimelineDays(Math.max(1, maxT.diff(minT, 'day')))
    }

    setGroups(finalGroups)
  }, [ROW_PADDING_BOTTOM, ROW_PADDING_TOP, TASK_GAP, TASK_HEIGHT])

  const visibleTasks = useMemo(() => {
    const now = dayjs()
    return (rqTasks as unknown as Task[]).filter((task) => {
      const isOverdue = task.status !== 'completed' && !!task.deadline && dayjs(task.deadline).isBefore(now)
      if (statusFilter === 'all') return true
      if (statusFilter === 'active') return task.status === 'in_progress' || task.status === 'processing' || task.status === 'pending'
      if (statusFilter === 'overdue') return isOverdue
      return task.status === statusFilter
    })
  }, [rqTasks, statusFilter])

  useEffect(() => {
    if (tasksLoading) {
      setLoading(true)
      return
    }
    processGroups(visibleTasks)
    setLoading(false)
  }, [visibleTasks, tasksLoading, processGroups])

  // --- Geometry Calc ---
  const rawCellWidth = BASE_CELL_WIDTH * scale
  const CELL_WIDTH = Math.round(isPC ? rawCellWidth : Math.max(rawCellWidth, MOBILE_MIN_CELL_WIDTH))
  const sidebarWidth = isPC ? DESKTOP_SIDEBAR_WIDTH : MOBILE_SIDEBAR_WIDTH

  const scrollToDate = useCallback((date: dayjs.Dayjs, behavior: ScrollBehavior = 'smooth') => {
    const container = containerRef.current
    if (!container) return
    const diff = date.diff(timelineStart, 'day', true)
    const visibleTimelineWidth = Math.max(0, container.clientWidth - sidebarWidth)
    container.scrollTo({
      left: Math.max(0, diff * CELL_WIDTH - visibleTimelineWidth / 2),
      behavior,
    })
  }, [CELL_WIDTH, sidebarWidth, timelineStart])

  useEffect(() => {
    if (!focusedDateRef.current) return
    const frame = requestAnimationFrame(() => scrollToDate(dayjs(focusedDateRef.current!), 'auto'))
    return () => cancelAnimationFrame(frame)
  }, [isNaturalLandscape, scrollToDate])

  const getTaskStyle = (task: Task) => {
    const start = dayjs(task.start_date || task.created)
    let end = task.deadline ? dayjs(task.deadline) : start.add(1, 'day')
    if (end.diff(start, 'day', true) < 0.5) end = start.add(1, 'day')

    const offsetDays = start.diff(timelineStart, 'day', true)
    const durationDays = end.diff(start, 'day', true)

    // Math.round 避免小数像素导致日期刻度不对齐
    return {
      left: Math.round(Math.max(0, offsetDays * CELL_WIDTH)),
      width: Math.round(Math.max(durationDays * CELL_WIDTH, 40))
    }
  }

  // --- Render ---

  if (loading) return (
    <div style={{ paddingTop: 60, paddingLeft: 20 }}>
      <SkeletonTimeline />
    </div>
  )

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      setScale(s => Math.min(2.0, Math.max(0.2, s + delta)))
    }
  }

  // Smart Locate: Find first ACTIVE or PENDING task, or today
  const handleLocateUser = (group: TimelineGroup) => {
    const pendingTask =
      group.tasks.find(t =>
        t.status === 'in_progress' || t.status === 'processing' || t.status === 'overdue' || t.status === 'blocked'
      ) ||
      group.tasks.find(t => t.status === 'pending') ||
      group.tasks[0];

    if (pendingTask) {
      if (containerRef.current) {
        focusedDateRef.current = pendingTask.start_date
        scrollToDate(dayjs(pendingTask.start_date))
        Toast.show(`定位到 ${group.user?.name || '未知'} 的任务`);
      }
    } else {
      Toast.show('该用户暂无活跃任务');
    }
  }

  return (
    <div
      className="timeline-container"
      style={{
        overflow: 'hidden',
        background: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        width: '100%',
      }}
    >
      {/* 1. Navbar */}
      <div className="timeline-header" style={{
        padding: isPC ? '14px 20px' : '9px 10px',
        background: '#ffffff',
        borderBottom: '1px solid #dbe3ea',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 60,
        position: 'sticky',
        top: 0,
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          <Button fill='none' onClick={() => navigate(`/project/${id}`)} style={{ padding: 4 }}>
            <IoArrowBack size={isPC ? 22 : 19} color="#334155" />
          </Button>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            {isPC && <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 2 }}>项目进度看板</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: isPC ? 18 : 16, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {project?.name || '加载中...'}
              </span>
              {projectNotifCount > 0 && (
                <Badge content={projectNotifCount > 99 ? '99+' : projectNotifCount} style={{ '--color': '#DC2626', flexShrink: 0, fontSize: 10 }} />
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <Button size='small' style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => {
            focusedDateRef.current = dayjs().toISOString()
            scrollToDate(dayjs(), 'auto')
            Toast.show('已回到今天');
          }}>
            {isPC ? '回到今天' : '今天'}
          </Button>

          <div style={{ background: '#f1f5f9', padding: 2, borderRadius: 7, display: 'flex', alignItems: 'center' }}>
              <Button aria-label="缩小时间轴" size='small' fill='none' onClick={() => setScale(s => Math.max(0.2, s - 0.2))} style={{ minWidth: 28, padding: 2 }}>
                <IoRemove size={16} />
              </Button>
              <div style={{ fontSize: 11, fontWeight: 700, width: isPC ? 40 : 30, textAlign: 'center', color: '#475569' }}>
                {Math.round(scale * 100)}
              </div>
              <Button aria-label="放大时间轴" size='small' fill='none' onClick={() => setScale(s => Math.min(2.0, s + 0.2))} style={{ minWidth: 28, padding: 2 }}>
                <IoAdd size={16} />
              </Button>
          </div>

          {isManager() && (
            <Button
              size="small"
              color="primary"
              aria-label="批量编辑任务"
              onClick={() => setShowBatchEditor(true)}
              style={{ minWidth: 40, minHeight: 36, padding: isPC ? '4px 10px' : '4px 8px' }}
            >
              <IoCreateOutline size={17} />{isPC ? '编辑任务' : ''}
            </Button>
          )}

        </div>
      </div>

      <div
        aria-label="时间轴任务筛选"
        style={{
          display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto', flexShrink: 0,
          padding: isPC ? '8px 20px' : '6px 10px', background: '#fff', borderBottom: '1px solid #e7ebef',
        }}
      >
        {FILTERS.map((filter) => {
          const selected = statusFilter === filter.value
          return (
            <button
              key={filter.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setStatusFilter(filter.value)}
              style={{
                flex: '0 0 auto', border: `1px solid ${selected ? '#315f86' : '#dce3e9'}`,
                borderRadius: 6, background: selected ? '#315f86' : '#fff', color: selected ? '#fff' : '#5e6b7c',
                padding: isPC ? '5px 10px' : '4px 8px', fontSize: isPC ? 12 : 11, fontWeight: 650,
              }}
            >
              {filter.label}
            </button>
          )
        })}
        <span style={{ marginLeft: 'auto', flex: '0 0 auto', color: '#8692a2', fontSize: 10 }}>
          {visibleTasks.length}/{rqTasks.length} 项
        </span>
      </div>

      {/* 2. Main Scroll Area with Inertia */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        className="timeline-scroll-area"
        style={{
          flex: 1,
          overflow: 'auto',
          position: 'relative',
          overscrollBehavior: 'none', // Prevent bounce
          cursor: 'grab',
          paddingBottom: isPC ? 32 : 16,
          WebkitOverflowScrolling: 'touch'
        }}
        onMouseDown={(e) => {
          const ele = containerRef.current
          if (!ele) return
          ele.style.cursor = 'grabbing'
          ele.style.userSelect = 'none'

          const startX = e.pageX
          const startY = e.pageY
          const scrollLeft = ele.scrollLeft
          const scrollTop = ele.scrollTop

          const onMouseMove = (moveEvent: MouseEvent) => {
            const x = moveEvent.pageX
            const y = moveEvent.pageY
            const walkX = (x - startX) * 1.5
            const walkY = (y - startY) * 1.5
            ele.scrollLeft = scrollLeft - walkX
            ele.scrollTop = scrollTop - walkY
          }

          const onMouseUp = () => {
            ele.style.cursor = 'grab'
            ele.style.removeProperty('user-select')
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
          }

          window.addEventListener('mousemove', onMouseMove)
          window.addEventListener('mouseup', onMouseUp)
        }}
      >
        <div style={{
          minWidth: '100%',
          width: 'max-content', // Allow growing
          position: 'relative'
        }}>

          {/* A. Time Axis Header (Sticky Top) */}
          <div style={{
            position: 'sticky', top: 0, zIndex: 40, background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
            height: isPC ? 48 : 40, display: 'flex'
          }}>
            {/* Frozen assignee header */}
            <div style={{
              position: 'sticky', left: 0, width: sidebarWidth, height: isPC ? 48 : 40, background: '#fff',
              zIndex: 51, borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isPC ? 12 : 10, fontWeight: 650, color: '#64748b', flexShrink: 0,
            }}>
              执行人
            </div>

            {/* Days Header */}
            {Array.from({ length: timelineDays }).map((_, i) => {
              const d = timelineStart.add(i, 'day')
              const isToday = d.isSame(dayjs(), 'day')
              const isWeekend = d.day() === 0 || d.day() === 6
              return (
                <div key={i} style={{
                  width: CELL_WIDTH, height: '100%', borderRight: '1px dashed #e2e8f0',
                  background: isToday ? '#eff6ff' : isWeekend ? '#f8fafc' : 'transparent',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>{d.format('MM/DD')}</span>
                  <span style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: isToday ? '#2563eb' : '#475569', marginTop: 2 }}>{d.locale('zh-cn').format('ddd')}</span>
                </div>
              )
            })}
          </div>

          {/* B. Swimlanes */}
          <div style={{ position: 'relative' }}>
            {/* Background Grid */}
            <div style={{ position: 'absolute', inset: 0, left: sidebarWidth, pointerEvents: 'none', zIndex: 0, display: 'flex' }}>
              {Array.from({ length: timelineDays }).map((_, i) => (
                <div key={i} style={{ width: CELL_WIDTH, borderRight: '1px dashed #f1f5f9', height: '100%', flexShrink: 0 }} />
              ))}
            </div>

            {/* Groups */}
            {groups.map((group) => (
              <div key={group.id} style={{
                height: group.height,
                borderBottom: '1px solid #e2e8f0',
                position: 'relative',
                background: '#fff',
                display: 'flex'
              }}>
                {/* 1. Frozen Sidebar (Sticky) */}
                <div
                  onClick={() => handleLocateUser(group)}
                  style={{
                    position: 'sticky', left: 0, width: sidebarWidth, height: '100%', background: '#fff',
                    borderRight: '1px solid #e2e8f0', zIndex: 30, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', paddingTop: isPC ? 14 : 8, boxShadow: '2px 0 5px rgba(0,0,0,0.02)', cursor: 'pointer',
                    flexShrink: 0
                  }}>
                  <Avatar src={getUserAvatarUrl(group.user)} style={{ '--size': isPC ? '34px' : '28px' }} />
                  <span style={{ fontSize: isPC ? 11 : 10, marginTop: 3, textAlign: 'center', color: '#334155', padding: '0 3px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {group.user?.name || '待分配'}
                  </span>
                  <span style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{group.tasks.length} 任务</span>
                </div>

                {/* 2. Tasks Area (Relative to this row) */}
                <div style={{ position: 'relative', flexGrow: 1, height: '100%' }}>
                  {group.tasks.map(task => {
                    const style = getTaskStyle(task)
                    const top = ROW_PADDING_TOP + (task.visualRow * (TASK_HEIGHT + TASK_GAP))
                    const isBlocked = task.status === 'blocked'
                    const isDone = task.status === 'completed'
                    const isOverdue = !isDone && !!task.deadline && dayjs(task.deadline).isBefore(dayjs())

                    let blockerReason = task.blocker?.reason_detail || '阻塞中'
                    if (isBlocked && blockerReason === '阻塞中' && task.description && task.description.includes('BLOCKER')) {
                      const match = task.description.match(/BLOCKER\]: (.*)/);
                      if (match) blockerReason = match[1].trim()
                    }

                    return (
                      <motion.div
                        key={task.id}
                        className={task.status === 'in_progress' ? 'task-active-glow' : ''}
                        onClick={() => navigate(`/task/${task.id}`)}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileHover={{ scale: 1.02, zIndex: 50, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        style={{
                          position: 'absolute',
                          left: style.left,
                          width: style.width,
                          top,
                          height: TASK_HEIGHT,
                          background: isDone ? '#ecfdf5' : isBlocked ? '#fff1f2' : isOverdue ? '#fff7ed' : '#eff6ff',
                          border: `1px solid ${isDone ? '#86efac' : isBlocked ? '#fda4af' : isOverdue ? '#fdba74' : '#93c5fd'}`,
                          borderRadius: 4,
                          padding: isPC ? '4px 8px' : '3px 6px',
                          display: 'flex', flexDirection: 'column', justifyContent: 'center',
                          cursor: 'pointer', zIndex: 10, overflow: 'visible'
                        }}
                      >
                        <div style={{ position: 'sticky', left: sidebarWidth + 6, width: 'fit-content', maxWidth: isPC ? 180 : 150, fontSize: isPC ? 11 : 10, fontWeight: 650, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ background: isDone ? '#34d399' : isBlocked ? '#f43f5e' : '#3b82f6', color: '#fff', borderRadius: '50%', width: isPC ? 16 : 14, height: isPC ? 16 : 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, flexShrink: 0 }}>
                            {group.tasks.indexOf(task) + 1}
                          </span>
                          {task.stage_name}
                        </div>
                        {scale > 0.6 && (
                          <div style={{ position: 'sticky', left: sidebarWidth + 6, width: 'fit-content', maxWidth: isPC ? 180 : 150, fontSize: 8, color: '#64748b', display: 'flex', gap: 5, marginTop: 1 }}>
                            {isBlocked && <span style={{ color: '#e11d48', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{blockerReason.slice(0, isPC ? 10 : 6)}{blockerReason.length > (isPC ? 10 : 6) ? '…' : ''}</span>}
                            {isOverdue && !isBlocked && <span style={{ color: '#c2410c', whiteSpace: 'nowrap' }}>逾期</span>}
                            {!isBlocked && !isOverdue && task.deadline && <span style={{ whiteSpace: 'nowrap' }}>{dayjs(task.deadline).format('MM/DD')}</span>}
                          </div>
                        )}
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 批量任务编辑器 */}
      {project && isManager() && (
        <BatchTaskEditor
          projectId={id || ''}
          visible={showBatchEditor}
          onClose={() => { setShowBatchEditor(false); if (id) queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(id) }) }}
          projectMembers={project.members || []}
          allUsers={allUsers}
          existingTasks={groups.flatMap(g => g.tasks).map(t => ({ id: t.id, stage_name: t.stage_name, assignees: t.expand?.assignees?.map(u => u.id) || [], start_date: t.start_date || '', deadline: t.deadline || '' }))}
        />
      )}
      {/* 3. Collapsible Project Summary */}
      <div style={{ background: '#fff', borderTop: '1px solid #e2e8f0', paddingBottom: summaryCollapsed ? 0 : 'calc(8px + env(safe-area-inset-bottom))', zIndex: 50 }}>
        <div
          onClick={() => setSummaryCollapsed(c => !c)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 24px', cursor: 'pointer', userSelect: 'none'
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#334155' }}>项目概览</h3>
          {summaryCollapsed ? <IoChevronUp size={18} color="#94a3b8" /> : <IoChevronDown size={18} color="#94a3b8" />}
        </div>
        {!summaryCollapsed && (
          <div style={{ padding: '0 24px 16px', display: 'flex', gap: 16, overflowX: 'auto' }}>
            {project && (
              <div style={{
                minWidth: 200, padding: 16, borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc',
                display: 'flex', flexDirection: 'column', gap: 4
              }}>
                <div style={{ fontSize: 12, color: '#64748b' }}>当前项目</div>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{project.name}</div>
                <div style={{ fontSize: 11, color: '#2563eb', marginTop: 4 }}>{project.status === 'active' ? '进行中' : project.status === 'completed' ? '已完成' : project.status === 'archived' ? '已归档' : project.status}</div>
              </div>
            )}
            {groups.map(g => (
              <div key={g.id} style={{
                minWidth: 160, padding: 12, borderRadius: 12, border: '1px solid #f1f5f9', background: '#fff',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Avatar src={getUserAvatarUrl(g.user)} style={{ '--size': '24px' }} />
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{g.user?.name || '待分配'}</div>
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  <div>任务: {g.tasks.length}</div>
                  <div style={{ color: g.tasks.some(t => t.status === 'overdue') ? '#ef4444' : '#64748b' }}>
                    逾期: {g.tasks.filter(t => t.status === 'overdue').length}
                  </div>
                  <div style={{ color: g.tasks.some(t => t.status === 'blocked') ? '#f59e0b' : '#64748b' }}>
                    阻塞: {g.tasks.filter(t => t.status === 'blocked').length}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
