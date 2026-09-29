import { AnimatePresence, motion } from 'motion/react'
import { IconClose } from '../components/icons.tsx'
import { useEditorStore } from './store.ts'

/** Toasts de cambios externos (RF-42). Clic → centra el canvas en lo que cambió. */
export function Toasts() {
  const toasts = useEditorStore((s) => s.toasts)
  const dismiss = useEditorStore((s) => s.dismissToast)
  const requestCenter = useEditorStore((s) => s.requestCenter)
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border bg-white py-2 pr-2 pl-3 shadow-lg ${
              t.tone === 'error' ? 'border-red-200' : 'border-slate-200'
            }`}
            role="status"
          >
            <span
              className="h-8 w-1.5 shrink-0 rounded-full"
              style={{ background: t.tone === 'error' ? '#E5484D' : (t.color ?? '#0f172a') }}
            />
            <button
              className="min-w-0 text-left"
              onClick={() => {
                if (t.tables && t.tables.length > 0) requestCenter(t.tables)
                dismiss(t.id)
              }}
              title={t.tables?.length ? 'Centrar en lo que cambió' : undefined}
            >
              <p className="text-xs font-semibold text-slate-900">{t.title}</p>
              <p className="truncate text-xs text-slate-600">{t.body}</p>
            </button>
            <button className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={() => dismiss(t.id)} aria-label="Cerrar">
              <IconClose width={12} height={12} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
