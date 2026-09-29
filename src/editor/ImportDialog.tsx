import { useState } from 'react'
import { Modal } from '../components/ConfirmDialog.tsx'
import type { ProjectDto } from '../core/api.ts'
import { ddlToDbml } from '../core/import.ts'
import { translateParserMessage } from '../core/messages.ts'
import { setDraftContent } from './drafts.ts'
import { fileKey, useEditorStore } from './store.ts'

/** Importar DBML (RF-80) o DDL de SQL Server (RF-82) al archivo `model` de un step. */
export function ImportDialog({ project, onClose }: { project: ProjectDto; onClose: () => void }) {
  const selected = useEditorStore((s) => s.selectedStepId)
  const [stepId, setStepId] = useState(selected ?? project.activeStepId ?? project.steps[0]?.id ?? '')
  const [mode, setMode] = useState<'dbml' | 'ddl'>('dbml')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  function doImport() {
    setError(null)
    const step = project.steps.find((s) => s.id === stepId)
    if (!step || !text.trim()) return
    let dbml = text.trim()
    if (mode === 'ddl') {
      try {
        dbml = ddlToDbml(text)
      } catch (e) {
        const diags = (e as { diags?: { message: string; location?: { start?: { line: number } } }[] }).diags
        setError(
          diags?.[0]
            ? `Línea ${diags[0].location?.start?.line ?? '?'}: ${translateParserMessage(diags[0].message)}`
            : 'No se pudo convertir el DDL',
        )
        return
      }
    }
    const current = useEditorStore.getState().drafts[fileKey(step.id, 'model')] ?? step.files.model.content
    const header = `// Importado (${mode === 'ddl' ? 'SQL Server DDL' : 'DBML'}) el ${new Date().toLocaleString('es-CO')}`
    const next = `${current.trimEnd()}${current.trim() ? '\n\n' : ''}${header}\n${dbml}\n`
    setDraftContent(project, step.id, 'model', next)
    const s = useEditorStore.getState()
    s.selectStep(step.id)
    s.setSideTab('dbml')
    s.requestReveal(step.id, 'model', current.split('\n').length + 2)
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-base font-semibold text-slate-900">Importar al modelo</h2>
      <p className="mt-1 text-sm text-slate-500">
        Se agrega al archivo <b>model</b> del step elegido. Si algo no parsea, verás el error en el editor y nada se guarda hasta
        corregirlo.
      </p>
      <div className="mt-4 flex gap-2">
        <select className="input" value={stepId} onChange={(e) => setStepId(e.target.value)} aria-label="Step destino">
          {project.steps.map((s) => (
            <option key={s.id} value={s.id}>
              {s.slug}
            </option>
          ))}
        </select>
        <div className="flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {(['dbml', 'ddl'] as const).map((m) => (
            <button
              key={m}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${mode === m ? 'bg-white shadow-sm' : 'text-slate-500'}`}
              onClick={() => setMode(m)}
            >
              {m === 'dbml' ? 'DBML' : 'SQL Server DDL'}
            </button>
          ))}
        </div>
      </div>
      <textarea
        autoFocus
        className="input mt-3 h-56 font-mono text-xs"
        placeholder={mode === 'dbml' ? 'Table ventas.venta {\n  id bigint [pk]\n}' : 'CREATE TABLE dbo.Ventas (\n  Id bigint IDENTITY(1,1) PRIMARY KEY\n);'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Contenido a importar"
      />
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={doImport} disabled={!text.trim()}>
          Importar
        </button>
      </div>
    </Modal>
  )
}
