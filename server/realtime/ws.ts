import type { Hono } from 'hono'
import type { UpgradeWebSocket } from 'hono/ws'
import { getSessionUser } from '../middleware/auth.ts'
import { assertProjectAccess } from '../modules/projects/access.ts'
import { hub } from './hub.ts'

/** `/ws?project=:id`: requiere sesión y acceso al proyecto. */
export function mountWebSocket(app: Hono, upgradeWebSocket: UpgradeWebSocket) {
  app.get(
    '/ws',
    async (c, next) => {
      const user = await getSessionUser(c.req.raw.headers)
      const projectId = c.req.query('project') ?? ''
      if (!user) return c.text('Unauthorized', 401)
      try {
        await assertProjectAccess(user.id, projectId)
      } catch {
        return c.text('Not found', 404)
      }
      await next()
    },
    upgradeWebSocket((c) => {
      const projectId = c.req.query('project') ?? ''
      let unsubscribe: (() => void) | null = null
      return {
        onOpen(_event, ws) {
          unsubscribe = hub.subscribe(projectId, { send: (data) => ws.send(data) })
          ws.send(JSON.stringify({ type: 'hello', projectId }))
        },
        onMessage(event, ws) {
          if (event.data === 'ping') ws.send('pong')
        },
        onClose() {
          unsubscribe?.()
        },
        onError() {
          unsubscribe?.()
        },
      }
    }),
  )
}
