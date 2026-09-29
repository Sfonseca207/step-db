import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import type { ProjectDto, WriteFileConflict, WriteFileInvalid, WriteFileOk } from '../core/api.ts'
import { formatDiagnostic } from '../core/model.ts'
import type { FileKind } from '../core/types.ts'
import { apiRaw } from '../lib/api.ts'
import { projectQueryKey } from './hooks.ts'
import { fileKey, useEditorStore } from './store.ts'

const AUTOSAVE_MS = 800
const storageKey = (projectId: string, key: string) => `stepdb:draft:${projectId}:${key}`

function safeStorage<T>(fn: () => T): T | undefined {
  try {
    return fn()
  } catch {
    return undefined
  }
}

/** Actualiza en la caché el contenido/versión de un archivo recién guardado. */
export function patchFileInCache(qc: QueryClient, projectId: string, stepId: string, kind: FileKind, content: string, version: number) {
  qc.setQueryData<ProjectDto>(projectQueryKey(projectId), (p) =>
    p
      ? {
          ...p,
          steps: p.steps.map((s) =>
            s.id === stepId
              ? { ...s, files: { ...s.files, [kind]: { content, version, updatedAt: new Date().toISOString() } } }
              : s,
          ),
        }
      : p,
  )
}

/** Cambia el borrador de un archivo (null = descartar) y lo respalda en localStorage. */
export function setDraftContent(project: ProjectDto, stepId: string, kind: FileKind, content: string | null) {
  const store = useEditorStore.getState()
  const file = project.steps.find((s) => s.id === stepId)?.files[kind]
  const key = fileKey(stepId, kind)
  const value = content === null || content === file?.content ? null : content
  store.setDraft(stepId, kind, value, file?.version)
  const base = useEditorStore.getState().draftBase[key]
  safeStorage(() => {
    if (value === null) localStorage.removeItem(storageKey(project.id, key))
    else localStorage.setItem(storageKey(project.id, key), JSON.stringify({ content: value, base }))
  })
}

function readBackup(raw: string | null | undefined): { content: string; base?: number } | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { content?: unknown; base?: unknown }
    if (typeof parsed.content === 'string') {
      return { content: parsed.content, base: typeof parsed.base === 'number' ? parsed.base : undefined }
    }
  } catch {
    // formato antiguo: texto plano
  }
  return { content: raw }
}

/**
 * Autoguardado (RF-32): con debounce, solo si el modelo completo parsea.
 * Maneja conflicto (409) y rechazo (422).
 */
