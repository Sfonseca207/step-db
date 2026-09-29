import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { createNodeWebSocket } from '@hono/node-ws'
import { bodyLimit } from 'hono/body-limit'
import { compress } from 'hono/compress'
import { csrf } from 'hono/csrf'
import { auth, trustedOrigins } from './auth/better-auth.ts'
import { pingDb } from './db/client.ts'
import { HttpError } from './lib/errors.ts'
import { requireUser, type AuthVars } from './middleware/auth.ts'
import { mcpRoutes } from './mcp/routes.ts'
import { originGuard, securityHeaders } from './middleware/security.ts'
import { exportRoutes } from './modules/export/routes.ts'
import { fileRoutes } from './modules/files/routes.ts'
import { projectRoutes } from './modules/projects/routes.ts'
import { projectStepRoutes, stepRoutes } from './modules/steps/routes.ts'
import { tokenRoutes } from './modules/tokens/routes.ts'
import { mountWebSocket } from './realtime/ws.ts'

export function createApp() {
  const app = new Hono()
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message, ...(err.details ?? {}) } }, err.status)
    }
    console.error('[error]', c.req.method, c.req.path, err)
    return c.json({ error: { code: 'internal', message: 'Error interno del servidor' } }, 500)
  })
  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Ruta no encontrada' } }, 404))

  app.use('*', securityHeaders)
  app.use(
    '*',
    bodyLimit({
      maxSize: 2 * 1024 * 1024,
      onError: (c) => c.json({ error: { code: 'too_large', message: 'El cuerpo supera 2 MB' } }, 413),
    }),
  )

  app.get('/health', async (c) => {
    const ok = await pingDb()
    return c.json({ status: ok ? 'ok' : 'degraded', db: ok ? 'ok' : 'error' }, ok ? 200 : 503)
  })

  // Auth (Better Auth)
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))

  // API con cookie
  const api = new Hono<AuthVars>()
  api.use('*', csrf({ origin: trustedOrigins }))
  api.use('*', originGuard(trustedOrigins))
  api.use('*', requireUser)
  api.get('/me', (c) => c.json({ id: c.get('userId'), email: c.get('userEmail'), name: c.get('userName') }))
  api.route('/projects', projectRoutes)
  api.route('/projects', projectStepRoutes)
  api.route('/projects', exportRoutes)
  api.route('/steps', stepRoutes)
  api.route('/steps', fileRoutes)
  api.route('/tokens', tokenRoutes)
  app.route('/api', api)

  // MCP (token Bearer)
  app.route('/mcp', mcpRoutes)

  const apiNotFound = () => new Response(JSON.stringify({ error: { code: 'not_found', message: 'Ruta no encontrada' } }), {
    status: 404,
    headers: { 'content-type': 'application/json' },
  })
  app.all('/api/*', apiNotFound)

  mountWebSocket(app, upgradeWebSocket)

  // UI compilada (npm run build) con fallback SPA, comprimida. Los assets llevan hash en el
  // nombre, así que el navegador puede guardarlos indefinidamente.
  app.use('/assets/*', async (c, next) => {
    await next()
    if (c.res.ok) c.header('Cache-Control', 'public, max-age=31536000, immutable')
  })
  app.use('/*', compress())
  app.use('/*', serveStatic({ root: './dist' }))
  // El HTML siempre se revalida: es el que apunta a los assets de cada versión.
  app.get('*', async (c, next) => {
    await next()
    if (c.res.ok && c.res.headers.get('content-type')?.includes('text/html')) c.header('Cache-Control', 'no-cache')
  })
  app.get('*', serveStatic({ path: './dist/index.html' }))

  return { app, injectWebSocket }
}
