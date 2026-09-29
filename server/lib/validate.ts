import type { Context } from 'hono'
import type { z } from 'zod'
import { HttpError } from './errors.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

/** Valida el cuerpo JSON con zod; 400 con los problemas si no cumple. */
export async function parseJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new HttpError(400, 'bad_request', 'El cuerpo debe ser JSON válido')
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, 'validation', 'Datos inválidos', {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  return parsed.data
}

export function clientIdOf(c: Context): string | null {
  const v = c.req.header('x-client-id')
  return v && v.length <= 64 ? v : null
}
