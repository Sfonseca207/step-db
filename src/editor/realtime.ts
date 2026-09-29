import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import type { ProjectDto, RealtimeEvent } from '../core/api.ts'
import { columnTable } from '../core/diff.ts'
import { CLIENT_ID } from '../lib/api.ts'
import { activityQueryKey, projectQueryKey } from './hooks.ts'
import { useEditorStore } from './store.ts'

const SOURCE_LABEL: Record<string, string> = { mcp: 'Claude', ui: 'Otra pestaña', api: 'API', seed: 'Ejemplo' }

/** Texto del toast para un cambio externo de steps o del proyecto. */
function describeProjectChange(
  reason: string,
  before: ProjectDto | undefined,
  after: ProjectDto,
): { body: string; color?: string } | null {
  const label = (s: { position: number; name: string }) => `${String(s.position).padStart(2, '0')} · ${s.name}`
  if (reason === 'steps') {
    const known = new Map((before?.steps ?? []).map((s) => [s.id, s]))
    const created = after.steps.find((s) => !known.has(s.id))
    if (created) return { body: `Nuevo step ${label(created)}`, color: created.color }
    const changed = after.steps.find((s) => {
      const old = known.get(s.id)
      return old && (old.name !== s.name || old.color !== s.color || old.status !== s.status || old.workDate !== s.workDate || old.description !== s.description)
    })
    if (!changed) return null
    const old = known.get(changed.id)!
    if (old.status !== changed.status && changed.status === 'completado') return { body: `Step ${label(changed)} completado`, color: changed.color }
    return { body: `Step ${label(changed)} actualizado`, color: changed.color }
  }
  if (reason === 'order') return { body: 'Se reordenaron los steps' }
  if (reason === 'active') {
    const active = after.steps.find((s) => s.id === after.activeStepId)
    return active ? { body: `Step activo: ${label(active)}`, color: active.color } : null
  }
  if (reason === 'meta') return { body: 'Se actualizaron los datos del proyecto' }
  return null
}

/** WebSocket del proyecto con reconexión (backoff) y refetch al reconectar (SPEC §7.2). */
export function useRealtime(projectId: string) {
  const qc = useQueryClient()
  const navigate = useNavigate()

  useEffect(() => {
    let ws: WebSocket | null = null
    let retry = 0
    let closed = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let pingTimer: ReturnType<typeof setInterval> | null = null
    let queue: Promise<void> = Promise.resolve()
    const key = projectQueryKey(projectId)

    async function onEvent(ev: RealtimeEvent) {
      const store = useEditorStore.getState()
      switch (ev.type) {
        case 'model.changed': {
          void qc.invalidateQueries({ queryKey: activityQueryKey(projectId) })
          if (ev.clientId === CLIENT_ID) return
          await qc.refetchQueries({ queryKey: key })
          const project = qc.getQueryData<ProjectDto>(key)
          const step = project?.steps.find((s) => s.id === ev.stepId)
          const tables = ev.diff
            ? [
                ...ev.diff.tables.added,
                ...ev.diff.tables.changed,
                ...[...ev.diff.columns.added, ...ev.diff.columns.changed].map(columnTable),
              ]
            : []
          store.pushToast({
            title: `${SOURCE_LABEL[ev.source] ?? ev.source} · ${step?.slug ?? 'step'}`,
            body: ev.summary,
            color: step?.color,
            tables: [...new Set(tables)],
          })
          return
        }
        case 'project.changed':
          if (ev.reason === 'deleted') {
            navigate('/', { replace: true, state: { notice: 'El proyecto que tenías abierto fue borrado.' } })
            return
          }
          if (ev.clientId !== CLIENT_ID) {
            const before = qc.getQueryData<ProjectDto>(key)
            await qc.refetchQueries({ queryKey: key })
            const after = qc.getQueryData<ProjectDto>(key)
            const note = after ? describeProjectChange(ev.reason, before, after) : null
            if (note) store.pushToast({ title: SOURCE_LABEL[ev.source] ?? ev.source, body: note.body, color: note.color })
          }
          return
        case 'layout.changed':
          if (ev.clientId !== CLIENT_ID) await qc.refetchQueries({ queryKey: key })
          return
        case 'ui.focus': {
          if (ev.stepId) {
            store.selectStep(ev.stepId)
            const tables = store.model?.tables.filter((t) => t.stepId === ev.stepId).map((t) => t.key) ?? []
            store.requestCenter(tables)
          }
          if (ev.table) {
            store.selectTable(ev.table)
            store.requestCenter([ev.table])
          }
          return
        }
      }
    }

    function connect() {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${window.location.host}/ws?project=${encodeURIComponent(projectId)}`)
      ws.onopen = () => {
        if (retry > 0) void qc.refetchQueries({ queryKey: key })
        retry = 0
        useEditorStore.getState().setLive('online')
        pingTimer = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('ping'), 25_000)
      }
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string' || e.data === 'pong') return
        try {
          const msg = JSON.parse(e.data) as RealtimeEvent | { type: 'hello' }
          // En orden: un `ui.focus` debe esperar al refetch del `model.changed` previo.
          if (msg.type !== 'hello') queue = queue.then(() => onEvent(msg)).catch(() => {})
        } catch {
          // mensaje inválido: se ignora
        }
      }
      ws.onclose = () => {
        if (pingTimer) clearInterval(pingTimer)
        if (closed) return
        // Un corte breve no se anuncia; si el reintento también falla, sí.
        if (retry > 0) useEditorStore.getState().setLive('offline')
        const delay = Math.min(10_000, 500 * 2 ** retry++)
        reconnectTimer = setTimeout(connect, delay)
      }
    }

    // Conexión diferida: evita abrir y cerrar un socket en el doble montaje de StrictMode.
    reconnectTimer = setTimeout(connect, 0)
    return () => {
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (pingTimer) clearInterval(pingTimer)
      ws?.close()
    }
  }, [projectId, qc, navigate])
}
