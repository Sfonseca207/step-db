import { createMiddleware } from 'hono/factory'
import { auth } from '../auth/better-auth.ts'
import { verifyApiToken } from '../auth/tokens.ts'
import { unauthorized } from '../lib/errors.ts'

export interface AuthVars {
  Variables: {
    userId: string
    userEmail?: string
    userName?: string
  }
}

export async function getSessionUser(headers: Headers): Promise<{ id: string; email: string; name: string } | null> {
  const result = await auth.api.getSession({ headers })
  if (!result) return null
  return { id: result.user.id, email: result.user.email, name: result.user.name }
}

/** Exige sesión por cookie (Better Auth). */
export const requireUser = createMiddleware<AuthVars>(async (c, next) => {
  const user = await getSessionUser(c.req.raw.headers)
  if (!user) throw unauthorized()
  c.set('userId', user.id)
  c.set('userEmail', user.email)
  c.set('userName', user.name)
  await next()
})

/** Exige `Authorization: Bearer <token>` de API (MCP). */
export const requireToken = createMiddleware<AuthVars>(async (c, next) => {
  const header = c.req.header('authorization') ?? ''
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  const userId = match ? await verifyApiToken(match[1]) : null
  if (!userId) {
    return c.json({ error: { code: 'unauthorized', message: 'Token de API inválido o revocado' } }, 401, {
      'WWW-Authenticate': 'Bearer',
    })
  }
  c.set('userId', userId)
  await next()
})
