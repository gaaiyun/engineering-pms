/// <reference path="../pb_data/types.d.ts" />
/**
 * C1 安全 — LLM 代理 endpoint
 *
 * 用法：前端 fetch POST /api/custom/llm-proxy
 *   Headers: Authorization: <user_or_admin_token>
 *   Body: { model, messages, response_format?, temperature?, max_tokens? }
 *
 * 服务端逻辑：
 *   1) 检查 auth.id 不为空 → 必须登录用户才能调
 *   2) 从 app_settings 读取 LLM 供应商配置和 API key
 *   3) 转发到管理员配置的 OpenAI-compatible /chat/completions
 *   4) 返回 LLM 响应 JSON
 *
 * 安全收益（对比直连 + localStorage）：
 *   - 浏览器侧不接触 API key
 *   - PB rule 收紧后只有 admin/manager 能读 app_settings.value
 *   - 中间人攻击仅能拿到 LLM 请求/响应（业务数据），拿不到 key 本身
 *   - 一处替换 key 全应用生效
 */

routerAdd('GET', '/api/custom/llm-config', (c) => {
  const info = $apis.requestInfo(c)
  const authRecord = info.authRecord
  if (!authRecord) return c.json(401, { error: 'unauthorized' })
  if (!authRecord.getBool('is_active')) return c.json(401, { error: 'account disabled' })
  if (authRecord.getBool('must_change_password')) return c.json(403, { error: 'password change required' })
  const role = authRecord.getString('role')
  if (role !== 'admin' && role !== 'manager') return c.json(403, { error: 'forbidden' })
  const dao = $app.dao()
  const getValue = (key) => {
    try {
      const record = dao.findFirstRecordByFilter('app_settings', 'key = {:key}', { key: key })
      return record ? record.getString('value') : ''
    } catch (_) {
      return ''
    }
  }
  let config = {
    provider: 'SiliconFlow',
    base_url: 'https://api.siliconflow.cn/v1',
    default_model: 'deepseek-ai/DeepSeek-V3',
  }
  try {
    const parsed = JSON.parse(getValue('llm_provider_config'))
    if (parsed && typeof parsed.provider === 'string' && typeof parsed.base_url === 'string' && typeof parsed.default_model === 'string') config = parsed
  } catch (_) {
    // 首次配置或旧记录无效时使用兼容默认值。
  }
  const apiKey = getValue('llm_api_key') || getValue('siliconflow_api_key')
  return c.json(200, {
    provider: config.provider,
    base_url: config.base_url,
    default_model: config.default_model,
    has_api_key: apiKey.length >= 10,
  })
}, $apis.requireRecordAuth('users'))

