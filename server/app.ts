import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { pingDb } from './db/client.ts'

export function createApp() {
  const app = new Hono()

  app.get('/health', async (c) => {
    const ok = await pingDb()
    return c.json({ status: ok ? 'ok' : 'degraded', db: ok ? 'ok' : 'error' }, ok ? 200 : 503)
  })

  // UI compilada (npm run build) con fallback SPA.
  app.use('/*', serveStatic({ root: './dist' }))
  app.get('*', serveStatic({ path: './dist/index.html' }))

  return app
}
