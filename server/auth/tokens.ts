import { createHash, randomBytes } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { apiToken } from '../db/schema.ts'
import { notFound } from '../lib/errors.ts'

const TOKEN_PREFIX = 'sdb_'
/** Caracteres visibles para reconocer el token en la UI (`sdb_` + 8). */
const VISIBLE_PREFIX_LENGTH = 12

export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export interface TokenInfo {
  id: string
  name: string
  prefix: string
  lastUsedAt: string | null
  createdAt: string
  revokedAt: string | null
}

function toInfo(row: typeof apiToken.$inferSelect): TokenInfo {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  }
}

/** Crea un token; el valor en claro solo se devuelve aquí. */
export async function createApiToken(userId: string, name: string): Promise<{ token: string; info: TokenInfo }> {
  const token = generateToken()
  const [row] = await db
    .insert(apiToken)
    .values({ userId, name, tokenHash: hashToken(token), prefix: token.slice(0, VISIBLE_PREFIX_LENGTH) })
    .returning()
  return { token, info: toInfo(row) }
}

export async function listApiTokens(userId: string): Promise<TokenInfo[]> {
  const rows = await db.select().from(apiToken).where(eq(apiToken.userId, userId)).orderBy(desc(apiToken.createdAt))
  return rows.map(toInfo)
}

export async function revokeApiToken(userId: string, id: string): Promise<void> {
  const rows = await db
    .update(apiToken)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiToken.id, id), eq(apiToken.userId, userId), isNull(apiToken.revokedAt)))
    .returning({ id: apiToken.id })
  if (rows.length === 0) throw notFound('Token')
}

/** Devuelve el `userId` dueño de un token vigente, o null. Actualiza `last_used_at`. */
export async function verifyApiToken(token: string): Promise<string | null> {
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) return null
  const [row] = await db
    .update(apiToken)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(apiToken.tokenHash, hashToken(token)), isNull(apiToken.revokedAt)))
    .returning({ userId: apiToken.userId })
  return row?.userId ?? null
}
