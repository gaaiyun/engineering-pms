import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  IoBriefcaseOutline,
  IoCheckmarkCircleOutline,
  IoNotificationsOutline,
  IoSearchOutline,
} from 'react-icons/io5'
import { pb } from '../../lib/pocketbase'
import {
  escapePocketBaseFilterValue,
  normalizeGlobalSearchQuery,
  type GlobalSearchResult,
} from '../../lib/globalSearch'

type SearchRecord = {
  id: string
  name?: string
  code?: string
  stage_name?: string
  title?: string
  content?: string
  project?: string
  link_id?: string
  link_type?: string
  type?: string
  expand?: { project?: { name?: string } }
}

const KIND_LABELS = {
  task: '任务',
  project: '项目',
  notification: '通知',
} as const

function resultIcon(kind: GlobalSearchResult['kind']) {
  if (kind === 'project') return <IoBriefcaseOutline size={18} />
  if (kind === 'notification') return <IoNotificationsOutline size={18} />
  return <IoCheckmarkCircleOutline size={18} />
}

function notificationPath(record: SearchRecord) {
  if (!record.link_id) return '/notifications'
  if (record.link_type === 'project') return `/project/${record.link_id}/timeline`
  if (record.link_type === 'handoff' || record.type?.startsWith('handoff')) return '/review-center?tab=handoff'
  return `/task/${record.link_id}`
}

async function searchAll(query: string): Promise<GlobalSearchResult[]> {
  const escaped = escapePocketBaseFilterValue(query)
  const userId = pb.authStore.model?.id || ''
  const [tasks, projects, notifications] = await Promise.allSettled([
    pb.collection('tasks').getList<SearchRecord>(1, 6, {
      filter: `stage_name ~ "${escaped}"`,
      sort: '-updated',
      expand: 'project',
    }),
    pb.collection('projects').getList<SearchRecord>(1, 6, {
      filter: `(name ~ "${escaped}" || code ~ "${escaped}")`,
      sort: '-updated',
    }),
    pb.collection('notifications').getList<SearchRecord>(1, 6, {
      filter: `user = "${userId}" && (title ~ "${escaped}" || content ~ "${escaped}")`,
      sort: '-created',
    }),
  ])

  const results: GlobalSearchResult[] = []
  if (tasks.status === 'fulfilled') {
    results.push(...tasks.value.items.map(record => ({
      id: record.id,
      kind: 'task' as const,
      title: record.stage_name || '未命名任务',
      subtitle: record.expand?.project?.name,
      path: `/task/${record.id}`,
    })))
  }
  if (projects.status === 'fulfilled') {
    results.push(...projects.value.items.map(record => ({
      id: record.id,
      kind: 'project' as const,
      title: record.name || '未命名项目',
      subtitle: record.code,
      path: `/project/${record.id}/timeline`,
    })))
  }
  if (notifications.status === 'fulfilled') {
    results.push(...notifications.value.items.map(record => ({
      id: record.id,
      kind: 'notification' as const,
      title: record.title || '通知',
      subtitle: record.content,
      path: notificationPath(record),
    })))
  }
  return results
}

export function GlobalSearch() {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState('')
  const [debouncedValue, setDebouncedValue] = useState('')
  const [open, setOpen] = useState(false)
  const query = useMemo(() => normalizeGlobalSearchQuery(debouncedValue), [debouncedValue])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), 220)
    return () => window.clearTimeout(timer)
  }, [value])

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['global-search', pb.authStore.model?.id, query],
    queryFn: () => searchAll(query),
    enabled: open && pb.authStore.isValid && query.length >= 2,
    staleTime: 20_000,
  })

  const choose = (result: GlobalSearchResult) => {
    setOpen(false)
    setValue('')
    navigate(result.path)
  }

  return (
    <div ref={containerRef} style={{ flex: '0 1 520px', position: 'relative' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: open ? '#fff' : '#f1f5f9',
        border: open ? '1px solid #93c5fd' : '1px solid transparent',
        borderRadius: 9,
        color: '#64748b',
        boxShadow: open ? '0 0 0 3px rgba(59,130,246,.12)' : 'none',
      }}>
        <IoSearchOutline size={18} aria-hidden />
        <input
          aria-label="全局搜索"
          value={value}
          onFocus={() => setOpen(true)}
          onChange={event => { setValue(event.target.value); setOpen(true) }}
          onKeyDown={event => {
            if (event.key === 'Escape') setOpen(false)
            if (event.key === 'Enter' && results[0]) choose(results[0])
          }}
          placeholder="搜索任务、项目、通知"
          style={{
            width: '100%',
            border: 0,
            outline: 0,
            background: 'transparent',
            color: '#0f172a',
            fontSize: 13,
          }}
        />
      </div>

      {open && (
        <div role="listbox" aria-label="搜索结果" style={{
          position: 'absolute',
          top: 44,
          left: 0,
          right: 0,
          zIndex: 200,
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          boxShadow: '0 18px 40px rgba(15,23,42,.16)',
          overflow: 'hidden',
          maxHeight: 420,
          overflowY: 'auto',
        }}>
          {query.length < 2 ? (
            <div style={{ padding: 18, color: '#94a3b8', fontSize: 13 }}>输入至少 2 个字符开始搜索</div>
          ) : isFetching ? (
            <div style={{ padding: 18, color: '#64748b', fontSize: 13 }}>正在搜索…</div>
          ) : results.length === 0 ? (
            <div style={{ padding: 18, color: '#94a3b8', fontSize: 13 }}>没有找到匹配内容</div>
          ) : results.map(result => (
            <button
              key={`${result.kind}-${result.id}`}
              type="button"
              role="option"
              onClick={() => choose(result)}
              style={{
                width: '100%',
                display: 'grid',
                gridTemplateColumns: '24px minmax(0, 1fr) auto',
                alignItems: 'center',
                gap: 10,
                padding: '11px 14px',
                border: 0,
                borderBottom: '1px solid #f1f5f9',
                background: '#fff',
                color: '#334155',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <span style={{ color: '#2563eb', display: 'flex' }}>{resultIcon(result.kind)}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.title}</span>
                {result.subtitle && <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.subtitle}</span>}
              </span>
              <span style={{ fontSize: 10, color: '#64748b', background: '#f1f5f9', padding: '3px 6px', borderRadius: 5 }}>{KIND_LABELS[result.kind]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
