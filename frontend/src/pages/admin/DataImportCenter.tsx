import React, { useState } from 'react'
import { NavBar, Tabs, TextArea, Button, Toast, ProgressBar, Tag } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { pb, getPocketBaseErrorMessage } from '../../lib/pocketbase'
import { createTaskWithSideEffects, invalidateNotificationQueries, notifyProjectMembers, type Task, type TaskStatus, useUsers, useProjects } from '../../lib/api'
import { IoCloudUploadOutline, IoCheckmarkCircle, IoCloseCircle, IoDocumentTextOutline } from 'react-icons/io5'

type ImportStatus = 'idle' | 'previewing' | 'importing' | 'done'

// ================== USER IMPORT ==================
interface UserRow {
  username: string
  name: string
  email: string
  password: string
  role: string
  department: string
}

const USER_TEMPLATE = `[
  { "username": "zhangsan", "name": "张三", "email": "zhangsan@example.com", "password": "12345678", "role": "employee", "department": "工程部" },
  { "username": "lisi", "name": "李四", "email": "lisi@example.com", "password": "12345678", "role": "manager", "department": "管理层" }
]`

function UserImportTab() {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<UserRow[]>([])
  const [status, setStatus] = useState<ImportStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<{ ok: number; fail: number; errors: string[] }>({ ok: 0, fail: 0, errors: [] })

  const handleParse = () => {
    try {
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed) || parsed.length === 0) {
        Toast.show({ icon: 'fail', content: '请输入 JSON 数组' }); return
      }
      const validated = parsed.map((r: any, i: number) => ({
        username: r.username || `user_${i + 1}`,
        name: r.name || '',
        email: r.email || '',
        password: r.password || '12345678',
        role: r.role || 'employee',
        department: r.department || '',
      }))
      setRows(validated)
      setStatus('previewing')
    } catch {
      Toast.show({ icon: 'fail', content: 'JSON 格式有误，请检查' })
    }
  }

  const handleImport = async () => {
    setStatus('importing')
    setProgress(0)
    const ok: number[] = []
    const errors: string[] = []
    for (let i = 0; i < rows.length; i++) {
      try {
        await pb.collection('users').create({
          ...rows[i],
          passwordConfirm: rows[i].password,
        })
        ok.push(i)
      } catch (e: any) {
        errors.push(`#${i + 1} ${rows[i].username}: ${e?.message || '创建失败'}`)
      }
      setProgress(Math.round(((i + 1) / rows.length) * 100))
    }
    setResults({ ok: ok.length, fail: errors.length, errors })
    setStatus('done')
  }

  const reset = () => { setText(''); setRows([]); setStatus('idle'); setProgress(0); setResults({ ok: 0, fail: 0, errors: [] }) }

  return (
    <div style={{ padding: '16px 0' }}>
      {status === 'idle' && (
        <>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
            粘贴 JSON 数组，每个对象包含 username, name, email, password, role, department
          </div>
          <TextArea
            value={text}
            onChange={setText}
            placeholder={USER_TEMPLATE}
            rows={8}
            style={{ '--font-size': '13px', background: '#f8fafc', borderRadius: 12, padding: 12, border: '1px solid #e2e8f0' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button size="small" onClick={() => setText(USER_TEMPLATE)} style={{ borderRadius: 8 }}>填入模板</Button>
            <Button color="primary" size="small" onClick={handleParse} disabled={!text.trim()} style={{ borderRadius: 8 }}>
              解析预览
            </Button>
          </div>
        </>
      )}
      {status === 'previewing' && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#0f172a' }}>
            预览：{rows.length} 个用户
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', position: 'sticky', top: 0 }}>
                  {['#', '用户名', '姓名', '邮箱', '角色', '部门'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 10px', color: '#94a3b8' }}>{i + 1}</td>
                    <td style={{ padding: '6px 10px' }}>{r.username}</td>
                    <td style={{ padding: '6px 10px' }}>{r.name}</td>
                    <td style={{ padding: '6px 10px', color: '#64748b' }}>{r.email}</td>
                    <td style={{ padding: '6px 10px' }}>
                      <Tag color={r.role === 'admin' ? 'danger' : r.role === 'manager' ? 'warning' : 'default'} style={{ fontSize: 10 }}>{r.role}</Tag>
                    </td>
                    <td style={{ padding: '6px 10px', color: '#64748b' }}>{r.department}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Button size="small" onClick={reset} style={{ borderRadius: 8 }}>返回修改</Button>
            <Button color="primary" size="small" onClick={handleImport} style={{ borderRadius: 8 }}>
              <IoCloudUploadOutline size={16} style={{ marginRight: 4 }} /> 确认导入 {rows.length} 个用户
            </Button>
          </div>
        </>
      )}
      {status === 'importing' && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: '#0f172a' }}>导入中...</div>
          <ProgressBar percent={progress} style={{ '--track-width': '8px', marginBottom: 8 }} />
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{progress}%</div>
        </div>
      )}
      {status === 'done' && <ImportResult results={results} onReset={reset} />}
    </div>
  )
}

