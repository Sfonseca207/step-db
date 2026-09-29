import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import { runMigrations } from '../db/migrate.ts'
import { sql } from '../db/client.ts'
import { createApp } from '../app.ts'

export const ORIGIN = 'http://localhost:5173'

let migrated: Promise<void> | null = null

/** Migra (una vez por archivo) y vacía todas las tablas. */
export async function resetDb(): Promise<void> {
  migrated ??= runMigrations(process.env.DATABASE_URL!)
  await migrated
  await sql`TRUNCATE TABLE revision, step_file, step, project, api_token, verification, account, session, "user" RESTART IDENTITY CASCADE`
}

export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 })
}

export const { app, injectWebSocket } = createApp()

export interface TestUser {
  id: string
  email: string
  cookie: string
}

export interface RequestOptions {
  cookie?: string
  body?: unknown
  headers?: Record<string, string>
}

export async function request(method: string, path: string, opts: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { origin: ORIGIN, ...(opts.headers ?? {}) }
  if (opts.cookie) headers.cookie = opts.cookie
  let body: string | undefined
  if (opts.body !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  return app.request(`${ORIGIN}${path}`, { method, headers, body })
}

function cookieFrom(res: Response): string {
  const all = res.headers.getSetCookie()
  return all.map((c) => c.split(';')[0]).join('; ')
}

export async function signUp(email: string, password = 'contrasena-segura-123'): Promise<Response> {
  return request('POST', '/api/auth/sign-up/email', { body: { email, password, name: email.split('@')[0] } })
}

export async function createUser(email = 'qa@stepdb.local'): Promise<TestUser> {
  const res = await signUp(email)
  if (res.status !== 200) throw new Error(`sign-up falló: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { user: { id: string } }
  return { id: data.user.id, email, cookie: cookieFrom(res) }
}

/** Levanta el servidor real (con WebSocket) en un puerto libre. */
export async function startServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = serve({ fetch: app.fetch, port: 0, createServer })
  injectWebSocket(server)
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://localhost:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
        ;(server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.()
      }),
  }
}
