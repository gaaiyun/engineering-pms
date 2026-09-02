export class AgentApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

type AuthResponse = { token: string; record: { id: string; enabled?: boolean; expires_at?: string } }

export class PocketBaseAgentClient {
  private token = ''

  constructor(
    private readonly baseUrl: string,
    private readonly username: string,
    private readonly password: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async authenticate() {
    const response = await this.fetcher(`${this.baseUrl}/api/collections/service_accounts/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: this.username, password: this.password }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new AgentApiError(response.status, 'SERVICE_AUTH_FAILED', '服务账号认证失败')
    const data = await response.json() as AuthResponse
    if (!data.token) throw new AgentApiError(502, 'SERVICE_AUTH_INVALID', 'PocketBase 没有返回服务 token')
    this.token = data.token
  }

  private async request<T>(path: string, body: Record<string, unknown>, retry = true): Promise<T> {
    if (!this.token) await this.authenticate()
    const response = await this.fetcher(`${this.baseUrl}/api/custom/agent/v1/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: this.token },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })
    if (response.status === 401 && retry) {
      this.token = ''
      return this.request<T>(path, body, false)
    }
    const data = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string } }
    if (!response.ok) throw new AgentApiError(response.status, data.error?.code || 'AGENT_API_ERROR', data.error?.message || '业务接口调用失败')
    return data as T
  }

  query<T>(query: string, input: Record<string, unknown>) {
    return this.request<T>('query', { ...input, query })
  }

  execute<T>(action: string, input: Record<string, unknown>) {
    return this.request<T>('commands/execute', { ...input, action })
  }

  preview<T>(action: string, input: Record<string, unknown>) {
    return this.request<T>('commands/preview', { ...input, action })
  }

  confirm<T>(operationId: string, confirmationCode: string) {
    return this.request<T>('commands/confirm', { operation_id: operationId, confirmation_code: confirmationCode })
  }
}
