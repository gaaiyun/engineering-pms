import { pb, PB_URL } from './pocketbase'

export interface LlmConfig {
  provider: string
  base_url: string
  default_model: string
  has_api_key: boolean
}

export interface LlmConfigUpdate {
  provider: string
  base_url: string
  default_model: string
  api_key?: string
}

const configUrl = `${PB_URL.replace(/\/+$/, '')}/api/custom/llm-config`

async function readResponse(response: Response): Promise<LlmConfig> {
  let data: Record<string, unknown> = {}
  try {
    data = await response.json() as Record<string, unknown>
  } catch {
    // PocketBase 代理只应返回 JSON；保留统一错误信息，避免泄露上游正文。
  }

  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `LLM config request failed: HTTP ${response.status}`)
  }
  return data as unknown as LlmConfig
}

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: pb.authStore.token,
  }
}

export async function getLlmConfig(): Promise<LlmConfig> {
  const response = await fetch(configUrl, {
    method: 'GET',
    headers: authHeaders(),
  })
  return readResponse(response)
}

export async function updateLlmConfig(input: LlmConfigUpdate): Promise<LlmConfig> {
  const payload: LlmConfigUpdate = {
    provider: input.provider.trim(),
    base_url: input.base_url.trim(),
    default_model: input.default_model.trim(),
  }
  if (input.api_key?.trim()) payload.api_key = input.api_key.trim()

  const response = await fetch(configUrl, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
  return readResponse(response)
}
