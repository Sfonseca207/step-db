import { readFileSync, existsSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// Carga .env (si existe) y apunta DATABASE_URL a la base de tests.
function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  if (existsSync('.env')) {
    for (const line of readFileSync('.env', 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
      if (m) env[m[1]] = m[2]
    }
  }
  const base = { ...env, ...process.env } as Record<string, string>
  return {
    ...env,
    NODE_ENV: 'test',
    DATABASE_URL: base.DATABASE_URL_TEST ?? 'postgres://stepdb:stepdb@localhost:5432/stepdb_test',
    BETTER_AUTH_SECRET: base.BETTER_AUTH_SECRET ?? 'test-secret-test-secret-test-secret',
    BETTER_AUTH_URL: 'http://localhost:5173',
    ALLOWED_EMAILS: 'qa@stepdb.local,otro@stepdb.local,samuelfonseca01003@gmail.com',
  }
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    env: loadEnv(),
    // Los tests de integración comparten la base stepdb_test.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
})
