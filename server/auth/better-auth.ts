import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { db } from '../db/client.ts'
import { account, session, user, verification } from '../db/schema.ts'
import { env, isProduction } from '../env.ts'

export function isEmailAllowed(email: string): boolean {
  return env.ALLOWED_EMAILS.includes(email.trim().toLowerCase())
}

/** Orígenes de confianza: la URL pública y, fuera de producción, el propio servidor. */
export const trustedOrigins = Array.from(
  new Set([new URL(env.BETTER_AUTH_URL).origin, ...(isProduction ? [] : [`http://localhost:${env.PORT}`])]),
)

export const auth = betterAuth({
  appName: 'StepDB',
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: env.NODE_ENV !== 'test',
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 10 },
      '/sign-up/email': { window: 60, max: 5 },
    },
  },
  advanced: {
    useSecureCookies: isProduction,
    defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: isProduction },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (data) => {
          if (!isEmailAllowed(data.email)) {
            throw new APIError('FORBIDDEN', {
              code: 'EMAIL_NOT_ALLOWED',
              message: 'Este correo no está autorizado para registrarse en StepDB',
            })
          }
          return { data: { ...data, email: data.email.toLowerCase() } }
        },
      },
    },
  },
})

export type AuthSession = typeof auth.$Infer.Session
