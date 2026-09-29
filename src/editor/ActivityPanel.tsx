import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import type { ActivityDto } from '../core/api.ts'
import { columnTable } from '../core/diff.ts'
import { IconClose } from '../components/icons.tsx'
import { api } from '../lib/api.ts'
import { activityQueryKey } from './hooks.ts'
import { useEditorStore } from './store.ts'

const SOURCE: Record<string, string> = { ui: 'UI', mcp: 'Claude', api: 'API', seed: 'Ejemplo' }
const KIND: Record<string, string> = { model: 'SQL Server', mongo: 'Mongo', views: 'Vistas', notes: 'Notas' }

/** Hora si es de hoy; si no, día y hora. */
function when(iso: string): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === new Date().toDateString()) return time
  return `${d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} ${time}`
}

/** Registro de actividad (RF-43): últimos cambios con hora, origen y resumen. */
export function ActivityPanel({ projectId }: { projectId: string }) {
  const open = useEditorStore((s) => s.activityOpen)
  const toggle = useEditorStore((s) => s.toggleActivity)
  const activity = useQuery({
    queryKey: activityQueryKey(projectId),
    queryFn: () => api<ActivityDto[]>('GET', `/api/projects/${projectId}/activity`),
    enabled: open,
  })
  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 16 }}
          transition={{ duration: 0.18 }}
          className="absolute top-3 right-3 z-30 flex max-h-[70%] w-80 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-xl backdrop-blur"
          aria-label="Actividad"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <h2 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Actividad</h2>
            <button className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={toggle} aria-label="Cerrar actividad">
              <IconClose width={12} height={12} />
            </button>
          </div>
          <ol className="min-h-0 flex-1 overflow-y-auto p-2">
            {activity.isLoading && <li className="p-3 text-xs text-slate-400">Cargando…</li>}
            {activity.data?.length === 0 && <li className="p-3 text-xs text-slate-400">Sin cambios todavía.</li>}
            {activity.data?.map((a) => {
              const tables = a.diff
                ? [...new Set([...a.diff.tables.added, ...a.diff.tables.changed, ...a.diff.columns.added.map(columnTable), ...a.diff.columns.changed.map(columnTable)])]
                : []
              return (
                <li key={a.id}>
                  <button
                    className="flex w-full gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
                    title={tables.length > 0 ? 'Centrar en lo que cambió' : undefined}
                    onClick={() => {
                      const s = useEditorStore.getState()
                      s.selectStep(a.stepId)
                      const existing = tables.filter((t) => s.model?.tables.some((m) => m.key === t))
                      if (existing.length > 0) s.requestCenter(existing)
                    }}
                  >
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: a.stepColor }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-slate-800">{a.summary ?? '—'}</span>
                      <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-600">{SOURCE[a.source] ?? a.source}</span>
                        <span className="truncate">
                          {a.stepSlug} · {KIND[a.kind]}
                        </span>
                        <span className="ml-auto shrink-0 tabular-nums">{when(a.createdAt)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
