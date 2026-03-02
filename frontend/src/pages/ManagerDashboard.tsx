import React, { useMemo, useState } from 'react'
import { NavBar, Card, Grid, List, Tag, Badge, Button, ProgressBar, Toast, SpinLoading } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { useTasks, useProjects, usePendingHandoffs, useUsers, useCurrentUser, useAISummaries, type Task, type Project, type User } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { AISummaryCard } from '../components/dashboard/AISummaryCard'
import { IoWarningOutline, IoCalendarOutline, IoBarChartOutline, IoBriefcaseOutline, IoBulbOutline, IoDocumentTextOutline } from 'react-icons/io5'
import './ManagerDashboard.css'

const ManagerDashboard: React.FC = () => {
    const navigate = useNavigate()
    const { data: tasks = [], isLoading: tasksLoading, isError: tasksError, refetch: refetchTasks } = useTasks()
    const { data: projects = [], isLoading: projectsLoading, isError: projectsError, refetch: refetchProjects } = useProjects()
    const { data: pendingHandoffs = [] } = usePendingHandoffs()
    const { data: users = [] } = useUsers()
    const { data: currentUser } = useCurrentUser()
    const { data: aiSummaries = [] } = useAISummaries(currentUser?.id || '')
    const [aiExpanded, setAiExpanded] = useState(false)

    const isLoading = tasksLoading || projectsLoading
    const isError = tasksError || projectsError
    const handleRetry = () => { refetchTasks(); refetchProjects() }

    const archivedProjectIds = useMemo(
        () => new Set(projects.filter((p: Project) => p.status === 'archived').map(p => p.id)),
        [projects],
    )
    const activeTasks = useMemo(
        () => tasks.filter(t => !archivedProjectIds.has(t.project)),
        [tasks, archivedProjectIds],
    )

    const abnormalTasks = useMemo(() => {
        const now = new Date()
        const overdue: Task[] = []
        const blocked: Task[] = []
        const dueToday: Task[] = []

        activeTasks.forEach((task: Task) => {
            if (task.status === 'completed') return

            if (task.status === 'blocked') {
                blocked.push(task)
                return
            }

            if (task.deadline) {
                const deadline = new Date(task.deadline)
                const diffDays = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

                if (diffDays < 0) {
                    overdue.push(task)
                } else if (diffDays === 0) {
                    dueToday.push(task)
                }
            }
        })

        return { overdue, blocked, dueToday }
    }, [activeTasks])

    // 计算指标
    const metrics = useMemo(() => ({
        totalProjects: projects.filter((p: Project) => p.status === 'active').length,
        overdueCount: abnormalTasks.overdue.length,
        blockedCount: abnormalTasks.blocked.length,
        pendingReview: pendingHandoffs.length,
        completedToday: activeTasks.filter((t: Task) => {
            if (t.status !== 'completed') return false
            const updated = new Date(t.updated)
            const today = new Date()
            return updated.toDateString() === today.toDateString()
        }).length,
    }), [projects, abnormalTasks, pendingHandoffs, activeTasks])

    // 团队工作量 - 修复：正确统计所有状态
    const workloadData = useMemo(() => {
        const userTaskCount: Record<string, { name: string; pending: number; inProgress: number; completed: number; blocked: number; overdue: number }> = {}

        users.forEach((user: User) => {
            userTaskCount[user.id] = { 
                name: user.name || user.username || '未命名', 
                pending: 0, 
                inProgress: 0, 
                completed: 0,
                blocked: 0,
                overdue: 0
            }
        })

        activeTasks.forEach((task: Task) => {
            const assigneeIds = task.assignees || []
            const expandedAssigneeIds = task.expand?.assignees?.map((u: User) => u.id) || []
            const allAssigneeIds = [...new Set([...assigneeIds, ...expandedAssigneeIds])]
            
            allAssigneeIds.forEach((userId: string) => {
                if (userTaskCount[userId]) {
                    // 使用 string 类型兼容旧数据中的 'processing' 状态
                    const status = task.status as string
                    if (status === 'pending') userTaskCount[userId].pending++
                    else if (status === 'in_progress' || status === 'processing') userTaskCount[userId].inProgress++
                    else if (status === 'completed') userTaskCount[userId].completed++
                    else if (status === 'blocked') userTaskCount[userId].blocked++
                    else if (status === 'overdue') userTaskCount[userId].overdue++
                }
            })
        })

        return Object.values(userTaskCount)
            .filter((u) => u.pending + u.inProgress + u.completed + u.blocked + u.overdue > 0)
            .sort((a, b) => (b.pending + b.inProgress + b.completed) - (a.pending + a.inProgress + a.completed))
    }, [users, activeTasks])

    // ECharts 配置 - 增强显示
    const chartOption = useMemo(() => ({
        tooltip: { 
            trigger: 'axis', 
            axisPointer: { type: 'shadow' },
            formatter: (params: any) => {
                let result = `<strong>${params[0].name}</strong><br/>`;
                let total = 0;
                params.forEach((p: any) => {
                    if (p.value > 0) {
                        result += `${p.marker} ${p.seriesName}: ${p.value}<br/>`;
                        total += p.value;
                    }
                });
                result += `<strong>总计: ${total}</strong>`;
                return result;
            }
        },
        legend: { data: ['待开始', '进行中', '卡点', '逾期', '已完成'], bottom: 0, textStyle: { fontSize: 10 } },
        grid: { left: '3%', right: '4%', bottom: '18%', top: '5%', containLabel: true },
        xAxis: {
            type: 'category',
            data: workloadData.map((d) => d.name),
            axisLabel: { interval: 0, rotate: workloadData.length > 4 ? 45 : 0, fontSize: 10 },
        },
        yAxis: { type: 'value', minInterval: 1 },
        series: [
            { name: '待开始', type: 'bar', stack: 'total', data: workloadData.map((d) => d.pending), itemStyle: { color: '#8c8c8c' } },
            { name: '进行中', type: 'bar', stack: 'total', data: workloadData.map((d) => d.inProgress), itemStyle: { color: '#1890ff' } },
            { name: '卡点', type: 'bar', stack: 'total', data: workloadData.map((d) => d.blocked), itemStyle: { color: '#faad14' } },
            { name: '逾期', type: 'bar', stack: 'total', data: workloadData.map((d) => d.overdue), itemStyle: { color: '#ff4d4f' } },
            { name: '已完成', type: 'bar', stack: 'total', data: workloadData.map((d) => d.completed), itemStyle: { color: '#52c41a' } },
        ],
    }), [workloadData])

    const goToReviewCenter = () => navigate('/review-center')
    const goToTask = (taskId: string) => navigate(`/task/${taskId}`)

    return (
        <div className="manager-dashboard">
            <NavBar onBack={() => navigate(-1)}>
                经理工作台
            </NavBar>

            <div className="dashboard-content">
                {isLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60dvh', gap: 16 }}>
                        <SpinLoading style={{ '--size': '36px' }} />
                        <span style={{ color: '#94a3b8', fontSize: 14 }}>加载中...</span>
                    </div>
                ) : isError ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60dvh', gap: 16 }}>
                        <IoWarningOutline style={{ fontSize: 48, color: '#ef4444' }} />
                        <span style={{ color: '#334155', fontSize: 16, fontWeight: 600 }}>数据加载失败</span>
                        <Button color="primary" size="small" shape="rounded" onClick={handleRetry}>重试</Button>
                    </div>
                ) : (<>
                {/* 关键指标卡片 — 首屏优先 */}
                <Grid columns={2} gap={12} className="metrics-grid">
                    <Card className="metric-card" onClick={() => navigate('/my-projects')} style={{ cursor: 'pointer' }}>
                        <div className="metric-value">{metrics.totalProjects}</div>
                        <div className="metric-label">进行中项目 →</div>
                    </Card>
                    <Card className="metric-card danger" onClick={goToReviewCenter} style={{ cursor: 'pointer' }}>
                        <Badge content={metrics.pendingReview > 0 ? metrics.pendingReview : null}>
                            <div className="metric-value">{metrics.pendingReview}</div>
                        </Badge>
                        <div className="metric-label">待审核交接 →</div>
                    </Card>
                    <Card className="metric-card warning" onClick={() => navigate('/my-tasks')} style={{ cursor: 'pointer' }}>
                        <div className="metric-value">{metrics.overdueCount}</div>
                        <div className="metric-label">逾期任务 →</div>
                    </Card>
                    <Card className="metric-card caution" onClick={() => navigate('/my-tasks')} style={{ cursor: 'pointer' }}>
                        <div className="metric-value">{metrics.blockedCount}</div>
                        <div className="metric-label">卡点任务 →</div>
                    </Card>
                </Grid>

                {/* 快捷操作 */}
                <Card className="action-card">
                    <Button color="primary" block onClick={goToReviewCenter}>
                        <IoDocumentTextOutline style={{ marginRight: 4 }} /> 进入审核中心
                    </Button>
                </Card>

                {/* 异常任务列表 */}
                {
                    (abnormalTasks.overdue.length > 0 || abnormalTasks.blocked.length > 0) && (
                        <Card title={<><IoWarningOutline style={{ marginRight: 4 }} />异常任务</>} className="abnormal-card">
                            <List>
                                {abnormalTasks.overdue.slice(0, 5).map((task: Task) => (
                                    <List.Item
                                        key={task.id}
                                        onClick={() => goToTask(task.id)}
                                        extra={<Tag color="danger">逾期</Tag>}
                                        description={task.expand?.project?.name}
                                    >
                                        {task.stage_name}
                                    </List.Item>
                                ))}
                                {abnormalTasks.blocked.slice(0, 5).map((task: Task) => (
                                    <List.Item
                                        key={task.id}
                                        onClick={() => goToTask(task.id)}
                                        extra={<Tag color="warning">卡点</Tag>}
                                        description={task.blocker?.reason_type}
                                    >
                                        {task.stage_name}
                                    </List.Item>
                                ))}
                            </List>
                        </Card>
                    )
                }

                {/* 今日到期 */}
                {
                    abnormalTasks.dueToday.length > 0 && (
                        <Card title={<><IoCalendarOutline style={{ marginRight: 4 }} />今日到期</>} className="due-today-card">
                            <List>
                                {abnormalTasks.dueToday.map((task: Task) => (
                                    <List.Item
                                        key={task.id}
                                        onClick={() => goToTask(task.id)}
                                        description={task.expand?.assignees?.map((u: User) => u.name).join(', ')}
                                    >
                                        {task.stage_name}
                                    </List.Item>
                                ))}
                            </List>
                        </Card>
                    )
                }

                {/* 团队工作量图表 */}
                {
                    workloadData.length > 0 && (
                        <Card title={<><IoBarChartOutline style={{ marginRight: 4 }} />团队工作量</>} className="chart-card">
                            <ReactECharts
                                option={chartOption}
                                style={{ height: 280 }}
                                opts={{ renderer: 'svg' }}
                            />
                        </Card>
                    )
                }

                {/* 项目进度概览 */}
                <Card title={<><IoBriefcaseOutline style={{ marginRight: 4 }} />项目进度</>} className="progress-card">
                    <List>
                        {projects.filter((p: Project) => p.status === 'active').slice(0, 5).map((project: Project) => {
                            const projectTasks = tasks.filter((t: Task) => t.project === project.id)
                            const completed = projectTasks.filter((t: Task) => t.status === 'completed').length
                            const total = projectTasks.length
                            const percent = total > 0 ? Math.round((completed / total) * 100) : 0

                            return (
                                <List.Item
                                    key={project.id}
                                    onClick={() => navigate(`/project/${project.id}/timeline`)}
                                >
                                    <div className="project-progress">
                                        <div className="project-name">{project.name}</div>
                                        <ProgressBar percent={percent} />
                                        <div className="progress-text">{completed}/{total} 完成</div>
                                    </div>
                                </List.Item>
                            )
                        })}
                    </List>
                </Card>

                {/* AI 简报 — 折叠区域，移至底部 */}
                <Card
                    title={
                        <div onClick={() => setAiExpanded(!aiExpanded)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span><IoBulbOutline style={{ marginRight: 4 }} />AI 智能简报</span>
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>{aiExpanded ? '收起 ▲' : '展开 ▼'}</span>
                        </div>
                    }
                    style={{ marginTop: 12 }}
                >
                    {aiExpanded && (
                        aiSummaries.length > 0 ? (
                            <AISummaryCard summary={aiSummaries[0]} />
                        ) : (
                            <div style={{ textAlign: 'center', padding: '12px 0' }}>
                                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>尚无今日简报</div>
                                <Button
                                    color='primary'
                                    size='small'
                                    onClick={async () => {
                                        try {
                                            Toast.show({ content: '正在聚合数据...', icon: 'loading', duration: 0 })
                                            const { aggregateProjectData, generateAIReport } = await import('../lib/ai-service')
                                            const data = await aggregateProjectData()
                                            const apiKey = localStorage.getItem('sf_api_key')
                                            if (!apiKey) { Toast.clear(); Toast.show({ content: '请先在"AI决策"页面配置API Key', icon: 'fail' }); return }
                                            Toast.show({ content: '正在生成智能分析...', icon: 'loading', duration: 0 })
                                            const aiRes = await generateAIReport(data, apiKey)
                                            const { pb } = await import('../lib/pocketbase')
                                            const userId = pb.authStore.model?.id
                                            if (userId && aiRes) {
                                                await pb.collection('ai_summaries').create({
                                                    target_user: userId, date: new Date().toISOString(),
                                                    content: aiRes.content, risk_level: aiRes.risk_level,
                                                    model_used: 'deepseek-ai/DeepSeek-V3', input_snapshot: data
                                                })
                                            }
                                            Toast.clear(); Toast.show({ content: '分析已更新', icon: 'success' })
                                            queryClient.invalidateQueries({ queryKey: ['ai_summaries'] })
                                        } catch (e: any) { Toast.clear(); Toast.show({ content: e.message || '生成失败', icon: 'fail' }) }
                                    }}
                                >
                                    立即生成
                                </Button>
                                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 8 }}>(调用 SiliconFlow DeepSeek-V3 模型)</div>
                            </div>
                        )
                    )}
                </Card>
                </>)}
            </div >
        </div >
    )
}

export default ManagerDashboard
