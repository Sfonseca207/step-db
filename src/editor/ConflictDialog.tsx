import { Modal } from '../components/ConfirmDialog.tsx'
import { useEditorStore } from './store.ts'

/** Conflicto al guardar (RF-33): alguien guardó antes (Claude u otra pestaña). */
export function ConflictDialog({ onResolve }: { onResolve: (choice: 'mine' | 'theirs') => void }) {
  const conflict = useEditorStore((s) => s.conflict)
  const steps = useEditorStore((s) => s.steps)
  if (!conflict) return null
  const step = steps[conflict.stepId]
  return (
    <Modal onClose={() => {}}>
      <h2 className="text-base font-semibold text-slate-900">Conflicto al guardar</h2>
      <p className="mt-2 text-sm text-slate-600">
        El archivo <b className="font-mono">{step?.slug} · {conflict.kind}</b> cambió mientras lo editabas (versión{' '}
        {conflict.current.version}). ¿Qué quieres conservar?
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          <p className="mb-1 font-semibold text-slate-700">Lo mío</p>
          <pre className="max-h-40 overflow-auto font-mono whitespace-pre-wrap text-slate-600">{conflict.mine.slice(0, 1200)}</pre>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          <p className="mb-1 font-semibold text-slate-700">Lo guardado</p>
          <pre className="max-h-40 overflow-auto font-mono whitespace-pre-wrap text-slate-600">
            {conflict.current.content.slice(0, 1200)}
          </pre>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn" onClick={() => onResolve('theirs')}>
          Tomar lo guardado
        </button>
        <button className="btn btn-primary" onClick={() => onResolve('mine')} autoFocus>
          Mantener lo mío
        </button>
      </div>
    </Modal>
  )
}
