import { IconWarning } from '../components/icons.tsx'
import { formatDiagnostic } from '../core/model.ts'
import { useEditorStore } from './store.ts'

/** Banner de errores de parseo: el canvas muestra el último modelo válido (RF-32). */
export function ErrorBanner() {
  const errors = useEditorStore((s) => s.errors)
  if (errors.length === 0) return null
  const first = errors[0]
  return (
    <div className="absolute top-3 left-1/2 z-30 w-[min(640px,calc(100%-2rem))] -translate-x-1/2" role="alert">
      <button
        className="flex w-full items-start gap-3 rounded-xl border border-amber-300 bg-amber-50/95 px-4 py-2.5 text-left shadow-md backdrop-blur transition hover:bg-amber-50"
        onClick={() => {
          if (first.stepId && first.kind && first.line) {
            const s = useEditorStore.getState()
            s.selectStep(first.stepId)
            s.setSideTab('dbml')
            s.requestReveal(first.stepId, first.kind, first.line)
          }
        }}
      >
        <IconWarning className="mt-0.5 shrink-0 text-amber-600" />
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-xs font-semibold text-amber-900">{formatDiagnostic(first)}</span>
          <span className="block text-xs text-amber-800">
            {errors.length > 1 ? `y ${errors.length - 1} ${errors.length === 2 ? 'error más' : 'errores más'} · ` : ''}
            El canvas muestra el último modelo válido; tu borrador no se pierde y se guardará cuando el modelo parsee.
          </span>
        </span>
      </button>
    </div>
  )
}
