import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { loadConfig } from './config.js'
import { isAuthorizedBearer } from './bearer.js'
import { PocketBaseAgentClient } from './pocketbase-client.js'
import { createServer } from './create-server.js'
import type { Request, Response } from 'express'

const config = loadConfig()
const client = new PocketBaseAgentClient(config.pocketBaseUrl, config.serviceUsername, config.servicePassword)
const app = createMcpExpressApp({ host: config.host })

app.get('/healthz', (_req: Request, res: Response) => res.status(200).json({ status: 'ok', version: '3.06' }))

app.post('/mcp', async (req: Request, res: Response) => {
  if (!isAuthorizedBearer(req.headers.authorization, config.bearerToken)) {
    res.setHeader('WWW-Authenticate', 'Bearer')
    res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null })
    return
  }

  const server = createServer(client)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (error) {
    console.error('[mcp] request failed', error instanceof Error ? error.message : 'unknown error')
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null })
  } finally {
    await transport.close().catch(() => undefined)
    await server.close().catch(() => undefined)
  }
})

for (const method of ['get', 'delete'] as const) {
  app[method]('/mcp', (_req: Request, res: Response) => {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null })
  })
}

app.listen(config.port, config.host, (error?: Error) => {
  if (error) throw error
  console.log(`EngineeringPMS MCP 3.06 listening on http://${config.host}:${config.port}/mcp`)
})
