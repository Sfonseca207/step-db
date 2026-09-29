import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { Hono } from 'hono'
import { requireToken, type AuthVars } from '../middleware/auth.ts'
import { createMcpServer } from './server.ts'

const methodNotAllowed = () =>
  new Response(
    JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Método no permitido (servidor MCP sin sesión)' }, id: null }),
    { status: 405, headers: { 'content-type': 'application/json', allow: 'POST' } },
  )

/** `/mcp`: Streamable HTTP sin sesión; un servidor MCP por petición, autenticado con token Bearer. */
export const mcpRoutes = new Hono<AuthVars>()
  .use('*', requireToken)
  .post('/', async (c) => {
    const server = createMcpServer(c.get('userId'))
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await server.connect(transport)
    try {
      return await transport.handleRequest(c.req.raw)
    } finally {
      void server.close()
    }
  })
  .get('/', methodNotAllowed)
  .delete('/', methodNotAllowed)
