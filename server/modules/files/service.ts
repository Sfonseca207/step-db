import { and, desc, eq, gt, ne, or, sql } from 'drizzle-orm'
import type { ActivityDto, RevisionDto, WriteFileConflict, WriteFileInvalid, WriteFileOk, WriteSource } from '../../../src/core/api.ts'
import { diffModels, summarizeDiff } from '../../../src/core/diff.ts'
import { lintModel } from '../../../src/core/lint.ts'
import { buildProjectModel } from '../../../src/core/model.ts'
import { MAX_FILE_BYTES, parseConventions } from '../../../src/core/schemas.ts'
import type { FileKind, ModelDiff, ProjectModel, StepSource } from '../../../src/core/types.ts'
import { db } from '../../db/client.ts'
import { project, revision, step, stepFile, user } from '../../db/schema.ts'
import { HttpError } from '../../lib/errors.ts'
import { hub } from '../../realtime/hub.ts'
import { assertProjectAccess, assertStepAccess } from '../projects/access.ts'
import { loadSteps } from '../projects/service.ts'

export type WriteResult = WriteFileOk | WriteFileConflict | WriteFileInvalid

export interface WriteFileInput {
  content: string
  version: number
}

export interface WriteContext {
  userId: string
  source: WriteSource
  clientId: string | null
  authorName?: string | null
}

function toSources(steps: Awaited<ReturnType<typeof loadSteps>>): StepSource[] {
  return steps.map((s) => ({
    id: s.id,
    slug: s.slug,
    position: s.position,
    files: { model: s.files.model.content, mongo: s.files.mongo.content },
  }))
}

/** Modelo actual del proyecto (lo guardado en la base). */
export async function loadProjectModel(userId: string, projectId: string) {
  const row = await assertProjectAccess(userId, projectId)
  const steps = await loadSteps(projectId)
  const conventions = parseConventions(row.conventions)
  const result = buildProjectModel(toSources(steps), conventions)
  return { project: row, steps, conventions, ...result }
}

/**
 * Guarda un archivo de step (SPEC §4.3): valida el proyecto completo con el
 * contenido nuevo, controla la versión, crea una revisión y publica el diff.
 */
export async function writeStepFile(
  stepId: string,
  kind: FileKind,
  input: WriteFileInput,
  ctx: WriteContext,
): Promise<WriteResult> {
  const { project: p } = await assertStepAccess(ctx.userId, stepId)
  if (new TextEncoder().encode(input.content).length > MAX_FILE_BYTES) {
    throw new HttpError(413, 'too_large', 'El archivo supera el límite de 1 MB')
  }

  const steps = await loadSteps(p.id)
  const current = steps.find((s) => s.id === stepId)!.files[kind]
  if (current.content === input.content && current.version === input.version) {
    return { ok: true, version: current.version, diff: null, summary: 'sin cambios', warnings: [] }
  }

  const conventions = parseConventions(p.conventions)
  let diff: ModelDiff | null = null
  let nextModel: ProjectModel | null = null
  if (kind === 'model' || kind === 'mongo') {
    const sources = toSources(steps)
    const prev = buildProjectModel(sources, conventions)
    const nextSources = sources.map((s) =>
      s.id === stepId ? { ...s, files: { ...s.files, [kind]: input.content } } : s,
    )
    const next = buildProjectModel(nextSources, conventions)
    if (!next.model) return { ok: false, error: 'invalid', errors: next.errors }
    nextModel = next.model
    diff = diffModels(prev.model, next.model)
  }
  const summary = diff ? summarizeDiff(diff) : kind === 'views' ? 'vistas actualizadas' : 'notas actualizadas'

  const outcome = await db.transaction(async (tx) => {
    const updated = await tx
      .update(stepFile)
      .set({
        content: input.content,
        version: sql`${stepFile.version} + 1`,
        updatedBy: ctx.userId,
        updatedAt: new Date(),
      })
      .where(and(eq(stepFile.stepId, stepId), eq(stepFile.kind, kind), eq(stepFile.version, input.version)))
      .returning({ version: stepFile.version })
    if (updated.length === 0) return null
    const version = updated[0].version
    await tx.insert(revision).values({
      stepId,
      kind,
      version,
      content: input.content,
      source: ctx.source,
      authorId: ctx.userId,
      diff,
      summary,
    })
    await tx.update(project).set({ updatedAt: new Date() }).where(eq(project.id, p.id))
    return version
  })

  if (outcome === null) {
    const [row] = await db
      .select({ content: stepFile.content, version: stepFile.version })
      .from(stepFile)
      .where(and(eq(stepFile.stepId, stepId), eq(stepFile.kind, kind)))
    return { ok: false, error: 'conflict', current: { content: row?.content ?? '', version: row?.version ?? 0 } }
  }

  hub.publish({
    type: 'model.changed',
    projectId: p.id,
    stepId,
    kind,
    version: outcome,
    source: ctx.source,
    diff,
    summary,
    author: ctx.authorName ?? null,
    clientId: ctx.clientId,
  })

  const warnings = nextModel ? lintModel(nextModel, conventions) : []
  return { ok: true, version: outcome, diff, summary, warnings }
}

function toRevisionDto(
  r: typeof revision.$inferSelect,
  authorName: string | null,
  withContent: boolean,
): RevisionDto {
  return {
    id: r.id,
    stepId: r.stepId,
    kind: r.kind,
    version: r.version,
    source: r.source,
    authorName,
    summary: r.summary,
    diff: r.diff ?? null,
    createdAt: r.createdAt.toISOString(),
    ...(withContent ? { content: r.content } : {}),
  }
}

export async function listRevisions(userId: string, stepId: string, kind: FileKind, limit = 50): Promise<RevisionDto[]> {
  await assertStepAccess(userId, stepId)
  const rows = await db
    .select({ r: revision, authorName: user.name })
    .from(revision)
    .leftJoin(user, eq(user.id, revision.authorId))
    .where(and(eq(revision.stepId, stepId), eq(revision.kind, kind)))
    .orderBy(desc(revision.createdAt))
    .limit(limit)
  return rows.map((row) => toRevisionDto(row.r, row.authorName, true))
}

/** Últimos cambios del proyecto (RF-43). */
export async function listActivity(userId: string, projectId: string, limit = 30): Promise<ActivityDto[]> {
  await assertProjectAccess(userId, projectId)
  const rows = await db
    .select({ r: revision, authorName: user.name, slug: step.slug, name: step.name, color: step.color })
    .from(revision)
    .innerJoin(step, eq(step.id, revision.stepId))
    .leftJoin(user, eq(user.id, revision.authorId))
    // Las versiones iniciales vacías no son actividad.
    .where(and(eq(step.projectId, projectId), or(gt(revision.version, 1), ne(revision.content, ''))))
    .orderBy(desc(revision.createdAt))
    .limit(limit)
  return rows.map((row) => ({
    ...toRevisionDto(row.r, row.authorName, false),
    stepSlug: row.slug,
    stepName: row.name,
    stepColor: row.color,
  }))
}
