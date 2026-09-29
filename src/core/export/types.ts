import type { ProjectModel } from '../types.ts'

/** Metadatos de un step que usan los exportadores. */
export interface ExportStep {
  id: string
  slug: string
  name: string
  position: number
  workDate: string
  description: string | null
  color: string
  views: string
}

export interface ExportInput {
  projectName: string
  model: ProjectModel
  steps: ExportStep[]
}

export interface ExportOptions {
  /** Solo los objetos de este step (script incremental). */
  stepId?: string
  /** SQL Server: envolver cada objeto en una comprobación de existencia. */
  idempotent?: boolean
}

export const EXPORT_TARGETS = ['mssql', 'mongo', 'dbml'] as const
export type ExportTarget = (typeof EXPORT_TARGETS)[number]

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "2026-09-28" → "28 sep 2026". */
export function formatWorkDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[(m ?? 1) - 1] ?? ''} ${y}`
}

export function orderedSteps(steps: ExportStep[]): ExportStep[] {
  return [...steps].sort((a, b) => a.position - b.position)
}

/** Entrada de exportación a partir de los steps del proyecto (UI y servidor). */
export function exportInputFrom(
  projectName: string,
  model: ProjectModel,
  steps: {
    id: string
    slug: string
    name: string
    position: number
    workDate: string
    description: string | null
    color: string
    files: { views: { content: string } }
  }[],
): ExportInput {
  return {
    projectName,
    model,
    steps: steps.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      position: s.position,
      workDate: s.workDate,
      description: s.description,
      color: s.color,
      views: s.files.views.content,
    })),
  }
}
