/**
 * 变更审计与复核中心
 * Tab: 全部 / 待复核 / 已阅读 / 已通过 / 交接审核
 * 卡片式布局，支持搜索、筛选、已阅/通过操作
 */
import React, { useState, useMemo, useEffect } from 'react'
import { NavBar, SearchBar, Tag, Empty, Toast, Dialog, TextArea, PullToRefresh, Tabs } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'
import {
  useAuditLogs, useUpdateAuditLogStatus,
  usePendingHandoffs, useApproveHandoff, useRejectHandoff,
  type Handoff, type User
} from '../lib/api'
import { pb } from '../lib/pocketbase'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'
import {
  IoCheckmarkCircle, IoEyeOutline,
  IoFunnelOutline, IoTimeOutline, IoPersonOutline,
  IoDocumentTextOutline, IoFolderOutline, IoCloseCircle
} from 'react-icons/io5'
import './ReviewCenter.css'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  update_task: { label: '任务修改', color: '#3b82f6' },
  create_task: { label: '创建任务', color: '#10b981' },
  mark_complete: { label: '任务完成', color: '#22c55e' },
  mark_blocked: { label: '卡点上报', color: '#ef4444' },
  unblock_task: { label: '卡点解除', color: '#06b6d4' },
  batch_edit_tasks: { label: '批量编辑', color: '#8b5cf6' },
  update_members: { label: '成员变更', color: '#f59e0b' },
  archive_project: { label: '项目归档', color: '#64748b' },
  delete_task: { label: '删除任务', color: '#dc2626' },
  delete_project: { label: '删除项目', color: '#dc2626' },
  create_project: { label: '创建项目', color: '#059669' },
  update_project: { label: '项目修改', color: '#0ea5e9' },
  unarchive_project: { label: '取消归档', color: '#64748b' },
  approve_handoff: { label: '交接通过', color: '#22c55e' },
  reject_handoff: { label: '交接驳回', color: '#ef4444' },
}

