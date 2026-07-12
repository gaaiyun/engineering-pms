import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('./pocketbase', () => ({
  PB_URL: 'https://pms.example.com/pb',
  pb: {
    authStore: { token: 'record-token', model: { id: 'manager-1', role: 'manager' } },
  },
}))

vi.mock('./api', () => ({
  TaskStatusEnum: {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    BLOCKED: 'blocked',
    COMPLETED: 'completed',
    OVERDUE: 'overdue',
  },
}))

import { generateAIReport } from './ai-service'

describe('AI 服务安全边界', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('代理失败时不使用旧 API key 直连上游', async () => {
    fetchMock.mockRejectedValueOnce(new Error('proxy unavailable'))

    await expect(generateAIReport({ overall_risk: 'low' }, 'legacy-browser-secret'))
      .rejects.toThrow('proxy unavailable')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://pms.example.com/pb/api/custom/llm-proxy')
    expect(JSON.stringify(fetchMock.mock.calls[0])).not.toContain('legacy-browser-secret')
    expect(JSON.stringify(fetchMock.mock.calls[0])).not.toContain('api.siliconflow.cn')
  })
})
