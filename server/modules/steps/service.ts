import { and, asc, eq, max } from 'drizzle-orm'
import type { StepDto, WriteSource } from '../../../src/core/api.ts'
import { nextStepColor } from '../../../src/core/palette.ts'
import { makeStepSlug } from '../../../src/core/slug.ts'
import { FILE_KINDS, type FileKind, type StepStatus } from '../../../src/core/types.ts'
import { db, type Tx } from '../../db/client.ts'
import { project, revision, step, stepFile, type StepRow } from '../../db/schema.ts'
import { HttpError } from '../../lib/errors.ts'
import { hub } from '../../realtime/hub.ts'
import { assertProjectAccess, assertStepAccess } from '../projects/access.ts'
import { loadSteps } from '../projects/service.ts'

export interface CreateStepInput {
  name: string
  description?: string | null
  workDate?: string
  color?: string
  status?: StepStatus
  /** Solo para el seed: slug fijo. */
  slug?: string
}

export function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Inserta un step (con sus cuatro archivos) al final del proyecto. */
export async function insertStep(
  tx: Tx,
  projectId: string,
  input: CreateStepInput,
  usedColors: string[],
  files?: Partial<Record<FileKind, string>>,
  userId?: string,
  source: WriteSource = 'ui',
): Promise<StepRow> {
  const [{ maxPos }] = await tx
    .select({ maxPos: max(step.position) })
    .from(step)
    .where(eq(step.projectId, projectId))
  const position = (maxPos ?? 0) + 1
  const existing = await tx.select({ slug: step.slug, color: step.color }).from(step).where(eq(step.projectId, projectId))
  const slugs = new Set(existing.map((s) => s.slug))
  let slug = input.slug ?? makeStepSlug(position, input.name)
  for (let i = 2; slugs.has(slug); i++) slug = `${makeStepSlug(position, input.name)}-${i}`
  const color = input.color ?? nextStepColor([...usedColors, ...existing.map((s) => s.color)])
  const [row] = await tx
    .insert(step)
    .values({
      projectId,
      slug,
      position,
      name: input.name,
      workDate: input.workDate ?? today(),
      color,
      status: input.status ?? 'en_curso',
      description: input.description ?? null,
    })
    .returning()
  await tx.insert(stepFile).values(
    FILE_KINDS.map((kind) => ({ stepId: row.id, kind, content: files?.[kind] ?? '', updatedBy: userId ?? null })),
  )
  // Versión 1 de cada archivo: el historial siempre permite volver al estado inicial.
  await tx.insert(revision).values(
    FILE_KINDS.map((kind) => ({
      stepId: row.id,
      kind,
      version: 1,
      content: files?.[kind] ?? '',
      source,
      authorId: userId ?? null,
      summary: files?.[kind] ? 'Contenido inicial del ejemplo' : 'Archivo vacío',
    })),
  )
  return row
}

async function stepDto(projectId: string, stepId: string): Promise<StepDto> {
  const steps = await loadSteps(projectId)
  const found = steps.find((s) => s.id === stepId)
  if (!found) throw new HttpError(404, 'not_found', 'Step no encontrado')
  return found
}

/** Crea un step y lo deja activo. */
export async function createStep(
  userId: string,
  projectId: string,
  input: CreateStepInput,
  source: WriteSource,
  clientId: string | null,
): Promise<StepDto> {
  await assertProjectAccess(userId, projectId)
  const row = await db.transaction(async (tx) => {
    const created = await insertStep(tx, projectId, { ...input, slug: undefined }, [], undefined, userId, source)
    await tx.update(project).set({ activeStepId: created.id, updatedAt: new Date() }).where(eq(project.id, projectId))
    return created
  })
  hub.publish({ type: 'project.changed', projectId, reason: 'steps', source, clientId })
  return stepDto(projectId, row.id)
}

export interface UpdateStepInput {
  name?: string
  description?: string | null
  workDate?: string
  color?: string
  status?: StepStatus
}

/** Edita metadatos. El slug no cambia: lo referencian las columnas `[step: "…"]`. */
export async function updateStep(
  userId: string,
  stepId: string,
  patch: UpdateStepInput,
  source: WriteSource,
  clientId: string | null,
): Promise<StepDto> {
  const { project: p } = await assertStepAccess(userId, stepId)
  await db
    .update(step)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(step.id, stepId))
  await db.update(project).set({ updatedAt: new Date() }).where(eq(project.id, p.id))
  hub.publish({ type: 'project.changed', projectId: p.id, reason: 'steps', source, clientId })
  return stepDto(p.id, stepId)
}

/** Reordena los steps. `stepIds` debe contener exactamente todos los steps del proyecto. */
export async function reorderSteps(
  userId: string,
  projectId: string,
  stepIds: string[],
  source: WriteSource,
  clientId: string | null,
): Promise<StepDto[]> {
  await assertProjectAccess(userId, projectId)
  const current = await db.select({ id: step.id }).from(step).where(eq(step.projectId, projectId)).orderBy(asc(step.position))
  const currentIds = new Set(current.map((s) => s.id))
  if (stepIds.length !== currentIds.size || !stepIds.every((id) => currentIds.has(id)) || new Set(stepIds).size !== stepIds.length) {
    throw new HttpError(400, 'bad_request', 'La lista debe contener todos los steps del proyecto, una vez cada uno')
  }
  await db.transaction(async (tx) => {
    for (const [i, id] of stepIds.entries()) {
      await tx
        .update(step)
        .set({ position: i + 1 })
        .where(and(eq(step.id, id), eq(step.projectId, projectId)))
    }
  })
  hub.publish({ type: 'project.changed', projectId, reason: 'order', source, clientId })
  return loadSteps(projectId)
}