// ================== PROJECT IMPORT ==================
interface ProjectRow {
  name: string
  code: string
  status: string
  managerName: string
  managerId: string
  memberNames: string[]
  memberIds: string[]
}

const PROJECT_TEMPLATE = `[
  { "name": "凤凰山大桥工程", "code": "FHS-2026", "status": "active", "manager": "王经理", "members": ["张工长", "赵工长", "李工长"] }
]`

function ProjectImportTab() {
  const { data: users = [] } = useUsers()
  const [text, setText] = useState('')
  const [rows, setRows] = useState<ProjectRow[]>([])
  const [status, setStatus] = useState<ImportStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<{ ok: number; fail: number; errors: string[] }>({ ok: 0, fail: 0, errors: [] })

  const resolveUser = (nameOrUsername: string) =>
    users.find(u => u.name === nameOrUsername || u.username === nameOrUsername)

  const handleParse = () => {
    try {
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed) || parsed.length === 0) {
        Toast.show({ icon: 'fail', content: '请输入 JSON 数组' }); return
      }
      const validated: ProjectRow[] = parsed.map((r: any) => {
        const mgr = resolveUser(r.manager || '')
        const members = (r.members || []).map((m: string) => resolveUser(m)).filter(Boolean)
        return {
          name: r.name || '',
          code: r.code || '',
          status: r.status || 'active',
          managerName: r.manager || '',
          managerId: mgr?.id || '',
          memberNames: (r.members || []) as string[],
          memberIds: members.map((m: any) => m.id),
        }
      })
      setRows(validated)
      setStatus('previewing')
    } catch {
      Toast.show({ icon: 'fail', content: 'JSON 格式有误' })
    }
  }

  const handleImport = async () => {
    setStatus('importing')
    setProgress(0)
    const ok: number[] = []
    const errors: string[] = []
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (!r.managerId) {
        errors.push(`#${i + 1} ${r.name}: 找不到经理 "${r.managerName}"`); continue
      }
      try {
        await pb.collection('projects').create({
          name: r.name,
          code: r.code,
          status: r.status,
          manager: r.managerId,
          members: [r.managerId, ...r.memberIds],
          created_by: pb.authStore.model?.id,
        })
        ok.push(i)
      } catch (e: any) {
        errors.push(`#${i + 1} ${r.name}: ${e?.message || '创建失败'}`)
      }
      setProgress(Math.round(((i + 1) / rows.length) * 100))
    }
    setResults({ ok: ok.length, fail: errors.length, errors })
    setStatus('done')
  }

  const reset = () => { setText(''); setRows([]); setStatus('idle'); setProgress(0); setResults({ ok: 0, fail: 0, errors: [] }) }

  return (
    <div style={{ padding: '16px 0' }}>
      {status === 'idle' && (
        <>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
            粘贴 JSON 数组。manager / members 使用姓名，系统自动匹配用户。
          </div>
          <div style={{ fontSize: 12, color: '#f59e0b', marginBottom: 12 }}>
            提示：请先导入用户，再导入项目
          </div>
          <TextArea
            value={text}
            onChange={setText}
            placeholder={PROJECT_TEMPLATE}
            rows={8}
            style={{ '--font-size': '13px', background: '#f8fafc', borderRadius: 12, padding: 12, border: '1px solid #e2e8f0' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button size="small" onClick={() => setText(PROJECT_TEMPLATE)} style={{ borderRadius: 8 }}>填入模板</Button>
            <Button color="primary" size="small" onClick={handleParse} disabled={!text.trim()} style={{ borderRadius: 8 }}>解析预览</Button>
          </div>
        </>
      )}
      {status === 'previewing' && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#0f172a' }}>预览：{rows.length} 个项目</div>
          <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', position: 'sticky', top: 0 }}>
                  {['#', '项目名', '编码', '经理', '成员', '状态'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 10px', color: '#94a3b8' }}>{i + 1}</td>
                    <td style={{ padding: '6px 10px', fontWeight: 600 }}>{r.name}</td>
                    <td style={{ padding: '6px 10px', color: '#64748b' }}>{r.code}</td>
                    <td style={{ padding: '6px 10px' }}>
                      <span style={{ color: r.managerId ? '#10b981' : '#ef4444' }}>{r.managerName}</span>
                      {!r.managerId && <span style={{ fontSize: 10, color: '#ef4444' }}> (未找到)</span>}
                    </td>
                    <td style={{ padding: '6px 10px', fontSize: 11, color: '#64748b' }}>
                      {r.memberNames.map((m, j) => (
                        <Tag key={j} style={{ fontSize: 10, marginRight: 2 }} color={r.memberIds[j] ? 'success' : 'danger'}>{m}</Tag>
                      ))}
                    </td>
                    <td style={{ padding: '6px 10px' }}><Tag style={{ fontSize: 10 }}>{r.status}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Button size="small" onClick={reset} style={{ borderRadius: 8 }}>返回修改</Button>
            <Button color="primary" size="small" onClick={handleImport} style={{ borderRadius: 8 }}>
              <IoCloudUploadOutline size={16} style={{ marginRight: 4 }} /> 确认导入 {rows.length} 个项目
            </Button>
          </div>
        </>
      )}
      {status === 'importing' && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: '#0f172a' }}>导入中...</div>
          <ProgressBar percent={progress} style={{ '--track-width': '8px', marginBottom: 8 }} />
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{progress}%</div>
        </div>
      )}
      {status === 'done' && <ImportResult results={results} onReset={reset} />}
    </div>
  )
}

