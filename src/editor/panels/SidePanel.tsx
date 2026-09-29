import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ProjectDto } from '../../core/api.ts'
import { LINT_RULE_LABELS } from '../../core/lint.ts'
import { formatDiagnostic } from '../../core/model.ts'
import type { DbmlKind, FileKind } from '../../core/types.ts'
import { setDraftContent } from '../drafts.ts'
import { fileKey, useEditorStore, type SidePanelTab } from '../store.ts'
import { CodeEditor } from './CodeEditor.tsx'
import { ExportPanel } from './ExportPanel.tsx'
import { HistoryPanel } from './HistoryPanel.tsx'
import { NewTableButton } from './NewTableButton.tsx'

const TABS: { id: SidePanelTab; label: string }[] = [
  { id: 'dbml', label: 'DBML' },
  { id: 'views', label: 'Vistas' },
  { id: 'notes', label: 'Notas' },
  { id: 'mssql', label: 'SQL Server' },
  { id: 'mongo', label: 'Mongo' },
  { id: 'warnings', label: '⚠' },
  { id: 'history', label: 'Historial' },
]

function SaveStatus({ stepId, kind }: { stepId: string; kind: FileKind }) {
  const key = fileKey(stepId, kind)
  const hasDraft = useEditorStore((s) => s.drafts[key] !== undefined)
  const saving = useEditorStore((s) => s.saving[key] ?? 'idle')
  const invalid = useEditorStore((s) => s.errors.length > 0 && (kind === 'model' || kind === 'mongo'))
  let text = 'Guardado'
  let cls = 'text-emerald-600'
  if (saving === 'saving') {
    text = 'Guardando…'
    cls = 'text-slate-500'
  } else if (hasDraft && invalid) {
    text = 'Borrador (con errores)'
    cls = 'text-amber-600'
  } else if (saving === 'error' && hasDraft) {
    text = 'Sin guardar'
    cls = 'text-red-600'
  } else if (hasDraft) {
    text = 'Editando…'
    cls = 'text-slate-500'
  }
  return (
    <span className={`text-[11px] font-medium ${cls}`} data-testid="save-status">
      {text === 'Guardado' ? '✓ ' : ''}
      {text}
    </span>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2 py-0.5 text-xs font-medium transition ${
        active ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  )
}

export function SidePanel({ project }: { project: ProjectDto }) {
  const tab = useEditorStore((s) => s.sideTab)
  const setTab = useEditorStore((s) => s.setSideTab)
  const selectedStepId = useEditorStore((s) => s.selectedStepId)
  const selectStep = useEditorStore((s) => s.selectStep)
  const drafts = useEditorStore((s) => s.drafts)
  const errors = useEditorStore((s) => s.errors)
  const warnings = useEditorStore((s) => s.warnings)
  const model = useEditorStore((s) => s.model)
  const revealRequest = useEditorStore((s) => s.revealRequest)
  const [dbmlKind, setDbmlKind] = useState<DbmlKind>('model')

  const stepId = selectedStepId ?? project.activeStepId ?? project.steps[0]?.id
  const step = project.steps.find((s) => s.id === stepId) ?? project.steps[0]

  // Ir a la definición: cambia al archivo pedido.
  useEffect(() => {
    if (!revealRequest) return
    const kind = revealRequest.kind
    if (kind === 'model' || kind === 'mongo') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- responde a una petición externa (doble clic en el canvas)
      setDbmlKind(kind)
    }
  }, [revealRequest])

  // Al cambiar de step, abre el archivo que tenga contenido (p. ej. un step solo Mongo).
  const stepForKind = step?.id
  const onlyMongo = step ? step.files.model.content.trim() === '' && step.files.mongo.content.trim() !== '' : false
  useEffect(() => {
    if (!stepForKind) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- elige el archivo inicial del step seleccionado
    setDbmlKind(onlyMongo ? 'mongo' : 'model')
  }, [stepForKind, onlyMongo])

  const counts = useMemo(() => {
    const tables = model?.tables.filter((t) => t.stepId === step?.id) ?? []
    return {
      model: tables.filter((t) => t.store === 'sqlserver').length,
      mongo: tables.filter((t) => t.store === 'mongo').length,
    }
  }, [model, step])

  if (!step) return <div className="p-4 text-sm text-slate-400">Sin steps.</div>

  const editKind: FileKind = tab === 'dbml' ? dbmlKind : tab === 'views' ? 'views' : 'notes'
  const serverContent = step.files[editKind].content
  const value = drafts[fileKey(step.id, editKind)] ?? serverContent
  const fileDiagnostics = [
    ...errors.filter((d) => d.stepId === step.id && d.kind === editKind),
    ...warnings.filter((d) => d.stepId === step.id && d.kind === editKind),
  ]
  const reveal =
    revealRequest && revealRequest.stepId === step.id && revealRequest.kind === editKind
      ? { line: revealRequest.line, token: revealRequest.token }
      : null
  const isEditable = tab === 'dbml' || tab === 'views' || tab === 'notes'

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="sdb-no-scrollbar flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-slate-200 px-2 pt-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative rounded-t-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition ${
              tab === t.id ? 'bg-white text-slate-900' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.id === 'warnings' ? `⚠ ${warnings.length}` : t.label}
            {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-slate-900" />}
          </button>
        ))}
      </div>

      {(isEditable || tab === 'history') && (
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 py-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: step.color }} />
          <select
            className="min-w-0 flex-1 truncate rounded-md border-none bg-transparent py-0.5 text-sm font-medium text-slate-800 focus:ring-2 focus:ring-slate-200"
            value={step.id}
            onChange={(e) => selectStep(e.target.value)}
            aria-label="Step del archivo"
          >
            {project.steps.map((s) => (
              <option key={s.id} value={s.id}>
                {s.slug}
              </option>
            ))}
          </select>
          {isEditable && <SaveStatus stepId={step.id} kind={editKind} />}
        </div>
      )}

      {tab === 'dbml' && (
        <div className="flex shrink-0 items-center gap-1 px-3 py-1.5">
          <Chip active={dbmlKind === 'model'} onClick={() => setDbmlKind('model')}>
            SQL Server · {counts.model}
          </Chip>
          <Chip active={dbmlKind === 'mongo'} onClick={() => setDbmlKind('mongo')}>
            Mongo · {counts.mongo}
          </Chip>
          <div className="ml-auto">
            <NewTableButton project={project} step={step} kind={dbmlKind} />
          </div>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {isEditable && (
          <CodeEditor
            path={`file:///${step.id}/${editKind}.${editKind === 'views' ? 'sql' : editKind === 'notes' ? 'md' : 'dbml'}`}
            value={value}
            language={editKind === 'views' ? 'sql' : editKind === 'notes' ? 'markdown' : 'dbml'}
            diagnostics={fileDiagnostics}
            reveal={reveal}
            onChange={(v) => setDraftContent(project, step.id, editKind, v)}
          />
        )}
        {tab === 'mssql' && <ExportPanel project={project} target="mssql" />}
        {tab === 'mongo' && <ExportPanel project={project} target="mongo" />}
        {tab === 'history' && <HistoryPanel project={project} step={step} />}
        {tab === 'warnings' && (
          <div className="h-full overflow-y-auto p-3">
            {warnings.length === 0 ? (
              <p className="p-4 text-center text-sm text-slate-400">Sin advertencias del linter. ✨</p>
            ) : (
              <ul className="space-y-1.5">
                {warnings.map((w, i) => (
                  <li key={i}>
                    <button
                      className="w-full rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-left text-xs text-amber-900 transition hover:bg-amber-50"
                      onClick={() => {
                        if (w.stepId && w.kind && w.line) {
                          selectStep(w.stepId)
                          setTab('dbml')
                          useEditorStore.getState().requestReveal(w.stepId, w.kind, w.line)
                        }
                        if (w.table) useEditorStore.getState().requestCenter([w.table])
                      }}
                    >
                      <span className="text-[10.5px] font-semibold tracking-wide text-amber-700 uppercase">
                        {LINT_RULE_LABELS[w.code ?? ''] ?? w.code}
                      </span>
                      <span className="block">{formatDiagnostic({ ...w, stepSlug: project.steps.find((s) => s.id === w.stepId)?.slug })}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
