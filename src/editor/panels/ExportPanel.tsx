import { useMemo, useState } from 'react'
import type { ProjectDto } from '../../core/api.ts'
import { EXPORT_EXTENSIONS, exportInputFrom, runExport, type ExportTarget } from '../../core/export/index.ts'
import { IconCopy, IconDownload } from '../../components/icons.tsx'
import { copyText, downloadText, safeFileName } from '../../lib/download.ts'
import { useEditorStore } from '../store.ts'
import { CodeEditor } from './CodeEditor.tsx'

const LANGUAGE: Record<ExportTarget, 'sql' | 'javascript' | 'dbml'> = { mssql: 'sql', mongo: 'javascript', dbml: 'dbml' }

/** Vista de solo lectura de lo exportado (RF-30, RF-51, RF-52, RF-60). */
export function ExportPanel({ project, target }: { project: ProjectDto; target: ExportTarget }) {
  const model = useEditorStore((s) => s.model)
  const hasErrors = useEditorStore((s) => s.errors.length > 0)
  const [chosenStepId, setStepId] = useState('')
  // El DBML combinado siempre es del proyecto completo.
  const scoped = target !== 'dbml'
  const stepId = scoped ? chosenStepId : ''
  const [idempotent, setIdempotent] = useState(false)
  const [copied, setCopied] = useState(false)

  const text = useMemo(() => {
    if (!model) return ''
    return runExport(target, exportInputFrom(project.name, model, project.steps), {
      stepId: stepId || undefined,
      idempotent: target === 'mssql' && idempotent,
    })
  }, [model, project, target, stepId, idempotent])

  const step = project.steps.find((s) => s.id === stepId)
  const fileName = `${safeFileName(project.name)}${step ? `_${step.slug}` : ''}.${EXPORT_EXTENSIONS[target]}`

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
        {scoped ? (
          <select
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
            value={stepId}
            onChange={(e) => setStepId(e.target.value)}
            aria-label="Alcance de la exportación"
          >
            <option value="">Modelo completo</option>
            {project.steps.map((s) => (
              <option key={s.id} value={s.id}>
                Solo {s.slug}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-slate-500">Modelo completo para dbdiagram.io, con grupos por step</span>
        )}
        {target === 'mssql' && (
          <label className="flex items-center gap-1 text-xs text-slate-600" title="Envuelve cada objeto en IF OBJECT_ID(...) IS NULL">
            <input type="checkbox" checked={idempotent} onChange={(e) => setIdempotent(e.target.checked)} />
            Idempotente
          </label>
        )}
        <div className="ml-auto flex gap-1">
          <button
            className="btn px-2 py-1 text-xs"
            onClick={async () => {
              if (await copyText(text)) {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }
            }}
          >
            <IconCopy width={13} height={13} /> {copied ? '¡Copiado!' : 'Copiar'}
          </button>
          <button className="btn px-2 py-1 text-xs" onClick={() => downloadText(fileName, text)}>
            <IconDownload width={13} height={13} /> .{EXPORT_EXTENSIONS[target]}
          </button>
        </div>
      </div>
      {hasErrors && (
        <p className="shrink-0 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
          Hay errores en el borrador: se exporta el último modelo válido.
        </p>
      )}
      <div className="min-h-0 flex-1">
        <CodeEditor
          path={`file:///export/${target}.${EXPORT_EXTENSIONS[target]}`}
          value={text}
          language={LANGUAGE[target]}
          readOnly
        />
      </div>
    </div>
  )
}
