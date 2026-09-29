import { useMemo, useState, type ReactNode } from 'react'
import { IconCheck } from '../../components/icons.tsx'
import type { ProjectDto } from '../../core/api.ts'
import { LINT_RULE_LABELS } from '../../core/lint.ts'
import { formatDiagnostic } from '../../core/model.ts'
import type { DbmlKind, FileKind } from '../../core/types.ts'
import { setDraftContent } from '../drafts.ts'
import { fileKey, useEditorStore, type CodeTab, type ExportTab } from '../store.ts'
import { AllStepsEditor } from './AllStepsEditor.tsx'
import { CodeEditor } from './CodeEditor.tsx'
import { ALL_STEPS, fileLanguage, filePath, kindsOfTab } from './codeFiles.ts'
import { ExportPanel } from './ExportPanel.tsx'
import { HistoryPanel } from './HistoryPanel.tsx'
import { ImportPanel } from './ImportPanel.tsx'
import { NewTableButton } from './NewTableButton.tsx'
import { SaveStatus } from './SaveStatus.tsx'
import { sectionOf } from './sections.ts'
import { StepsPanel } from './StepsPanel.tsx'

const CODE_TABS: { id: CodeTab; label: string }[] = [
  { id: 'dbml', label: 'DBML' },
  { id: 'views', label: 'Vistas' },
  { id: 'notes', label: 'Notas' },
]
const EXPORT_TABS: { id: ExportTab; label: string }[] = [
  { id: 'mssql', label: 'SQL Server' },
  { id: 'mongo', label: 'Mongo' },
  { id: 'combined', label: 'DBML' },
]

/** Encabezado de sección: título a la izquierda y, si las hay, subpestañas a la derecha. */
function SectionHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4">
      <h2 className="text-xs font-semibold tracking-wider whitespace-nowrap text-slate-500 uppercase">{title}</h2>
      {children}
    </div>
  )
}

