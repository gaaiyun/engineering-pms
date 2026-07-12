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
 *   2) 从 app_settings 读 siliconflow_api_key
 *   3) 转发到 https://api.siliconflow.cn/v1/chat/completions
 *   4) 返回 LLM 响应 JSON
 *
 * 安全收益（对比直连 + localStorage）：
 *   - 浏览器侧不接触 API key
 *   - PB rule 收紧后只有 admin/manager 能读 app_settings.value
 *   - 中间人攻击仅能拿到 LLM 请求/响应（业务数据），拿不到 key 本身
 *   - 一处替换 key 全应用生效
 */
routerAdd('POST', '/api/custom/llm-proxy', (c) => {
  try {
    // 1. 鉴权
    const info = $apis.requestInfo(c)
    const authRecord = info.authRecord
    if (!authRecord) {
      return c.json(401, { error: 'unauthorized' })
    }

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

    const allowedModels = [
      'deepseek-ai/DeepSeek-V3',
      'deepseek-ai/DeepSeek-V3.2',
      'baidu/ERNIE-4.0-8K',
      'baidu/ERNIE-4.5-300B-A47B',
      'Qwen/Qwen3-235B-A22B-Instruct-2507',
      'zai-org/GLM-4.6',
    ]
    const model = body.model || 'deepseek-ai/DeepSeek-V3'
    if (allowedModels.indexOf(model) === -1) {
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
    if (maxTokens < 1 || maxTokens > 4000) {
      return c.json(400, { error: 'invalid max_tokens' })
    }
    const temperature = typeof body.temperature === 'number' ? body.temperature : 0.7
    if (temperature < 0 || temperature > 2) {
      return c.json(400, { error: 'invalid temperature' })
    }

    // 3. 从 app_settings 读 API key
    const dao = $app.dao()
    let keyRecord
    try {
      keyRecord = dao.findFirstRecordByFilter('app_settings', 'key = "siliconflow_api_key"')
    } catch (err) {
      return c.json(503, { error: 'API key not configured. Please contact admin to set it in app_settings.' })
    }
    if (!keyRecord) {
      return c.json(503, { error: 'API key not configured' })
    }
    const apiKey = keyRecord.getString('value')
    if (!apiKey || apiKey.length < 10) {
      return c.json(503, { error: 'API key empty or invalid' })
    }

    // 4. 转发到 SiliconFlow
    // PB hooks 用 $http.send 做 HTTP 客户端
    let upstream
    try {
      upstream = $http.send({
        url: 'https://api.siliconflow.cn/v1/chat/completions',
        method: 'POST',
        body: JSON.stringify({
          model: model,
          messages: body.messages,
          response_format: body.response_format,
          temperature: temperature,
          max_tokens: maxTokens,
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
}, $apis.requireRecordAuth())
