import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DB_DRIVER: z.literal('postgres').default('postgres'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  PORT: z.coerce.number().int().positive().default(8787),
  BETTER_AUTH_SECRET: z.string().min(16, 'BETTER_AUTH_SECRET debe tener al menos 16 caracteres'),
  BETTER_AUTH_URL: z.url(),
  ALLOWED_EMAILS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
})

export type Env = z.infer<typeof EnvSchema>

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env)
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    console.error(`Variables de entorno inválidas:\n${detail}`)
    process.exit(1)
  }
  return parsed.data
}

export const env = loadEnv()
export const isProduction = env.NODE_ENV === 'production'
