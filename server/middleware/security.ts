import { createMiddleware } from 'hono/factory'
import { secureHeaders } from 'hono/secure-headers'
import { isProduction } from '../env.ts'
import { HttpError } from '../lib/errors.ts'

/** Headers de seguridad con una CSP compatible con Monaco (workers blob:) y React Flow (estilos inline). */
export const securityHeaders = secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:'],
    fontSrc: ["'self'", 'data:'],
    workerSrc: ["'self'", 'blob:'],
    connectSrc: ["'self'", 'ws:', 'wss:'],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    ...(isProduction ? { upgradeInsecureRequests: [] } : {}),
  },
  strictTransportSecurity: isProduction ? 'max-age=15552000; includeSubDomains' : false,
  crossOriginEmbedderPolicy: false,
})

/**
 * CSRF para rutas con cookie que modifican datos: si el navegador envía
 * `Origin`, debe ser uno de los orígenes de confianza.
 */
export function originGuard(allowed: readonly string[]) {
  return createMiddleware(async (c, next) => {
    const method = c.req.method
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      const origin = c.req.header('origin')
      if (origin && !allowed.includes(origin)) {
        throw new HttpError(403, 'forbidden_origin', 'Origen no permitido')
      }
      const site = c.req.header('sec-fetch-site')
      if (site === 'cross-site') throw new HttpError(403, 'forbidden_origin', 'Origen no permitido')
    }
    await next()
  })
}
