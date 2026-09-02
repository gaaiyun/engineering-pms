import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.js'

const valid = {
  MCP_BEARER_TOKEN: 'a'.repeat(40),
  PB_BASE_URL: 'https://example.invalid/pb',
  PB_SERVICE_USERNAME: 'agent_service',
  PB_SERVICE_PASSWORD: 'b'.repeat(40),
}

describe('MCP config', () => {
  it('loads safe defaults and explicit secrets', () => {
    expect(loadConfig(valid)).toMatchObject({
      host: '127.0.0.1', port: 3100, bearerToken: valid.MCP_BEARER_TOKEN,
      pocketBaseUrl: valid.PB_BASE_URL, serviceUsername: valid.PB_SERVICE_USERNAME,
      servicePassword: valid.PB_SERVICE_PASSWORD,
    })
  })

  it('rejects missing or short credentials', () => {
    expect(() => loadConfig({ ...valid, MCP_BEARER_TOKEN: 'short' })).toThrow(/BEARER_TOKEN/)
    expect(() => loadConfig({ ...valid, PB_SERVICE_PASSWORD: 'short' })).toThrow(/凭据/)
    expect(() => loadConfig({ ...valid, PB_BASE_URL: 'not-a-url' })).toThrow(/PB_BASE_URL/)
  })

  it('rejects invalid ports', () => {
    expect(() => loadConfig({ ...valid, MCP_PORT: '70000' })).toThrow(/MCP_PORT/)
  })
})
