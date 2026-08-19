import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'
import { PocketBaseAgentClient } from './pocketbase-client.js'
import { toolResult, type OutputFormat } from './format.js'

const format = z.enum(['json', 'markdown']).default('markdown')
const page = z.number().int().min(1).default(1)
const perPage = z.number().int().min(1).max(100).default(20)
const id = z.string().regex(/^[a-z0-9]{15}$/)
const requestId = z.string().regex(/^[A-Za-z0-9._:-]{8,120}$/)
const idempotencyKey = z.string().regex(/^[A-Za-z0-9._:-]{8,120}$/)

function output(data: unknown, selected: OutputFormat) {
  return toolResult((data && typeof data === 'object' ? data : { data }) as Record<string, unknown>, selected)
}

export function createServer(client: PocketBaseAgentClient) {
  const server = new McpServer({ name: 'engineering-pms-mcp-server', version: '3.06' })

  server.registerTool('engineering_pms_get_management_summary', {
    description: '获取当前项目范围内的管理摘要，包括逾期、卡点、待审批和人员负荷。',
    inputSchema: { format },
  }, async ({ format }) => output(await client.query('management_summary', {}), format))

  server.registerTool('engineering_pms_daily_briefing', {
    description: '生成项目管理日报数据，包含逾期、三日内到期、卡点、待审批、未分配和人员负荷。',
    inputSchema: { format },
  }, async ({ format }) => output(await client.query('daily_briefing', {}), format))

  const registerList = (name: string, description: string, query: string, withProject = false) => {
    server.registerTool(name, {
      description,
      inputSchema: withProject ? { page, per_page: perPage, project_id: id.optional(), format } : { page, per_page: perPage, format },
    }, async (args: Record<string, unknown> & { format: OutputFormat }) => output(await client.query(query, args), args.format))
  }
  registerList('engineering_pms_list_people', '分页查询启用中的员工及其角色、部门。', 'people')
  registerList('engineering_pms_list_projects', '分页查询服务账号有权访问的项目。', 'projects')
  registerList('engineering_pms_list_tasks', '分页查询任务，可按项目筛选。', 'tasks', true)
  registerList('engineering_pms_list_handoffs', '分页查询交接记录。', 'handoffs')
  registerList('engineering_pms_list_changes', '分页查询近期业务变化与 Agent 审计记录。', 'changes')

  server.registerTool('engineering_pms_create_project', {
    description: '创建项目。写操作必须提供调用方生成的请求 ID 和幂等键。',
    inputSchema: {
      name: z.string().min(1).max(160), description: z.string().max(4000).default(''), manager_id: id,
      members: z.array(id).max(100).default([]), start_date: z.string().optional(), deadline: z.string().optional(),
      request_id: requestId, idempotency_key: idempotencyKey, format,
    },
  }, async ({ request_id, idempotency_key, format, ...payload }) => output(await client.execute('project_create', { request_id, idempotency_key, payload }), format))

  server.registerTool('engineering_pms_update_project', {
    description: '修改项目名称、说明或日期；归档请使用专用预览工具。',
    inputSchema: {
      project_id: id, name: z.string().min(1).max(160).optional(), description: z.string().max(4000).optional(),
      start_date: z.string().optional(), deadline: z.string().optional(), request_id: requestId, idempotency_key: idempotencyKey, format,
    },
  }, async ({ request_id, idempotency_key, format, ...payload }) => output(await client.execute('project_update', { request_id, idempotency_key, payload }), format))

  server.registerTool('engineering_pms_create_task', {
    description: '创建项目任务。',
    inputSchema: {
      project_id: id, stage_name: z.string().min(1).max(200), description: z.string().max(4000).default(''),
      assignees: z.array(id).min(1).max(30), deadline: z.string(), priority: z.enum(['low', 'normal', 'high']).default('normal'),
      request_id: requestId, idempotency_key: idempotencyKey, format,
    },
  }, async ({ request_id, idempotency_key, format, ...payload }) => output(await client.execute('task_create', { request_id, idempotency_key, payload }), format))

  server.registerTool('engineering_pms_update_task', {
    description: '修改任务的标题、说明、截止日期或优先级；状态变化请使用专用工具。',
    inputSchema: {
      task_id: id, stage_name: z.string().min(1).max(200).optional(), description: z.string().max(4000).optional(),
      deadline: z.string().optional(), priority: z.enum(['low', 'normal', 'high']).optional(),
      request_id: requestId, idempotency_key: idempotencyKey, format,
    },
  }, async ({ request_id, idempotency_key, format, ...payload }) => output(await client.execute('task_update', { request_id, idempotency_key, payload }), format))

  server.registerTool('engineering_pms_complete_task', {
    description: '完成任务并提交下一步交接提案。',
    inputSchema: {
      task_id: id, proposed_title: z.string().min(1).max(200), proposed_description: z.string().max(4000).default(''),
      proposed_assignees: z.array(id).min(1).max(30), proposed_due_date: z.string(),
      request_id: requestId, idempotency_key: idempotencyKey, format,
    },
  }, async ({ request_id, idempotency_key, format, ...payload }) => output(await client.execute('task_complete', { request_id, idempotency_key, payload }), format))

  server.registerTool('engineering_pms_block_task', {
    description: '上报任务卡点。',
    inputSchema: {
      task_id: id, reason_type: z.string().max(60).default('other'), reason_detail: z.string().min(1).max(4000),
      need_help_from: z.array(id).max(30).default([]), expected_resolve: z.string().max(100).default(''), rollback_to_task_id: id.optional(),
      request_id: requestId, idempotency_key: idempotencyKey, format,
    },
  }, async ({ request_id, idempotency_key, format, ...payload }) => output(await client.execute('task_block', { request_id, idempotency_key, payload }), format))

  server.registerTool('engineering_pms_unblock_task', {
    description: '解除任务卡点并恢复为进行中或已完成。',
    inputSchema: { task_id: id, status: z.enum(['in_progress', 'completed']), request_id: requestId, idempotency_key: idempotencyKey, format },
  }, async ({ request_id, idempotency_key, format, ...payload }) => output(await client.execute('task_unblock', { request_id, idempotency_key, payload }), format))

  server.registerTool('engineering_pms_add_comment', {
    description: '给任务添加评论。',
    inputSchema: { task_id: id, content: z.string().min(1).max(4000), request_id: requestId, idempotency_key: idempotencyKey, format },
  }, async ({ request_id, idempotency_key, format, ...payload }) => output(await client.execute('comment_create', { request_id, idempotency_key, payload }), format))

  const registerPreview = (name: string, description: string, action: string, shape: Record<string, z.ZodType>) => {
    server.registerTool(name, { description, inputSchema: { ...shape, request_id: requestId, idempotency_key: idempotencyKey, format } }, async (args) => {
      const { request_id, idempotency_key, format, ...payload } = args as Record<string, unknown> & { request_id: string; idempotency_key: string; format: OutputFormat }
      return output(await client.preview(action, { request_id, idempotency_key, payload }), format)
    })
  }
  registerPreview('engineering_pms_preview_archive_project', '预览归档或取消归档项目；返回五分钟一次性确认码。', 'project_archive', { project_id: id, archived: z.boolean().default(true) })
  registerPreview('engineering_pms_preview_delete_task', '预览永久删除无引用任务；返回五分钟一次性确认码。', 'task_delete', { task_id: id })
  registerPreview('engineering_pms_preview_bulk_reassign', '预览批量改派任务；返回五分钟一次性确认码。', 'task_bulk_reassign', { project_id: id, task_ids: z.array(id).min(1).max(100), assignees: z.array(id).min(1).max(30) })
  registerPreview('engineering_pms_preview_handoff_decision', '预览批准或驳回交接；返回五分钟一次性确认码。', 'handoff_decide', { handoff_id: id, decision: z.enum(['approved', 'rejected']), review_note: z.string().max(2000).default('') })

  server.registerTool('engineering_pms_confirm_action', {
    description: '用预览阶段返回的五分钟一次性确认码执行高影响操作。',
    inputSchema: { operation_id: id, confirmation_code: z.string().length(8), format },
  }, async ({ operation_id, confirmation_code, format }) => output(await client.confirm(operation_id, confirmation_code), format))

  return server
}
