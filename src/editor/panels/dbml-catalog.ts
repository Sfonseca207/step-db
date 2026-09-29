import type { ProjectDto } from '../../core/api.ts'
import { DEFAULT_CONVENTIONS } from '../../core/schemas.ts'
import type { DbmlKind } from '../../core/types.ts'
import { queryClient } from '../../lib/queryClient.ts'
import { projectQueryKey, sourcesWithDrafts } from '../hooks.ts'
import { useEditorStore } from '../store.ts'
import { buildCatalog, type Catalog } from './dbml-complete.ts'

let cached: { project: unknown; drafts: unknown; model: unknown; steps: unknown; catalog: Catalog } | null = null

/** Catálogo del proyecto abierto, con los borradores encima de lo guardado. */
export function currentCatalog(): Catalog {
  const { projectId, drafts, model, steps } = useEditorStore.getState()
  const project = projectId ? queryClient.getQueryData<ProjectDto>(projectQueryKey(projectId)) : undefined
  if (cached && cached.project === project && cached.drafts === drafts && cached.model === model && cached.steps === steps) return cached.catalog
  const catalog = buildCatalog({
    sources: project ? sourcesWithDrafts(project, drafts) : [],
    model,
    steps: Object.values(steps).sort((a, b) => a.position - b.position),
    conventions: project?.conventions ?? DEFAULT_CONVENTIONS,
  })
  cached = { project, drafts, model, steps, catalog }
  return catalog
}

/** Archivo al que pertenece un modelo de Monaco (ver `filePath`); fuera del editor de steps, SQL Server. */
export function kindOfPath(path: string): DbmlKind {
  return /\/mongo\.dbml$/.test(path) ? 'mongo' : 'model'
}
