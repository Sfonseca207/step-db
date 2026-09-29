import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url))

/** Aplica las migraciones pendientes sobre `url`. */
export async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER })
  } finally {
    await client.end()
  }
}

// Ejecutado directamente: `npm run db:migrate`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL es obligatoria')
    process.exit(1)
  }
  runMigrations(url)
    .then(() => console.log('Migraciones aplicadas'))
    .catch((err: unknown) => {
      console.error('Error aplicando migraciones:', err instanceof Error ? err.message : err)
      process.exit(1)
    })
}
