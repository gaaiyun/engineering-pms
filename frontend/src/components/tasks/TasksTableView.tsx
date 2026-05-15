import { useMemo, useState } from 'react'
import {
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Tag } from 'antd-mobile'
import { IoChevronUp, IoChevronDown } from 'react-icons/io5'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import type { Task } from '../../lib/api'
import { TasksBulkBar } from './TasksBulkBar'

interface TasksTableViewProps {
  tasks: Task[]
}

function statusTag(status: string) {
  switch (status) {
    case 'pending':
      return <Tag color="default">待办</Tag>
    case 'in_progress':
    case 'processing':
      return <Tag color="primary">进行中</Tag>
    case 'blocked':
      return <Tag color="warning">阻塞</Tag>
    case 'overdue':
      return <Tag color="danger">已逾期</Tag>
    case 'completed':
      return <Tag color="success">已完成</Tag>
    default:
      return <Tag color="default">{status}</Tag>
  }
}

function priorityTag(priority?: string) {
  if (!priority || priority === 'normal') return null
  if (priority === 'high') return <Tag color="danger" style={{ fontSize: 11 }}>高</Tag>
  if (priority === 'low') return <Tag color="default" style={{ fontSize: 11 }}>低</Tag>
  return null
}

export function TasksTableView({ tasks }: TasksTableViewProps) {
  const navigate = useNavigate()
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const columns = useMemo<ColumnDef<Task>[]>(() => [
    {
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="全选"
          checked={table.getIsAllRowsSelected()}
          ref={(el) => {
            if (el) el.indeterminate = table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()
          }}
          onChange={table.getToggleAllRowsSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`选择任务 ${row.original.stage_name}`}
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
      ),
      enableSorting: false,
      size: 40,
    },
    {
      id: 'sequence',
      accessorKey: 'sequence',
      header: '序号',
      cell: ({ row }) => (
        <span style={{ color: '#94a3b8', fontWeight: 600, fontSize: 13 }}>
          {row.original.sequence ?? '—'}
        </span>
      ),
      size: 60,
    },
    {
      id: 'title',
      accessorKey: 'stage_name',
      header: '任务标题',
      cell: ({ row }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, color: '#0f172a' }}>{row.original.stage_name}</span>
          {priorityTag(row.original.priority)}
          {row.original.is_milestone && (
            <Tag color="primary" style={{ fontSize: 11 }}>里程碑</Tag>
          )}
        </div>
      ),
    },
    {
      id: 'project',
      header: '项目',
      accessorFn: (row) => row.expand?.project?.name ?? '—',
      cell: ({ getValue }) => (
        <span style={{ color: '#475569', fontSize: 13 }}>{String(getValue())}</span>
      ),
    },
    {
      id: 'assignees',
      header: '负责人',
      accessorFn: (row) => (row.expand?.assignees ?? []).map((u) => u.name || u.username).join(', '),
      cell: ({ getValue }) => {
        const text = String(getValue())
        return text ? (
          <span style={{ color: '#475569', fontSize: 13 }}>{text}</span>
        ) : (
          <span style={{ color: '#cbd5e1', fontSize: 13 }}>未指派</span>
        )
      },
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => statusTag(row.original.status),
      size: 100,
    },
    {
      id: 'deadline',
      accessorKey: 'deadline',
      header: '截止日',
      cell: ({ row }) => {
        const d = row.original.deadline
        if (!d) return <span style={{ color: '#cbd5e1', fontSize: 13 }}>—</span>
        const isOverdue = row.original.status === 'overdue'
        return (
          <span style={{ color: isOverdue ? '#dc2626' : '#475569', fontSize: 13, fontWeight: isOverdue ? 600 : 400 }}>
            {dayjs(d).format('YYYY-MM-DD')}
          </span>
        )
      },
      size: 120,
    },
  ], [])

  const table = useReactTable({
    data: tasks,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: true,
  })

  const selectedTasks = table.getSelectedRowModel().rows.map((r) => r.original)

  function clearSelection() {
    setRowSelection({})
  }

  return (
    <div style={{ position: 'relative', padding: '16px 24px' }}>
      <div
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(0,0,0,.04)',
        }}
      >
        <table
          role="table"
          aria-label="任务表格"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 14,
          }}
        >
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontWeight: 600,
                      color: '#0f172a',
                      fontSize: 13,
                      cursor: header.column.getCanSort() ? 'pointer' : 'default',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                      width: header.getSize() === 150 ? undefined : header.getSize(),
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{ asc: <IoChevronUp size={12} />, desc: <IoChevronDown size={12} /> }[
                        header.column.getIsSorted() as string
                      ] ?? null}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}
                >
                  暂无任务
                </td>
              </tr>
            )}
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => navigate(`/task/${row.original.id}`)}
                data-selected={row.getIsSelected()}
                style={{
                  borderBottom: '1px solid #f1f5f9',
                  cursor: 'pointer',
                  background: row.getIsSelected() ? 'rgba(99, 102, 241, 0.06)' : '#fff',
                  transition: 'background 100ms ease',
                }}
                onMouseEnter={(e) => {
                  if (!row.getIsSelected()) (e.currentTarget as HTMLTableRowElement).style.background = '#f8fafc'
                }}
                onMouseLeave={(e) => {
                  if (!row.getIsSelected()) (e.currentTarget as HTMLTableRowElement).style.background = '#fff'
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedTasks.length > 0 && (
        <TasksBulkBar selectedTasks={selectedTasks} onClear={clearSelection} />
      )}
    </div>
  )
}
