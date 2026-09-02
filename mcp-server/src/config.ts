export type Config = {
  host: string
  port: number
  bearerToken: string
  pocketBaseUrl: string
  serviceUsername: string
  servicePassword: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const host = env.MCP_HOST?.trim() || '127.0.0.1'
  const port = Number(env.MCP_PORT || 3100)
  const bearerToken = env.MCP_BEARER_TOKEN?.trim() || ''
  const pocketBaseUrl = (env.PB_BASE_URL?.trim() || '').replace(/\/+$/, '')
  const serviceUsername = env.PB_SERVICE_USERNAME?.trim() || ''
  const servicePassword = env.PB_SERVICE_PASSWORD || ''

  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('MCP_PORT 必须是有效端口')
  if (bearerToken.length < 32) throw new Error('MCP_BEARER_TOKEN 至少需要 32 个字符')
  if (!/^https?:\/\//.test(pocketBaseUrl)) throw new Error('PB_BASE_URL 必须是完整 http(s) 地址')
  if (!serviceUsername || servicePassword.length < 32) throw new Error('PocketBase 服务账号凭据不完整')

  return { host, port, bearerToken, pocketBaseUrl, serviceUsername, servicePassword }
}
