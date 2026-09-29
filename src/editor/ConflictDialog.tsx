import { useEffect, useMemo, useRef } from 'react'
import { Modal } from '../components/ConfirmDialog.tsx'
import { diffLines, type DiffLine } from '../core/linediff.ts'
import type { FileKind } from '../core/types.ts'
import { useEditorStore } from './store.ts'

const KIND_LABEL: Record<FileKind, string> = { model: 'SQL Server', mongo: 'Mongo', views: 'Vistas', notes: 'Notas' }

function Side({ title, lines, tone }: { title: string; lines: DiffLine[]; tone: 'mine' | 'theirs' }) {
  const changed = lines.filter((l) => l.kind === 'changed').length
  // Al abrir, cada lado muestra su primera línea distinta.
  const preRef = useRef<HTMLPreElement>(null)
  useEffect(() => {
    // Un frame después: el diálogo todavía no se ha mostrado cuando corre este efecto.
    const raf = requestAnimationFrame(() => {
      const pre = preRef.current
      const first = pre?.querySelector<HTMLElement>('[data-changed]')
      if (pre && first) pre.scrollTop = Math.max(0, first.offsetTop - pre.offsetTop - 48)
    })
    return () => cancelAnimationFrame(raf)
  }, [lines])
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50">
      <p className="flex items-center justify-between border-b border-slate-200 px-2 py-1 font-semibold text-slate-700">
        {title}
        <span className="font-normal text-slate-400">
          {changed} {changed === 1 ? 'línea distinta' : 'líneas distintas'}
        </span>
      </p>
      <pre ref={preRef} tabIndex={-1} className="max-h-56 overflow-auto py-1 font-mono leading-relaxed text-slate-600">
        {lines.map((line, i) => (
          <span
            key={i}
            data-changed={line.kind === 'changed' ? '' : undefined}
            className={`block px-2 whitespace-pre-wrap ${
              line.kind === 'changed' ? (tone === 'mine' ? 'bg-emerald-100 text-emerald-950' : 'bg-amber-100 text-amber-950') : ''
            }`}
          >
            {line.text || ' '}
          </span>
        ))}
      </pre>
    </div>
  )
}

/** Conflicto al guardar (RF-33): alguien guardó antes (Claude u otra pestaña). */
export function ConflictDialog({ onResolve }: { onResolve: (choice: 'mine' | 'theirs') => void }) {
  const conflict = useEditorStore((s) => s.conflict)
  const steps = useEditorStore((s) => s.steps)
  const diff = useMemo(() => (conflict ? diffLines(conflict.mine, conflict.current.content) : null), [conflict])
  if (!conflict || !diff) return null
  const step = steps[conflict.stepId]
  return (
    <Modal onClose={() => {}} dismissible={false} wide>
      <h2 className="text-base font-semibold text-slate-900">Conflicto al guardar</h2>
      <p className="mt-2 text-sm text-slate-600">
        El archivo <b>{KIND_LABEL[conflict.kind]}</b> del step <b className="font-mono">{step?.slug}</b> cambió mientras lo editabas
        (versión {conflict.current.version}). Las líneas resaltadas son las que difieren. ¿Qué quieres conservar?
      </p>
      <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
        <Side title="Lo mío" lines={diff.left} tone="mine" />
        <Side title="Lo guardado" lines={diff.right} tone="theirs" />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn" onClick={() => onResolve('theirs')}>
          Tomar lo guardado
        </button>
        <button className="btn btn-primary" onClick={() => onResolve('mine')} data-autofocus>
          Mantener lo mío
        </button>
      </div>
    </Modal>
  )
}
