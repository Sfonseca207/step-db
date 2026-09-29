import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import type { ActivityDto } from '../core/api.ts'
import { IconClose } from '../components/icons.tsx'
import { api } from '../lib/api.ts'
import { activityQueryKey } from './hooks.ts'
import { useEditorStore } from './store.ts'

const SOURCE: Record<string, string> = { ui: 'UI', mcp: 'Claude', api: 'API', seed: 'Ejemplo' }

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
            {activity.data?.map((a) => (
              <li key={a.id} className="flex gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: a.stepColor }} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-700">{SOURCE[a.source] ?? a.source}</span>
                    <span className="truncate font-mono">
                      {a.stepSlug} · {a.kind}
                    </span>
                    <span className="ml-auto shrink-0">
                      {new Date(a.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </p>
                  <p className="truncate text-xs text-slate-700">{a.summary ?? '—'}</p>
                </div>
              </li>
            ))}
          </ol>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