routerAdd('PUT', '/api/custom/llm-config', (c) => {
  const info = $apis.requestInfo(c)
  const authRecord = info.authRecord
  if (!authRecord) return c.json(401, { error: 'unauthorized' })
  if (!authRecord.getBool('is_active')) return c.json(401, { error: 'account disabled' })
  if (authRecord.getBool('must_change_password')) return c.json(403, { error: 'password change required' })
  if (authRecord.getString('role') !== 'admin') return c.json(403, { error: 'admin required' })

  const getValue = (dao, key) => {
    try {
      const record = dao.findFirstRecordByFilter('app_settings', 'key = {:key}', { key: key })
      return record ? record.getString('value') : ''
    } catch (_) {
      return ''
    }
  }
  const saveSetting = (dao, key, value, description, updatedBy) => {
    let record = null
    try {
      record = dao.findFirstRecordByFilter('app_settings', 'key = {:key}', { key: key })
    } catch (_) {
      // 首次配置时创建记录。
    }
    if (!record) {
      record = new Record(dao.findCollectionByNameOrId('app_settings'))
      record.set('key', key)
    }
    record.set('value', value)
    record.set('description', description)
    if (updatedBy) record.set('updated_by', updatedBy)
    dao.saveRecord(record)
  }
  const body = info.data || {}
  const provider = typeof body.provider === 'string' ? body.provider.trim() : ''
  const baseUrl = String(body.base_url || '').trim().replace(/\/+$/, '')
  const defaultModel = typeof body.default_model === 'string' ? body.default_model.trim() : ''
  const apiKey = typeof body.api_key === 'string' ? body.api_key.trim() : ''
  if (!provider || provider.length > 80) return c.json(400, { error: 'invalid provider' })
  if (!/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)?$/.test(baseUrl)) return c.json(400, { error: 'invalid base_url' })
  const host = baseUrl.slice(8).split('/')[0].split(':')[0].toLowerCase()
  const private172 = host.match(/^172\.(\d{1,3})\./)
  if (host === 'localhost' || host === '0.0.0.0' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31)) return c.json(400, { error: 'invalid base_url' })
  if (!defaultModel || defaultModel.length > 200 || !/^[A-Za-z0-9._:/-]+$/.test(defaultModel)) return c.json(400, { error: 'invalid default_model' })
  if (apiKey && (apiKey.length < 10 || apiKey.length > 5000)) return c.json(400, { error: 'invalid api_key' })

  const dao = $app.dao()
  if (!apiKey && (getValue(dao, 'llm_api_key') || getValue(dao, 'siliconflow_api_key')).length < 10) return c.json(400, { error: 'api_key required' })
  try {
    dao.runInTransaction((txDao) => {
      saveSetting(
        txDao,
        'llm_provider_config',
        JSON.stringify({ provider: provider, base_url: baseUrl, default_model: defaultModel }),
        'OpenAI-compatible LLM provider configuration',
        authRecord.id,
      )
      if (apiKey) saveSetting(txDao, 'llm_api_key', apiKey, 'Server-only LLM API key', authRecord.id)
    })
  } catch (_) {
    return c.json(500, { error: 'config save failed' })
  }
  return c.json(200, {
    provider: provider,
    base_url: baseUrl,
    default_model: defaultModel,
    has_api_key: true,
  })
}, $apis.requireRecordAuth('users'))
routerAdd('POST', '/api/custom/llm-proxy', (c) => {
  try {
    // 1. 鉴权
    const info = $apis.requestInfo(c)
    const authRecord = info.authRecord
    if (!authRecord) {
      return c.json(401, { error: 'unauthorized' })
    }
    if (!authRecord.getBool('is_active')) return c.json(401, { error: 'account disabled' })
    if (authRecord.getBool('must_change_password')) return c.json(403, { error: 'password change required' })

    const role = authRecord.getString('role')
    if (role !== 'admin' && role !== 'manager') {
      return c.json(403, { error: 'forbidden' })
    }

    // 2. 解析并限制请求体，避免普通请求放大为高额上游调用。
    let body
    try {
      body = $apis.requestInfo(c).data
    } catch (_) {
      return c.json(400, { error: 'invalid body' })
    }
    if (!body || !Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 40) {
      return c.json(400, { error: 'messages field required' })
    }

    const dao = $app.dao()
    const getValue = (key) => {
      try {
        const record = dao.findFirstRecordByFilter('app_settings', 'key = {:key}', { key: key })
        return record ? record.getString('value') : ''
      } catch (_) {
        return ''
      }
    }
    let config = {
      provider: 'SiliconFlow',
      base_url: 'https://api.siliconflow.cn/v1',
      default_model: 'deepseek-ai/DeepSeek-V3',
    }
    try {
      const parsed = JSON.parse(getValue('llm_provider_config'))
      if (parsed && typeof parsed.base_url === 'string' && typeof parsed.default_model === 'string') config = parsed
    } catch (_) {
      // 兼容旧 SiliconFlow 配置。
    }
    const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : config.default_model
    if (!model || model.length > 200 || !/^[A-Za-z0-9._:/-]+$/.test(model)) {
      return c.json(400, { error: 'unsupported model' })
    }

    let totalChars = 0
    for (let i = 0; i < body.messages.length; i++) {
      const message = body.messages[i]
      if (!message || (message.role !== 'system' && message.role !== 'user' && message.role !== 'assistant') || typeof message.content !== 'string') {
        return c.json(400, { error: 'invalid messages' })
      }
      totalChars += message.content.length
    }
    if (totalChars > 50000) {
      return c.json(413, { error: 'messages too large' })
    }

    const maxTokens = typeof body.max_tokens === 'number' ? Math.floor(body.max_tokens) : 2000
    if (maxTokens < 1 || maxTokens > 8192) {
      return c.json(400, { error: 'invalid max_tokens' })
    }
    const temperature = typeof body.temperature === 'number' ? body.temperature : 0.7
    if (temperature < 0 || temperature > 2) {
      return c.json(400, { error: 'invalid temperature' })
    }

    // 3. 从 app_settings 读 API key；兼容旧 siliconflow_api_key。
    const apiKey = getValue('llm_api_key') || getValue('siliconflow_api_key')
    if (!apiKey || apiKey.length < 10) {
      return c.json(503, { error: 'API key empty or invalid' })
    }

    // 4. 转发到 OpenAI-compatible provider
    // PB hooks 用 $http.send 做 HTTP 客户端
    let upstream
    try {
      upstream = $http.send({
        url: String(config.base_url || '').replace(/\/+$/, '') + '/chat/completions',
        method: 'POST',
        body: JSON.stringify({
          model: model,
          messages: body.messages,
          response_format: body.response_format,
          temperature: temperature,
          max_tokens: maxTokens,
          stream: false,
        }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
        },
        timeout: 60, // 60s LLM 调用可能较长
      })
    } catch (err) {
      console.log('[llm-proxy] upstream call failed')
      return c.json(502, { error: 'LLM upstream unavailable' })
    }

    if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
      console.log('[llm-proxy] upstream returned', upstream.statusCode)
      return c.json(502, { error: 'LLM upstream rejected request' })
    }

    // 5. 返回 LLM 响应（直通）
    try {
      return c.json(200, upstream.json || JSON.parse(upstream.raw))
    } catch {
      return c.json(200, { raw: upstream.raw })
    }
  } catch (e) {
    console.log('[llm-proxy] outer error')
    return c.json(500, { error: 'internal server error' })
  }
}, $apis.requireRecordAuth('users'))
