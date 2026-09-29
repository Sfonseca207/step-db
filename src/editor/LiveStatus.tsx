import { useEditorStore } from './store.ts'

/** Aviso discreto cuando se pierde la sincronización en vivo. */
export function LiveStatus() {
  const live = useEditorStore((s) => s.live)
  if (live !== 'offline') return null
  return (
    <div
      className="sdb-rise absolute bottom-4 left-16 z-30 flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50/95 px-3 py-1 text-xs font-medium text-amber-900 shadow-sm"
      role="status"
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
      Sin conexión en vivo · reconectando…
    </div>
  )
}