// ================== TASK IMPORT ==================
const TASK_TEMPLATE = `[
  { "stage_name": "基础开挖", "project": "凤凰山大桥工程", "assignees": ["张工长"], "deadline": "2026-04-01", "status": "pending", "priority": "high" },
  { "stage_name": "钢筋绑扎", "project": "凤凰山大桥工程", "assignees": ["赵工长"], "deadline": "2026-04-15", "status": "pending", "priority": "normal" }
]`

interface TaskRow {
  stage_name: string
  projectName: string
  projectId: string
  assigneeNames: string[]
  assigneeIds: string[]
  deadline: string
  status: TaskStatus
  priority: NonNullable<Task['priority']>
}

function TaskImportTab() {
  const queryClient = useQueryClient()
  const { data: users = [] } = useUsers()
  const { data: projects = [] } = useProjects()
  const [text, setText] = useState('')
  const [rows, setRows] = useState<TaskRow[]>([])
  const [status, setStatus] = useState<ImportStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<{ ok: number; fail: number; errors: string[] }>({ ok: 0, fail: 0, errors: [] })

  const resolveUser = (name: string) => users.find(u => u.name === name || u.username === name)
  const resolveProject = (name: string) => projects.find(p => p.name === name || p.code === name)

  const handleParse = () => {
    try {
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed) || parsed.length === 0) {
        Toast.show({ icon: 'fail', content: '请输入 JSON 数组' }); return
      }
      const validated: TaskRow[] = parsed.map((r: any) => {
        const proj = resolveProject(r.project || '')
        const assignees = (r.assignees || []).map((a: string) => resolveUser(a)).filter(Boolean)
        return {
          stage_name: r.stage_name || '',
          projectName: r.project || '',
          projectId: proj?.id || '',
          assigneeNames: (r.assignees || []) as string[],
          assigneeIds: assignees.map((a: any) => a.id),
          deadline: r.deadline || '',
          status: (r.status || 'pending') as TaskStatus,
          priority: (r.priority || 'normal') as NonNullable<Task['priority']>,
        }
      })
      setRows(validated)
      setStatus('previewing')
    } catch {
      Toast.show({ icon: 'fail', content: 'JSON 格式有误' })
    }
  }

  const handleImport = async () => {
    setStatus('importing')
    setProgress(0)
    const ok: number[] = []
    const errors: string[] = []
    const importedProjectCounts = new Map<string, number>()
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (!r.projectId) {
        errors.push(`#${i + 1} ${r.stage_name}: 找不到项目 "${r.projectName}"`); continue
      }
      try {
        await createTaskWithSideEffects({
          stage_name: r.stage_name,
          project: r.projectId,
          assignees: r.assigneeIds,
          deadline: r.deadline || undefined,
          status: r.status,
          priority: r.priority,
          sequence: i + 1,
        }, {
          notifyProjectAudience: false,
        })
        ok.push(i)
        importedProjectCounts.set(r.projectId, (importedProjectCounts.get(r.projectId) || 0) + 1)
      } catch (e: unknown) {
        errors.push(`#${i + 1} ${r.stage_name}: ${getPocketBaseErrorMessage(e, '创建失败')}`)
      }
      setProgress(Math.round(((i + 1) / rows.length) * 100))
    }

    const actorId = pb.authStore.model?.id
    const actorName = pb.authStore.model?.name || pb.authStore.model?.username || '管理员'
    for (const [projectId, count] of importedProjectCounts.entries()) {
      await notifyProjectMembers(
        projectId,
        '任务导入',
        `${actorName} 批量导入了 ${count} 个任务`,
        'task_update',
        actorId,
      )
    }

    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
    invalidateNotificationQueries(queryClient)
    setResults({ ok: ok.length, fail: errors.length, errors })
    setStatus('done')
  }

  const reset = () => { setText(''); setRows([]); setStatus('idle'); setProgress(0); setResults({ ok: 0, fail: 0, errors: [] }) }

  return (
    <div style={{ padding: '16px 0' }}>
      {status === 'idle' && (
        <>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
            粘贴 JSON 数组。project 用项目名称，assignees 用姓名数组。
          </div>
          <div style={{ fontSize: 12, color: '#f59e0b', marginBottom: 12 }}>
            提示：请先导入用户和项目，再导入任务
          </div>
          <TextArea
            value={text}
            onChange={setText}
            placeholder={TASK_TEMPLATE}
            rows={8}
            style={{ '--font-size': '13px', background: '#f8fafc', borderRadius: 12, padding: 12, border: '1px solid #e2e8f0' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button size="small" onClick={() => setText(TASK_TEMPLATE)} style={{ borderRadius: 8 }}>填入模板</Button>
            <Button color="primary" size="small" onClick={handleParse} disabled={!text.trim()} style={{ borderRadius: 8 }}>解析预览</Button>
          </div>
        </>
      )}
      {status === 'previewing' && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#0f172a' }}>预览：{rows.length} 个任务</div>
          <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', position: 'sticky', top: 0 }}>
                  {['#', '任务名', '项目', '负责人', '截止', '状态'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#475569' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 10px', color: '#94a3b8' }}>{i + 1}</td>
                    <td style={{ padding: '6px 10px', fontWeight: 600 }}>{r.stage_name}</td>
                    <td style={{ padding: '6px 10px' }}>
                      <span style={{ color: r.projectId ? '#10b981' : '#ef4444' }}>{r.projectName}</span>
                      {!r.projectId && <span style={{ fontSize: 10, color: '#ef4444' }}> !</span>}
                    </td>
                    <td style={{ padding: '6px 10px', fontSize: 11 }}>
                      {r.assigneeNames.map((a, j) => (
                        <Tag key={j} style={{ fontSize: 10, marginRight: 2 }} color={r.assigneeIds[j] ? 'success' : 'danger'}>{a}</Tag>
                      ))}
                    </td>
                    <td style={{ padding: '6px 10px', color: '#64748b' }}>{r.deadline}</td>
                    <td style={{ padding: '6px 10px' }}><Tag style={{ fontSize: 10 }}>{r.status}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Button size="small" onClick={reset} style={{ borderRadius: 8 }}>返回修改</Button>
            <Button color="primary" size="small" onClick={handleImport} style={{ borderRadius: 8 }}>
              <IoCloudUploadOutline size={16} style={{ marginRight: 4 }} /> 确认导入 {rows.length} 个任务
            </Button>
          </div>
        </>
      )}
      {status === 'importing' && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: '#0f172a' }}>导入中...</div>
          <ProgressBar percent={progress} style={{ '--track-width': '8px', marginBottom: 8 }} />
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{progress}%</div>
        </div>
      )}
      {status === 'done' && <ImportResult results={results} onReset={reset} />}
    </div>
  )
}

