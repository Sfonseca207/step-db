import { z } from 'zod'

/** Convenciones del proyecto (SPEC §6.1). */
export const ConventionsSchema = z.object({
  language: z.string().min(2).max(10).default('es'),
  case: z.enum(['snake_case', 'camelCase', 'PascalCase']).default('snake_case'),
  tableNames: z.enum(['singular', 'plural']).default('singular'),
  primaryKey: z.string().min(1).max(64).default('id'),
  foreignKeyPattern: z.string().min(1).max(64).default('{tabla}_id'),
  defaultSqlSchema: z.string().min(1).max(64).default('dbo'),
})
export type Conventions = z.infer<typeof ConventionsSchema>

export const DEFAULT_CONVENTIONS: Conventions = ConventionsSchema.parse({})

export function parseConventions(value: unknown): Conventions {
  const parsed = ConventionsSchema.safeParse(value ?? {})
  return parsed.success ? parsed.data : DEFAULT_CONVENTIONS
}

const PointSchema = z.object({ x: z.number().finite(), y: z.number().finite() })

/** Layout del canvas (SPEC §6.4). Clave: `schema.tabla`. */
export const LayoutSchema = z.object({
  positions: z.record(z.string().max(300), PointSchema).default({}),
  viewport: z.object({ x: z.number().finite(), y: z.number().finite(), zoom: z.number().positive() }).nullable().default(null),
})
export type Layout = z.infer<typeof LayoutSchema>

export const EMPTY_LAYOUT: Layout = { positions: {}, viewport: null }

export function parseLayout(value: unknown): Layout {
  const parsed = LayoutSchema.safeParse(value ?? {})
  return parsed.success ? parsed.data : EMPTY_LAYOUT
}

/** Límite de tamaño por archivo de step (SPEC §8). */
export const MAX_FILE_BYTES = 1024 * 1024
