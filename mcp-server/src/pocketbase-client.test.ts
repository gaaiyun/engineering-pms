import { describe, expect, it, vi } from 'vitest'
import { PocketBaseAgentClient } from './pocketbase-client.js'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('PocketBaseAgentClient', () => {
  it('authenticates once and sends the service token to query endpoints', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, { token: 'service-token', record: { id: 'service00000001' } }))
      .mockResolvedValueOnce(jsonResponse(200, { items: [], page: 1 })) as unknown as typeof fetch
    const client = new PocketBaseAgentClient('https://example.invalid/pb', 'agent_example', 'x'.repeat(64), fetcher)

    await expect(client.query('projects', { page: 1 })).resolves.toEqual({ items: [], page: 1 })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenNthCalledWith(2, 'https://example.invalid/pb/api/custom/agent/v1/query', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'service-token' }),
      body: JSON.stringify({ page: 1, query: 'projects' }),
    }))
  })

  it('refreshes authentication once after a 401 response', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, { token: 'token-one', record: { id: 'service00000001' } }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'TOKEN_EXPIRED', message: 'expired' } }))
      .mockResolvedValueOnce(jsonResponse(200, { token: 'token-two', record: { id: 'service00000001' } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { total_tasks: 0 } })) as unknown as typeof fetch
    const client = new PocketBaseAgentClient('https://example.invalid/pb', 'agent_example', 'x'.repeat(64), fetcher)

    await expect(client.query('management_summary', {})).resolves.toEqual({ data: { total_tasks: 0 } })
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(fetcher).toHaveBeenNthCalledWith(2, expect.any(String), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'token-one' }) }))
    expect(fetcher).toHaveBeenNthCalledWith(4, expect.any(String), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'token-two' }) }))
  })

  it('preserves the structured status and code returned by the Agent API', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, { token: 'service-token', record: { id: 'service00000001' } }))
      .mockResolvedValueOnce(jsonResponse(403, { error: { code: 'PROJECT_DENIED', message: '项目超出服务账号范围' } })) as unknown as typeof fetch
    const client = new PocketBaseAgentClient('https://example.invalid/pb', 'agent_example', 'x'.repeat(64), fetcher)

    await expect(client.query('tasks', {})).rejects.toMatchObject({
      status: 403,
      code: 'PROJECT_DENIED',
      message: '项目超出服务账号范围',
    })
  })

  it('returns a generic error without exposing authentication response details', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(401, { message: 'internal authentication detail' })) as unknown as typeof fetch
    const client = new PocketBaseAgentClient('https://example.invalid/pb', 'agent_example', 'x'.repeat(64), fetcher)

    await expect(client.query('projects', {})).rejects.toMatchObject({
      status: 401,
      code: 'SERVICE_AUTH_FAILED',
      message: '服务账号认证失败',
    })
  })
})
