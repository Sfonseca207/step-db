import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '../env.ts'
import * as schema from './schema.ts'

export const sql = postgres(env.DATABASE_URL, {
  max: env.NODE_ENV === 'test' ? 5 : 10,
  onnotice: () => {},
})

export const db = drizzle(sql, { schema })
export type Db = typeof db

export async function pingDb(): Promise<boolean> {
  try {
    await sql`select 1`
    return true
  } catch {
    return false
  }
}
