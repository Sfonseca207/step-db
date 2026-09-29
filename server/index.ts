import { serve } from '@hono/node-server'
import { env } from './env.ts'
import { createApp } from './app.ts'

const { app, injectWebSocket } = createApp()

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`StepDB escuchando en http://localhost:${info.port}`)
})
injectWebSocket(server)

function shutdown() {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