export function useAutosave(project: ProjectDto | undefined) {
  const qc = useQueryClient()
  const drafts = useEditorStore((s) => s.drafts)
  const inFlight = useRef(new Set<string>())
  const projectRef = useRef(project)
  useEffect(() => {
    projectRef.current = project
  }, [project])

  // Recupera borradores de localStorage al abrir el proyecto.
  const restored = useRef<string | null>(null)
  useEffect(() => {
    if (!project || restored.current === project.id) return
    restored.current = project.id
    let count = 0
    for (const s of project.steps) {
      for (const kind of ['model', 'mongo', 'views', 'notes'] as FileKind[]) {
        const saved = readBackup(safeStorage(() => localStorage.getItem(storageKey(project.id, fileKey(s.id, kind)))))
        if (saved && saved.content !== s.files[kind].content) {
          useEditorStore.getState().setDraft(s.id, kind, saved.content, saved.base ?? s.files[kind].version)
          count++
        }
      }
    }
    if (count > 0) {
      useEditorStore.getState().pushToast({
        title: 'Borrador recuperado',
        body: count === 1 ? 'Se recuperó 1 archivo sin guardar de esta sesión.' : `Se recuperaron ${count} archivos sin guardar de esta sesión.`,
      })
    }
  }, [project])

  const save = useCallback(
    async (stepId: string, kind: FileKind, content: string, version: number) => {
      const p = projectRef.current
      if (!p) return
      const key = fileKey(stepId, kind)
      const store = useEditorStore.getState()
      inFlight.current.add(key)
      store.setSaving(key, 'saving')
      try {
        const { status, data } = await apiRaw<WriteFileOk | WriteFileConflict | WriteFileInvalid>(
          'PUT',
          `/api/steps/${stepId}/files/${kind}`,
          { content, version },
        )
        if (status === 200 && data.ok) {
          patchFileInCache(qc, p.id, stepId, kind, content, data.version)
          if (useEditorStore.getState().drafts[key] === content) {
            useEditorStore.getState().setDraft(stepId, kind, null)
            safeStorage(() => localStorage.removeItem(storageKey(p.id, key)))
          } else {
            // Se siguió escribiendo durante el guardado: el borrador parte de la versión nueva.
            useEditorStore.getState().setDraftBase(key, data.version)
          }
          useEditorStore.getState().setSaving(key, 'idle')
        } else if (status === 409 && !data.ok && data.error === 'conflict') {
          useEditorStore.getState().setConflict({ stepId, kind, mine: content, current: data.current })
          useEditorStore.getState().setSaving(key, 'error')
        } else if (status === 422 && !data.ok && data.error === 'invalid') {
          useEditorStore.getState().setSaving(key, 'error')
          useEditorStore.getState().pushToast({
            title: 'No se guardó',
            body: data.errors[0] ? formatDiagnostic(data.errors[0]) : 'El modelo no es válido',
            tone: 'error',
          })
        }
      } catch {
        useEditorStore.getState().setSaving(key, 'error')
        useEditorStore.getState().pushToast({ title: 'Sin conexión', body: 'No se pudo guardar; se reintentará.', tone: 'error' })
      } finally {
        inFlight.current.delete(key)
      }
    },
    [qc],
  )

  useEffect(() => {
    if (!project || Object.keys(drafts).length === 0) return
    const timer = setTimeout(() => {
      const state = useEditorStore.getState()
      const p = projectRef.current
      if (!p || state.conflict) return
      for (const [key, content] of Object.entries(state.drafts)) {
        if (inFlight.current.has(key)) continue
        const [stepId, kind] = key.split(':') as [string, FileKind]
        const step = p.steps.find((s) => s.id === stepId)
        if (!step) continue
        // Los archivos DBML solo se guardan si el modelo completo parsea.
        if ((kind === 'model' || kind === 'mongo') && state.errors.length > 0) continue
        // Se guarda con la versión sobre la que se empezó a editar: si alguien guardó
        // antes (Claude u otra pestaña), el servidor responde 409 y se abre el diálogo.
        void save(stepId, kind, content, state.draftBase[key] ?? step.files[kind].version)
      }
    }, AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [project, drafts, save])

  /** Resolución del diálogo de conflicto (RF-33). */
  const resolveConflict = useCallback(
    (choice: 'mine' | 'theirs') => {
      const state = useEditorStore.getState()
      const c = state.conflict
      const p = projectRef.current
      if (!c || !p) return
      state.setConflict(null)
      patchFileInCache(qc, p.id, c.stepId, c.kind, c.current.content, c.current.version)
      if (choice === 'mine') {
        state.setDraftBase(fileKey(c.stepId, c.kind), c.current.version)
        void save(c.stepId, c.kind, c.mine, c.current.version)
      } else {
        state.setDraft(c.stepId, c.kind, null)
        safeStorage(() => localStorage.removeItem(storageKey(p.id, fileKey(c.stepId, c.kind))))
        state.setSaving(fileKey(c.stepId, c.kind), 'idle')
      }
    },
    [qc, save],
  )

  return { resolveConflict }
}

// Solo en desarrollo: permite a QA fijar borradores sin teclear en Monaco.
if (import.meta.env.DEV) {
  const g = globalThis as unknown as { __stepdb?: Record<string, unknown> }
  g.__stepdb = { ...(g.__stepdb ?? {}), setDraftContent }
}
