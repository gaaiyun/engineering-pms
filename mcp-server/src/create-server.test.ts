import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from './create-server.js'
import type { PocketBaseAgentClient } from './pocketbase-client.js'

const open: Array<{ close: () => Promise<void> }> = []

afterEach(async () => {
  await Promise.all(open.splice(0).map(item => item.close()))
})

async function connect(api: Partial<PocketBaseAgentClient>) {
  const server = createServer(api as PocketBaseAgentClient)
  const client = new Client({ name: 'people-tools-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  open.push(client, server)
  return client
}

describe('people management MCP tools', () => {
  it('publishes the four controlled personnel tools', async () => {
    const client = await connect({ query: vi.fn(), execute: vi.fn(), preview: vi.fn(), confirm: vi.fn() })
    const names = (await client.listTools()).tools.map(tool => tool.name)

    expect(names).toContain('engineering_pms_create_person')
    expect(names).toContain('engineering_pms_update_person')
    expect(names).toContain('engineering_pms_disable_person')
    expect(names).toContain('engineering_pms_preview_delete_person')
  })

  it('creates a non-admin person without accepting a caller supplied password', async () => {
    const execute = vi.fn().mockResolvedValue({ result: { id: 'person000000001', must_change_password: true } })
    const client = await connect({ query: vi.fn(), execute, preview: vi.fn(), confirm: vi.fn() })

    await client.callTool({ name: 'engineering_pms_create_person', arguments: {
      username: 'new_employee', name: '新员工', email: 'new@example.com', role: 'employee', department: '综合部',
      request_id: 'request.people.create.1', idempotency_key: 'idem.people.create.1', format: 'json',
    } })

    expect(execute).toHaveBeenCalledWith('person_create', expect.objectContaining({
      payload: expect.objectContaining({ username: 'new_employee', department: '综合部' }),
    }))
    const firstCall = execute.mock.calls[0]!
    expect(firstCall[1].payload).not.toHaveProperty('password')
    expect(firstCall[1].payload).not.toHaveProperty('initial_password')
  })

  it('maps reactivation to the guarded update action and deletion to preview', async () => {
    const execute = vi.fn().mockResolvedValue({ result: { id: 'person000000001', is_active: true } })
    const preview = vi.fn().mockResolvedValue({ operation_id: 'operation000001', confirmation_code: 'ABCDEFGH' })
    const client = await connect({ query: vi.fn(), execute, preview, confirm: vi.fn() })

    await client.callTool({ name: 'engineering_pms_update_person', arguments: {
      user_id: 'person000000001', name: '新姓名', reactivate: true,
      request_id: 'request.people.update.1', idempotency_key: 'idem.people.update.1', format: 'json',
    } })
    await client.callTool({ name: 'engineering_pms_preview_delete_person', arguments: {
      user_id: 'person000000001', request_id: 'request.people.delete.1', idempotency_key: 'idem.people.delete.1', format: 'json',
    } })

    expect(execute).toHaveBeenCalledWith('person_update', expect.objectContaining({ payload: expect.objectContaining({ is_active: true, name: '新姓名' }) }))
    expect(preview).toHaveBeenCalledWith('person_delete', expect.objectContaining({ payload: { user_id: 'person000000001' } }))
  })
})
