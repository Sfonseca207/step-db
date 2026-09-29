import { asc, desc, eq, inArray } from 'drizzle-orm'
import type { ProjectDto, ProjectSummaryDto, StepDto, StepFileDto, WriteSource } from '../../../src/core/api.ts'
import { DEFAULT_CONVENTIONS, parseConventions, parseLayout, type Conventions, type Layout } from '../../../src/core/schemas.ts'
import { FILE_KINDS, type FileKind } from '../../../src/core/types.ts'
import { db } from '../../db/client.ts'
import { project, step, stepFile, type StepRow } from '../../db/schema.ts'
import { hub } from '../../realtime/hub.ts'
import { loadGasAppSeed } from '../../seed/gasapp/index.ts'
import { insertStep } from '../steps/service.ts'
import { assertProjectAccess } from './access.ts'

export { assertProjectAccess } from './access.ts'

function emptyFiles(): Record<FileKind, StepFileDto> {
  const out = {} as Record<FileKind, StepFileDto>
  for (const k of FILE_KINDS) out[k] = { content: '', version: 0, updatedAt: new Date(0).toISOString() }
  return out
}

export function toStepDto(row: StepRow, files: Record<FileKind, StepFileDto>): StepDto {
  return {
    id: row.id,
    slug: row.slug,
    position: row.position,
    name: row.name,
    workDate: row.workDate,
    color: row.color,
    status: row.status,
    description: row.description,
    files,
  }
}

/** Steps del proyecto (ordenados) con sus cuatro archivos. */
export async function loadSteps(projectId: string): Promise<StepDto[]> {
  const steps = await db.select().from(step).where(eq(step.projectId, projectId)).orderBy(asc(step.position))
  if (steps.length === 0) return []
  const files = await db
    .select()
    .from(stepFile)
    .where(
      inArray(
        stepFile.stepId,
        steps.map((s) => s.id),
      ),
    )
  const byStep = new Map<string, Record<FileKind, StepFileDto>>()
  for (const s of steps) byStep.set(s.id, emptyFiles())
  for (const f of files) {
    const rec = byStep.get(f.stepId)
    if (rec) rec[f.kind] = { content: f.content, version: f.version, updatedAt: f.updatedAt.toISOString() }
  }
  return steps.map((s) => toStepDto(s, byStep.get(s.id)!))
}

export async function listProjects(userId: string): Promise<ProjectSummaryDto[]> {
  const rows = await db.select().from(project).where(eq(project.ownerId, userId)).orderBy(desc(project.updatedAt))
  if (rows.length === 0) return []
  const steps = await db
    .select({ projectId: step.projectId, color: step.color })
    .from(step)
    .where(
      inArray(
        step.projectId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(step.position))
  const colors = new Map<string, string[]>()
  for (const s of steps) colors.set(s.projectId, [...(colors.get(s.projectId) ?? []), s.color])
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    stepCount: colors.get(r.id)?.length ?? 0,
    stepColors: colors.get(r.id) ?? [],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))
}

export async function getProject(userId: string, projectId: string): Promise<ProjectDto> {
  const row = await assertProjectAccess(userId, projectId)
  const steps = await loadSteps(projectId)
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    conventions: parseConventions(row.conventions),
    conventionsMd: row.conventionsMd,
    activeStepId: row.activeStepId,
    layout: parseLayout(row.layout),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    steps,
  }
}

export interface CreateProjectInput {
  name: string
  description?: string | null
}

/** Crea un proyecto con un primer step vacío y activo. */
export async function createProject(userId: string, input: CreateProjectInput): Promise<ProjectDto> {
  const id = await db.transaction(async (tx) => {
    const [p] = await tx
      .insert(project)
      .values({ ownerId: userId, name: input.name, description: input.description ?? null, conventions: DEFAULT_CONVENTIONS })
      .returning()
    const first = await insertStep(tx, p.id, { name: 'Inicio', description: 'Primer step del modelo' }, [], undefined, userId)
    await tx.update(project).set({ activeStepId: first.id }).where(eq(project.id, p.id))
    return p.id
  })
  return getProject(userId, id)
}

/** Crea el proyecto demo GasApp (SPEC fase 1) para el usuario. */
export async function createExampleProject(userId: string): Promise<ProjectDto> {
  const seed = loadGasAppSeed()
  const id = await db.transaction(async (tx) => {
    const [p] = await tx
      .insert(project)
      .values({
        ownerId: userId,
        name: seed.name,
        description: seed.description,
        conventions: DEFAULT_CONVENTIONS,
        conventionsMd: seed.conventionsMd,
      })
      .returning()
    let lastId: string | null = null
    const used: string[] = []
    for (const s of seed.steps) {
      const created = await insertStep(
        tx,
        p.id,
        { name: s.name, description: s.description, workDate: s.workDate, color: s.color, status: s.status, slug: s.slug },
        used,
        s.files,
        userId,
        'seed',
      )
      used.push(created.color)
      lastId = created.id
    }
    await tx.update(project).set({ activeStepId: lastId }).where(eq(project.id, p.id))
    return p.id
  })
  return getProject(userId, id)
}

export interface UpdateProjectInput {
  name?: string
  description?: string | null
  conventions?: Conventions
  conventionsMd?: string
  activeStepId?: string | null
}

export async function updateProject(
  userId: string,
  projectId: string,
  patch: UpdateProjectInput,
  source: WriteSource,
  clientId: string | null,
): Promise<ProjectDto> {
  await assertProjectAccess(userId, projectId)
  if (patch.activeStepId) {
    const [s] = await db.select({ projectId: step.projectId }).from(step).where(eq(step.id, patch.activeStepId))
    if (!s || s.projectId !== projectId) patch = { ...patch, activeStepId: undefined }
  }
  const values: Partial<typeof project.$inferInsert> = { updatedAt: new Date() }
  if (patch.name !== undefined) values.name = patch.name
  if (patch.description !== undefined) values.description = patch.description
  if (patch.conventions !== undefined) values.conventions = patch.conventions
  if (patch.conventionsMd !== undefined) values.conventionsMd = patch.conventionsMd
  if (patch.activeStepId !== undefined) values.activeStepId = patch.activeStepId
  await db.update(project).set(values).where(eq(project.id, projectId))
  const onlyActive = Object.keys(patch).every((k) => k === 'activeStepId')
  hub.publish({ type: 'project.changed', projectId, reason: onlyActive ? 'active' : 'meta', source, clientId })
  return getProject(userId, projectId)
}

export async function deleteProject(userId: string, projectId: string, clientId: string | null): Promise<void> {
  await assertProjectAccess(userId, projectId)
  await db.delete(project).where(eq(project.id, projectId))
  hub.publish({ type: 'project.changed', projectId, reason: 'deleted', source: 'ui', clientId })
}

/** Mezcla posiciones (y opcionalmente el viewport) en el layout del proyecto. */
export async function updateLayout(
  userId: string,
  projectId: string,
  patch: { positions?: Layout['positions']; removed?: string[]; viewport?: Layout['viewport'] },
  clientId: string | null,
): Promise<Layout> {
  const row = await assertProjectAccess(userId, projectId)
  const current = parseLayout(row.layout)
  const positions = { ...current.positions, ...(patch.positions ?? {}) }
  for (const key of patch.removed ?? []) delete positions[key]
  const layout: Layout = { positions, viewport: patch.viewport !== undefined ? patch.viewport : current.viewport }
  await db.update(project).set({ layout }).where(eq(project.id, projectId))
  hub.publish({ type: 'layout.changed', projectId, clientId })
  return layout
}