const ReviewCenter: React.FC = () => {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('all')
  const [searchText, setSearchText] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [filterAction, setFilterAction] = useState('')

  // 审计日志
  const statusFilter = activeTab === 'unread' ? 'unread' : activeTab === 'read' ? 'read' : activeTab === 'approved' ? 'approved' : undefined
  const { data: logs = [], isLoading: logsLoading, refetch: refetchLogs } = useAuditLogs({
    review_status: statusFilter,
    action_type: filterAction || undefined,
    search: searchText || undefined,
  })
  const updateStatus = useUpdateAuditLogStatus()

  // 交接审核（保留原功能）
  const { data: handoffs = [], isLoading: handoffsLoading, refetch: refetchHandoffs } = usePendingHandoffs()
  const approveHandoff = useApproveHandoff()
  const rejectHandoff = useRejectHandoff()
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  // SSE 实时订阅审计日志和交接记录
  useEffect(() => {
    const unsubs: (() => void)[] = []
    pb.collection('audit_logs').subscribe('*', () => { refetchLogs() }).then(() => unsubs.push(() => pb.collection('audit_logs').unsubscribe('*')))
    pb.collection('handoffs').subscribe('*', () => { refetchHandoffs() }).then(() => unsubs.push(() => pb.collection('handoffs').unsubscribe('*')))
    return () => { unsubs.forEach(fn => fn()) }
  }, [refetchLogs, refetchHandoffs])

  const displayLogs = useMemo(() => {
    if (activeTab === 'handoff') return []
    return logs
  }, [logs, activeTab])

  const handleMarkRead = async (id: string) => {
    try {
      await updateStatus.mutateAsync({ id, review_status: 'read' })
      Toast.show({ content: '已标记阅读', icon: 'success' })
    } catch (e: any) { Toast.show({ content: e?.message || '标记阅读失败', icon: 'fail' }) }
  }

  const handleMarkApproved = async (id: string) => {
    try {
      await updateStatus.mutateAsync({ id, review_status: 'approved' })
      Toast.show({ content: '已通过', icon: 'success' })
    } catch (e: any) { Toast.show({ content: e?.message || '审批失败', icon: 'fail' }) }
  }

  const handleApproveHandoff = (handoff: Handoff) => {
    Dialog.confirm({
      title: '确认通过',
      content: `确定通过「${handoff.proposed_title}」的交接？将自动创建新任务。`,
      onConfirm: async () => {
        try {
          await approveHandoff.mutateAsync({ id: handoff.id })
          Toast.show({ content: '审核通过', icon: 'success' })
        } catch (e: any) { Toast.show({ content: e?.message || '审核失败', icon: 'fail' }) }
      },
    })
  }

  const confirmReject = async () => {
    if (!rejectingId || !rejectNote.trim()) {
      Toast.show({ content: '请填写驳回原因', icon: 'fail' }); return
    }
    try {
      await rejectHandoff.mutateAsync({ id: rejectingId, reviewNote: rejectNote })
      Toast.show({ content: '已驳回', icon: 'success' })
      setRejectingId(null)
    } catch (e: any) { Toast.show({ content: e?.message || '驳回失败', icon: 'fail' }) }
  }

  const formatChange = (log: any) => {
    const before = log.before_data || {}
    const after = log.after_data || {}
    const parts: string[] = []
    if (after.status && before.status && after.status !== before.status) parts.push(`状态: ${before.status} → ${after.status}`)
    if (after.stage_name && before.stage_name && after.stage_name !== before.stage_name) parts.push(`名称: ${before.stage_name} → ${after.stage_name}`)
    if (after.assignees) parts.push('人员变更')
    if (after.deadline) parts.push('时间变更')
    if (after.count) parts.push(`${after.count} 个任务`)
    if (after.members) parts.push(`成员: ${after.members.length} 人`)
    if (after.handoff_id) parts.push('提交交接提案')
    if (log.note) parts.push(log.note)
    return parts.length > 0 ? parts.join(' | ') : log.action_type
  }

  const unreadCount = logs.filter((l: any) => !l.review_status || l.review_status === 'unread').length

  return (
    <div className="review-center">
      <NavBar onBack={() => navigate(-1)} right={
        <div onClick={() => setShowFilter(!showFilter)} style={{ padding: '4px 8px', cursor: 'pointer' }}>
          <IoFunnelOutline size={20} color={filterAction ? '#3b82f6' : '#64748b'} />
        </div>
      }>
        变更审计中心 {unreadCount > 0 && <Tag color="danger" style={{ marginLeft: 6, fontSize: 10 }}>{unreadCount}</Tag>}
      </NavBar>

      {/* 搜索栏 */}
      <div style={{ padding: '8px 16px', background: 'white', borderBottom: '1px solid #f1f5f9' }}>
        <SearchBar placeholder="搜索变更记录..." value={searchText} onChange={setSearchText}
          style={{ '--background': '#f8fafc', '--border-radius': '10px' }} />
      </div>

      {/* 筛选器 */}
      {showFilter && (
        <div style={{ padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Tag onClick={() => setFilterAction('')}
            style={{ background: !filterAction ? '#2563eb' : '#e2e8f0', color: !filterAction ? 'white' : '#475569', borderRadius: 8, padding: '4px 10px', fontSize: 11, border: 'none', cursor: 'pointer' }}>
            全部类型
          </Tag>
          {Object.entries(ACTION_LABELS).map(([key, { label }]) => (
            <Tag key={key} onClick={() => setFilterAction(filterAction === key ? '' : key)}
              style={{ background: filterAction === key ? '#2563eb' : '#e2e8f0', color: filterAction === key ? 'white' : '#475569', borderRadius: 8, padding: '4px 10px', fontSize: 11, border: 'none', cursor: 'pointer' }}>
              {label}
            </Tag>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs activeKey={activeTab} onChange={setActiveTab} style={{ '--title-font-size': '14px' }}>
        <Tabs.Tab title="全部" key="all" />
        <Tabs.Tab title={`待复核${unreadCount > 0 ? `(${unreadCount})` : ''}`} key="unread" />
        <Tabs.Tab title="已阅读" key="read" />
        <Tabs.Tab title="已通过" key="approved" />
        <Tabs.Tab title={`交接审核${handoffs.length > 0 ? `(${handoffs.length})` : ''}`} key="handoff" />
      </Tabs>

      <PullToRefresh onRefresh={async () => { await Promise.all([refetchLogs(), refetchHandoffs()]) }}>
        <div className="review-content">
          {/* 审计日志列表 */}
          {activeTab !== 'handoff' && (
            logsLoading ? (
              <div className="loading-state">加载中...</div>
            ) : displayLogs.length === 0 ? (
              <Empty style={{ padding: '48px 0' }} description="暂无记录" />
            ) : (
              <div className="audit-list">
                {displayLogs.map((log: any) => {
                  const actionInfo = ACTION_LABELS[log.action_type] || { label: log.action_type, color: '#94a3b8' }
                  const status = log.review_status || 'unread'
                  return (
                    <div key={log.id} className={`audit-card ${status}`}>
                      <div className="audit-card-header">
                        <div className="audit-type-badge" style={{ background: `${actionInfo.color}15`, color: actionInfo.color }}>
                          {actionInfo.label}
                        </div>
                        <span className="audit-time">
                          <IoTimeOutline size={12} /> {dayjs(log.created).fromNow()}
                        </span>
                      </div>

                      <div className="audit-card-body">
                        <div className="audit-meta-row">
                          <IoFolderOutline size={14} color="#64748b" />
                          <span className="audit-meta-label">项目</span>
                          <span className="audit-meta-value">{log.expand?.project?.name || '—'}</span>
                        </div>
                        <div className="audit-meta-row">
                          <IoPersonOutline size={14} color="#64748b" />
                          <span className="audit-meta-label">操作人</span>
                          <span className="audit-meta-value">{log.expand?.operator?.name || log.expand?.operator?.username || '—'}</span>
                        </div>
                        {log.expand?.task && (
                          <div className="audit-meta-row">
                            <IoDocumentTextOutline size={14} color="#64748b" />
                            <span className="audit-meta-label">任务</span>
                            <span className="audit-meta-value">{log.expand.task.stage_name}</span>
                          </div>
                        )}
                        <div className="audit-change-detail">
                          {formatChange(log)}
                        </div>
                      </div>

                      <div className="audit-card-footer">
                        {status === 'unread' && (
                          <>
                            <button className="audit-btn read" onClick={() => handleMarkRead(log.id)}>
                              <IoEyeOutline size={15} /> 已阅读
                            </button>
                            <button className="audit-btn approve" onClick={() => handleMarkApproved(log.id)}>
                              <IoCheckmarkCircle size={15} /> 通过
                            </button>
                          </>
                        )}
                        {status === 'read' && (
                          <button className="audit-btn approve" onClick={() => handleMarkApproved(log.id)}>
                            <IoCheckmarkCircle size={15} /> 通过
                          </button>
                        )}
                        {status === 'approved' && (
                          <span className="audit-status-done">已通过</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          )}

          {/* 交接审核列表 */}
          {activeTab === 'handoff' && (
            handoffsLoading ? (
              <div className="loading-state">加载中...</div>
            ) : handoffs.length === 0 ? (
              <Empty style={{ padding: '48px 0' }} description="暂无待审核的交接" />
            ) : (
              <div className="audit-list">
                {handoffs.map((h: Handoff) => (
                  <div key={h.id} className="audit-card unread">
                    <div className="audit-card-header">
                      <div className="audit-type-badge" style={{ background: '#fef3c715', color: '#f59e0b' }}>
                        交接审核
                      </div>
                      <Tag color="warning" style={{ fontSize: 11 }}>待审核</Tag>
                    </div>
                    <div className="audit-card-body">
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{h.proposed_title}</div>
                      {h.proposed_description && <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>{h.proposed_description}</div>}
                      <div className="audit-meta-row">
                        <IoPersonOutline size={14} color="#64748b" />
                        <span className="audit-meta-label">提交人</span>
                        <span className="audit-meta-value">{h.expand?.submitter?.name || '未知'}</span>
                      </div>
                      <div className="audit-meta-row">
                        <IoDocumentTextOutline size={14} color="#64748b" />
                        <span className="audit-meta-label">来源任务</span>
                        <span className="audit-meta-value">{h.expand?.from_task?.stage_name || '未知'}</span>
                      </div>
                      <div className="audit-meta-row">
                        <IoTimeOutline size={14} color="#64748b" />
                        <span className="audit-meta-label">建议截止</span>
                        <span className="audit-meta-value">{h.proposed_due_date ? dayjs(h.proposed_due_date).format('MM-DD') : '未设置'}</span>
                      </div>
                      <div className="audit-meta-row">
                        <IoPersonOutline size={14} color="#64748b" />
                        <span className="audit-meta-label">建议负责人</span>
                        <span className="audit-meta-value">{h.expand?.proposed_assignees?.map((u: User) => u.name).join(', ') || '待分配'}</span>
                      </div>
                    </div>
                    <div className="audit-card-footer">
                      <button className="audit-btn reject" onClick={() => { setRejectingId(h.id); setRejectNote('') }} disabled={rejectHandoff.isPending}>
                        <IoCloseCircle size={15} /> 驳回
                      </button>
                      <button className="audit-btn approve" onClick={() => handleApproveHandoff(h)} disabled={approveHandoff.isPending}>
                        <IoCheckmarkCircle size={15} /> 通过
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </PullToRefresh>

      {/* 驳回弹窗 */}
      <Dialog visible={!!rejectingId} title="驳回原因"
        content={<TextArea placeholder="请输入驳回原因（必填）" value={rejectNote} onChange={setRejectNote} rows={3} />}
        actions={[
          { key: 'cancel', text: '取消', onClick: () => setRejectingId(null) },
          { key: 'confirm', text: '确认驳回', danger: true, onClick: confirmReject },
        ]}
        onClose={() => setRejectingId(null)}
      />
    </div>
  )
}

export default ReviewCenter