// ================== SHARED RESULT VIEW ==================
function ImportResult({ results, onReset }: { results: { ok: number; fail: number; errors: string[] }; onReset: () => void }) {
  return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>
        {results.fail === 0 ? <IoCheckmarkCircle color="#10b981" /> : <IoCloseCircle color="#f59e0b" />}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
        导入完成
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>{results.ok}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>成功</div>
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: results.fail > 0 ? '#ef4444' : '#94a3b8' }}>{results.fail}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>失败</div>
        </div>
      </div>
      {results.errors.length > 0 && (
        <div style={{ textAlign: 'left', background: '#fef2f2', borderRadius: 12, padding: 16, marginBottom: 16, maxHeight: 200, overflowY: 'auto' }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#dc2626', marginBottom: 8 }}>错误详情：</div>
          {results.errors.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: '#991b1b', padding: '2px 0' }}>{e}</div>
          ))}
        </div>
      )}
      <Button color="primary" onClick={onReset} style={{ borderRadius: 12 }}>继续导入</Button>
    </div>
  )
}

// ================== MAIN PAGE ==================
const DataImportCenter: React.FC = () => {
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100dvh', background: '#f8fafc' }}>
      <NavBar onBack={() => navigate(-1)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IoDocumentTextOutline size={18} />
          数据导入中心
        </div>
      </NavBar>

      <div style={{ padding: '0 16px 40px' }}>
        <div style={{ background: '#eff6ff', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1e40af', marginBottom: 4 }}>导入顺序</div>
          <div style={{ fontSize: 13, color: '#3b82f6' }}>
            1. 先导入用户 → 2. 再导入项目 → 3. 最后导入任务
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            因为项目引用用户、任务引用项目和用户，请按顺序操作。
          </div>
        </div>

        <Tabs style={{ '--title-font-size': '14px' }}>
          <Tabs.Tab title="导入用户" key="users">
            <UserImportTab />
          </Tabs.Tab>
          <Tabs.Tab title="导入项目" key="projects">
            <ProjectImportTab />
          </Tabs.Tab>
          <Tabs.Tab title="导入任务" key="tasks">
            <TaskImportTab />
          </Tabs.Tab>
        </Tabs>
      </div>
    </div>
  )
}

export default DataImportCenter
