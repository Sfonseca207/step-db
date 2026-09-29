import { IconCheck } from '../../components/icons.tsx'
import type { FileKind } from '../../core/types.ts'
import { fileKey, useEditorStore } from '../store.ts'

/** Estado de guardado de uno o varios archivos (el peor de todos). */
export function SaveStatus({ files }: { files: { stepId: string; kind: FileKind }[] }) {
  const keys = files.map((f) => fileKey(f.stepId, f.kind))
  const hasDraft = useEditorStore((s) => keys.some((k) => s.drafts[k] !== undefined))
  const saving = useEditorStore((s) => keys.some((k) => s.saving[k] === 'saving'))
  const failed = useEditorStore((s) => keys.some((k) => s.saving[k] === 'error' && s.drafts[k] !== undefined))
  const invalid = useEditorStore(
    (s) =>
      s.errors.length > 0 &&
      files.some((f) => (f.kind === 'model' || f.kind === 'mongo') && s.drafts[fileKey(f.stepId, f.kind)] !== undefined),
  )
  let text = 'Guardado'
  let cls = 'text-emerald-600'
  if (saving) {
    text = 'Guardando…'
    cls = 'text-slate-500'
  } else if (invalid) {
    text = 'Borrador (con errores)'
    cls = 'text-amber-600'
  } else if (failed) {
    text = 'Sin guardar'
    cls = 'text-red-600'
  } else if (hasDraft) {
    text = 'Editando…'
    cls = 'text-slate-500'
  }
  return (
    <span className={`flex shrink-0 items-center gap-1 text-[11px] font-medium whitespace-nowrap ${cls}`} data-testid="save-status">
      {text === 'Guardado' && <IconCheck width={12} height={12} strokeWidth={2.6} />}
      {text}
    </span>
  )
}
