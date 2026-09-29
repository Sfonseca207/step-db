import { useState } from 'react'
import type { ProjectDto } from '../../core/api.ts'
import { translateParserMessage } from '../../core/messages.ts'
import { IconUpload } from '../../components/icons.tsx'
import { setDraftContent } from '../drafts.ts'
import { fileKey, useEditorStore } from '../store.ts'

const MODES = [
  { id: 'dbml', label: 'DBML' },
  { id: 'ddl', label: 'SQL Server DDL' },
] as const
type Mode = (typeof MODES)[number]['id']

const PLACEHOLDER: Record<Mode, string> = {
  dbml: 'Table ventas.venta {\n  id bigint [pk]\n}',
  ddl: 'CREATE TABLE dbo.Ventas (\n  Id bigint IDENTITY(1,1) PRIMARY KEY\n);',
}

/** Importar DBML (RF-80) o DDL de SQL Server (RF-82) al archivo `model` de un step. */
export function ImportPanel({ project }: { project: ProjectDto }) {
  const selected = useEditorStore((s) => s.selectedStepId)
  /** Step elegido a mano; si no, el seleccionado o el activo. */
  const [chosen, setChosen] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('dbml')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const step =
    project.steps.find((s) => s.id === chosen) ??
    project.steps.find((s) => s.id === (selected ?? project.activeStepId)) ??
    project.steps[0]

  async function doImport() {
    setError(null)
    if (!step || !text.trim()) return
    let dbml = text.trim()
    if (mode === 'ddl') {
      try {
        // El importador de SQL Server pesa varios MB: se descarga solo cuando se usa.
        setBusy(true)
        const { ddlToDbml } = await import('../../core/import.ts')
        dbml = ddlToDbml(text)
      } catch (e) {
        const diags = (e as { diags?: { message: string; location?: { start?: { line: number } } }[] }).diags
        setError(
          diags?.[0]
            ? `Línea ${diags[0].location?.start?.line ?? '?'}: ${translateParserMessage(diags[0].message)}`
            : 'No se pudo convertir el DDL',
        )
        return
      } finally {
        setBusy(false)
      }
    }
    const current = useEditorStore.getState().drafts[fileKey(step.id, 'model')] ?? step.files.model.content
    const header = `// Importado (${mode === 'ddl' ? 'SQL Server DDL' : 'DBML'}) el ${new Date().toLocaleString('es-CO')}`
    const next = `${current.trimEnd()}${current.trim() ? '\n\n' : ''}${header}\n${dbml}\n`
    setDraftContent(project, step.id, 'model', next)
    setText('')
    const s = useEditorStore.getState()
    s.selectStep(step.id)
    s.setSideTab('dbml')
    s.requestReveal(step.id, 'model', current.split('\n').length + 2)
  }

  if (!step) return <div className="p-4 text-sm text-slate-400">Sin steps.</div>

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <p className="shrink-0 text-xs leading-relaxed text-slate-500">
        Se agrega al archivo <b className="font-semibold text-slate-700">model</b> del step elegido. Si algo no parsea, verás el error en
        el editor y nada se guarda hasta corregirlo.
      </p>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: step.color }} />
        <select
          className="min-w-0 flex-1 truncate rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
          value={step.id}
          onChange={(e) => setChosen(e.target.value)}
          aria-label="Step destino"
        >
          {project.steps.map((s) => (
            <option key={s.id} value={s.id}>
              {s.slug}
            </option>
          ))}
        </select>
        <div className="flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="radiogroup" aria-label="Formato de origen">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={mode === m.id}
              className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition ${
                mode === m.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
              onClick={() => {
                setMode(m.id)
                setError(null)
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <textarea
        className="input min-h-40 flex-1 resize-none font-mono text-xs"
        placeholder={PLACEHOLDER[mode]}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Contenido a importar"
        spellCheck={false}
      />
      {error && <p className="shrink-0 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <button className="btn btn-primary shrink-0" onClick={() => void doImport()} disabled={!text.trim() || busy}>
        <IconUpload /> {busy ? 'Convirtiendo…' : `Importar a ${step.slug}`}
      </button>
    </div>
  )
}
