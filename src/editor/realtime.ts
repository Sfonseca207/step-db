import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import type { ProjectDto, RealtimeEvent } from '../core/api.ts'
import { CLIENT_ID } from '../lib/api.ts'
import { projectQueryKey } from './hooks.ts'
import { useEditorStore } from './store.ts'

const SOURCE_LABEL: Record<string, string> = { mcp: 'Claude', ui: 'Otra pestaña', api: 'API', seed: 'Ejemplo' }

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
    const key = projectQueryKey(projectId)

    async function onEvent(ev: RealtimeEvent) {
      const store = useEditorStore.getState()
      switch (ev.type) {
        case 'model.changed': {
          if (ev.clientId === CLIENT_ID) return
          await qc.refetchQueries({ queryKey: key })
          const project = qc.getQueryData<ProjectDto>(key)
          const step = project?.steps.find((s) => s.id === ev.stepId)
          const tables = ev.diff
            ? [
                ...ev.diff.tables.added,
                ...ev.diff.tables.changed,
                ...[...ev.diff.columns.added, ...ev.diff.columns.changed].map((c) => c.slice(0, c.lastIndexOf('.'))),
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
            navigate('/', { replace: true })
            return
          }
          if (ev.clientId !== CLIENT_ID) await qc.refetchQueries({ queryKey: key })
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
        pingTimer = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('ping'), 25_000)
      }
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string' || e.data === 'pong') return
        try {
          const msg = JSON.parse(e.data) as RealtimeEvent | { type: 'hello' }
          if (msg.type !== 'hello') void onEvent(msg)
        } catch {
          // mensaje inválido: se ignora
        }
      }
      ws.onclose = () => {
        if (pingTimer) clearInterval(pingTimer)
        if (closed) return
        const delay = Math.min(10_000, 500 * 2 ** retry++)
        reconnectTimer = setTimeout(connect, delay)
      }
    }

    connect()
    return () => {
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (pingTimer) clearInterval(pingTimer)
      ws?.close()
    }
  }, [projectId, qc, navigate])
}
