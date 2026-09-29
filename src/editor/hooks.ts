import { useQuery } from '@tanstack/react-query'
import type { Viewport } from '@xyflow/react'
import { useCallback, useEffect, useRef } from 'react'
import type { ProjectDto } from '../core/api.ts'
import { diffModels, isEmptyDiff } from '../core/diff.ts'
import { lintModel } from '../core/lint.ts'
import { buildProjectModel } from '../core/model.ts'
import { stepNumber } from '../core/slug.ts'
import type { StepSource } from '../core/types.ts'
import { api } from '../lib/api.ts'
import type { Point } from './canvas/graph.ts'
import { fileKey, useEditorStore } from './store.ts'

export const projectQueryKey = (id: string) => ['project', id] as const
export const activityQueryKey = (projectId: string) => ['activity', projectId] as const

export function useProject(projectId: string) {
  return useQuery({
    queryKey: projectQueryKey(projectId),
    queryFn: () => api<ProjectDto>('GET', `/api/projects/${projectId}`),
    staleTime: Infinity,
  })
}

/** Fuentes DBML del proyecto con los borradores locales encima. */
export function sourcesWithDrafts(project: ProjectDto, drafts: Record<string, string>): StepSource[] {
  return project.steps.map((s) => ({
    id: s.id,
    slug: s.slug,
    position: s.position,
    files: {
      model: drafts[fileKey(s.id, 'model')] ?? s.files.model.content,
      mongo: drafts[fileKey(s.id, 'mongo')] ?? s.files.mongo.content,
    },
  }))
}

/**
 * Recalcula el modelo combinado (servidor + borradores). Si parsea, pasa a ser
 * el último modelo válido y se anima el diff; si no, el canvas conserva el anterior.
 */
export function useModelSync(project: ProjectDto | undefined) {
  const drafts = useEditorStore((s) => s.drafts)
  const setSteps = useEditorStore((s) => s.setSteps)
  const setModel = useEditorStore((s) => s.setModel)
  const setWarnings = useEditorStore((s) => s.setWarnings)
  const applyDiff = useEditorStore((s) => s.applyDiff)

  useEffect(() => {
    if (!project) return
    setSteps(
      project.steps.map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        color: s.color,
        number: stepNumber(s.position),
        position: s.position,
        status: s.status,
      })),
    )
  }, [project, setSteps])

  useEffect(() => {
    if (!project) return
    const handle = setTimeout(() => {
      const result = buildProjectModel(sourcesWithDrafts(project, drafts), project.conventions)
      const prev = useEditorStore.getState().model
      if (result.model) {
        if (prev) {
          const diff = diffModels(prev, result.model)
          if (!isEmptyDiff(diff)) applyDiff(diff, prev)
        }
        setModel(result.model, [])
        setWarnings(lintModel(result.model, project.conventions))
      } else if (!prev) {
        // Sin último modelo válido (p. ej. un borrador inválido recuperado al abrir):
        // se muestra lo guardado en el servidor para que el canvas nunca quede vacío.
        const saved = buildProjectModel(sourcesWithDrafts(project, {}), project.conventions)
        setModel(saved.model, result.errors)
        if (saved.model) setWarnings(lintModel(saved.model, project.conventions))
      } else {
        setModel(null, result.errors)
      }
    }, 120)
    return () => clearTimeout(handle)
  }, [project, drafts, setModel, setWarnings, applyDiff])
}

/** Persistencia de posiciones y viewport con debounce. */
export function useLayoutPersistence(projectId: string) {
  const pending = useRef<Record<string, Point>>({})
  const posTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    const positions = pending.current
    pending.current = {}
    if (Object.keys(positions).length === 0) return
    void api('PUT', `/api/projects/${projectId}/layout`, { positions }).catch(() => {
      useEditorStore.getState().pushToast({ title: 'Layout', body: 'No se pudieron guardar las posiciones', tone: 'error' })
    })
  }, [projectId])

  const persistPositions = useCallback(
    (positions: Record<string, Point>) => {
      Object.assign(pending.current, positions)
      if (posTimer.current) clearTimeout(posTimer.current)
      posTimer.current = setTimeout(flush, 400)
    },
    [flush],
  )

  const persistViewport = useCallback(
    (viewport: Viewport) => {
      if (vpTimer.current) clearTimeout(vpTimer.current)
      vpTimer.current = setTimeout(() => {
        const v = { x: Math.round(viewport.x), y: Math.round(viewport.y), zoom: Number(viewport.zoom.toFixed(3)) }
        void api('PUT', `/api/projects/${projectId}/layout`, { viewport: v }).catch(() => {})
      }, 800)
    },
    [projectId],
  )

  useEffect(
    () => () => {
      if (posTimer.current) {
        clearTimeout(posTimer.current)
        flush()
      }
      if (vpTimer.current) clearTimeout(vpTimer.current)
    },
    [flush],
  )

  return { persistPositions, persistViewport }
}
