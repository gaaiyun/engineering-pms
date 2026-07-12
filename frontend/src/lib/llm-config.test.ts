import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('./pocketbase', () => ({
  PB_URL: 'https://pms.example.com/pb/',
  pb: {
    authStore: { token: 'admin-token' },
  },
}))

import { getLlmConfig, updateLlmConfig } from './llm-config'

describe('LLM 供应商配置服务', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('读取配置时使用登录令牌且不依赖浏览器保存密钥', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        provider: '火山方舟',
        base_url: 'https://ark.example.com/api/coding/v3',
        default_model: 'glm-5.2',
        has_api_key: true,
      }),
    })

    const config = await getLlmConfig()

    expect(config.default_model).toBe('glm-5.2')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://pms.example.com/pb/api/custom/llm-config',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'admin-token' }),
      }),
    )
  })

  it('更新配置时空密钥表示保留服务器现有密钥', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        provider: '火山方舟',
        base_url: 'https://ark.example.com/api/coding/v3',
        default_model: 'glm-5.2',
        has_api_key: true,
      }),
    })

    await updateLlmConfig({
      provider: '火山方舟',
      base_url: 'https://ark.example.com/api/coding/v3',
      default_model: 'glm-5.2',
      api_key: '',
    })

    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({
      provider: '火山方舟',
      base_url: 'https://ark.example.com/api/coding/v3',
      default_model: 'glm-5.2',
    })
  })

  it('错误响应只暴露服务器提供的安全错误信息', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid base_url' }),
    })

    await expect(getLlmConfig()).rejects.toThrow('invalid base_url')
  })
})
