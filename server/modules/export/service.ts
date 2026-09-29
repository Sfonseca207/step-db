import { runExport, exportInputFrom, type ExportTarget } from '../../../src/core/export/index.ts'
import { slugify } from '../../../src/core/slug.ts'
import { HttpError, notFound } from '../../lib/errors.ts'
import { loadProjectModel } from '../files/service.ts'

export interface ExportParams {
  /** id o slug del step; vacío = modelo completo. */
  step?: string
  idempotent?: boolean
}

export async function exportProject(userId: string, projectId: string, target: ExportTarget, params: ExportParams = {}) {
  const { project, steps, model, errors } = await loadProjectModel(userId, projectId)
  if (!model) throw new HttpError(422, 'invalid', 'El modelo tiene errores; corrígelos antes de exportar', { errors })
  const step = params.step ? steps.find((s) => s.id === params.step || s.slug === params.step) : undefined
  if (params.step && !step) throw notFound('Step')
  const text = runExport(target, exportInputFrom(project.name, model, steps), {
    stepId: step?.id,
    idempotent: params.idempotent,
  })
  return { text, fileName: `${slugify(project.name)}${step ? `_${step.slug}` : ''}` }
}
