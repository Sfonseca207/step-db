import { and, eq } from 'drizzle-orm'
import { db } from '../../db/client.ts'
import { project, step, type ProjectRow, type StepRow } from '../../db/schema.ts'
import { notFound } from '../../lib/errors.ts'
import { isUuid } from '../../lib/validate.ts'

/** Todo acceso a un proyecto pasa por aquí. Ajeno o inexistente → 404. */
export async function assertProjectAccess(userId: string, projectId: string): Promise<ProjectRow> {
  if (!isUuid(projectId)) throw notFound('Proyecto')
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.ownerId, userId)))
  if (!row) throw notFound('Proyecto')
  return row
}

export async function assertStepAccess(userId: string, stepId: string): Promise<{ step: StepRow; project: ProjectRow }> {
  if (!isUuid(stepId)) throw notFound('Step')
  const [row] = await db
    .select({ step, project })
    .from(step)
    .innerJoin(project, eq(project.id, step.projectId))
    .where(and(eq(step.id, stepId), eq(project.ownerId, userId)))
  if (!row) throw notFound('Step')
  return row
}