function Segmented<T extends string>(props: { label: string; value: T; options: { id: T; label: string }[]; onChange: (id: T) => void }) {
  return (
    <div className="flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={props.value === o.id}
          onClick={() => props.onChange(o.id)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition ${
            props.value === o.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap transition ${
        active ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  )
}

/** Panel lateral único: la línea de tiempo de steps o una de las vistas del editor. */
export function SidePanel({ project }: { project: ProjectDto }) {
  const steps = useEditorStore((s) => s.sideTab === 'steps')
  return steps ? <StepsPanel project={project} /> : <EditorPanel project={project} />
}

function EditorPanel({ project }: { project: ProjectDto }) {
  const tab = useEditorStore((s) => s.sideTab)
  const setTab = useEditorStore((s) => s.setSideTab)
  const selectedStepId = useEditorStore((s) => s.selectedStepId)
  const selectStep = useEditorStore((s) => s.selectStep)
  const codeScope = useEditorStore((s) => s.codeScope)
  const setCodeScope = useEditorStore((s) => s.setCodeScope)
  const drafts = useEditorStore((s) => s.drafts)
  const errors = useEditorStore((s) => s.errors)
  const warnings = useEditorStore((s) => s.warnings)
  const model = useEditorStore((s) => s.model)
  const revealRequest = useEditorStore((s) => s.revealRequest)
  /** Archivo DBML elegido a mano (chips), por step. */
  const [choice, setChoice] = useState<{ stepId: string; kind: DbmlKind; after: number } | null>(null)

  const stepId = selectedStepId ?? project.activeStepId ?? project.steps[0]?.id
  const step = project.steps.find((s) => s.id === stepId) ?? project.steps[0]

  // Qué archivo DBML se muestra: lo último entre la elección manual y un "ir a la definición";
  // si no hay ninguno, el archivo que tenga contenido (p. ej. un step solo Mongo).
  const requested =
    revealRequest && step && revealRequest.stepId === step.id && (revealRequest.kind === 'model' || revealRequest.kind === 'mongo')
      ? { kind: revealRequest.kind, token: revealRequest.token }
      : null
  const onlyMongo = step ? step.files.model.content.trim() === '' && step.files.mongo.content.trim() !== '' : false
  const chosen = choice && step && choice.stepId === step.id && (!requested || choice.after > requested.token) ? choice.kind : null
  const dbmlKind: DbmlKind = chosen ?? requested?.kind ?? (onlyMongo ? 'mongo' : 'model')
  const setDbmlKind = (kind: DbmlKind) => {
    if (step) setChoice({ stepId: step.id, kind, after: (revealRequest?.token ?? 0) + 0.5 })
  }

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
  const section = sectionOf(tab)
  const isEditable = section === 'code'
  /** Todos los steps a la vez (solo en las pestañas de código). */
  const allSteps = isEditable && codeScope === 'all'

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {section === 'code' && (
        <SectionHeader title="Código">
          <Segmented label="Archivo del step" value={tab as CodeTab} options={CODE_TABS} onChange={setTab} />
        </SectionHeader>
      )}
      {section === 'export' && (
        <SectionHeader title="Exportar">
          <Segmented label="Destino de la exportación" value={tab as ExportTab} options={EXPORT_TABS} onChange={setTab} />
        </SectionHeader>
      )}
      {section === 'import' && <SectionHeader title="Importar" />}
      {section === 'warnings' && <SectionHeader title={`Advertencias · ${warnings.length}`} />}
      {section === 'history' && <SectionHeader title="Historial" />}

      {(isEditable || tab === 'history') && (
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 py-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: allSteps ? `conic-gradient(${project.steps.map((s) => s.color).join(', ')})` : step.color }}
          />
          <select
            className="min-w-0 flex-1 truncate rounded-md border-none bg-transparent py-0.5 text-sm font-medium text-slate-800 focus:ring-2 focus:ring-slate-200"
            value={allSteps ? ALL_STEPS : step.id}
            onChange={(e) => {
              const all = e.target.value === ALL_STEPS
              if (isEditable) setCodeScope(all ? 'all' : 'step')
              if (!all) selectStep(e.target.value)
            }}
            aria-label="Step del archivo"
          >
            {isEditable && <option value={ALL_STEPS}>Todos los steps</option>}
            {project.steps.map((s) => (
              <option key={s.id} value={s.id}>
                {s.slug}
              </option>
            ))}
          </select>
          {isEditable && (
            <SaveStatus
              files={
                allSteps
                  ? project.steps.flatMap((s) => kindsOfTab(tab as CodeTab).map((kind) => ({ stepId: s.id, kind })))
                  : [{ stepId: step.id, kind: editKind }]
              }
            />
          )}
        </div>
      )}

      {tab === 'dbml' && !allSteps && (
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
        {allSteps && <AllStepsEditor project={project} tab={tab as CodeTab} />}
        {isEditable && !allSteps && (
          <CodeEditor
            path={filePath(step.id, editKind)}
            value={value}
            language={fileLanguage(editKind)}
            diagnostics={fileDiagnostics}
            reveal={reveal}
            onChange={(v) => setDraftContent(project, step.id, editKind, v)}
          />
        )}
        {tab === 'mssql' && <ExportPanel project={project} target="mssql" />}
        {tab === 'mongo' && <ExportPanel project={project} target="mongo" />}
        {tab === 'combined' && <ExportPanel project={project} target="dbml" />}
        {tab === 'import' && <ImportPanel project={project} />}
        {tab === 'history' && <HistoryPanel project={project} step={step} />}
        {tab === 'warnings' && (
          <div className="h-full overflow-y-auto p-3">
            {warnings.length === 0 ? (
              <p className="flex items-center justify-center gap-1.5 p-4 text-sm text-slate-400">
                <IconCheck className="text-emerald-600" />
                Sin advertencias del linter.
              </p>
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
