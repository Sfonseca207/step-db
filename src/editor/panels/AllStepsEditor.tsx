import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectDto, StepDto } from '../../core/api.ts'
import type { FileKind } from '../../core/types.ts'
import { setDraftContent } from '../drafts.ts'
import { fileKey, useEditorStore, type CodeTab } from '../store.ts'
import { CodeEditor } from './CodeEditor.tsx'
import { KIND_LABELS, fileLanguage, filePath, kindsOfTab } from './codeFiles.ts'
import { NewTableButton } from './NewTableButton.tsx'
import { SaveStatus } from './SaveStatus.tsx'

const LINE_HEIGHT = 19

/**
 * Todos los steps a la vez: los archivos de la pestaña, apilados en orden y
 * editables en su sitio. Cada uno se guarda por separado, como en la vista por step.
 */
export function AllStepsEditor({ project, tab }: { project: ProjectDto; tab: CodeTab }) {
  const selectedStepId = useEditorStore((s) => s.selectedStepId)
  const scroller = useRef<HTMLDivElement>(null)
  const steps = useMemo(() => [...project.steps].sort((a, b) => a.position - b.position), [project.steps])

  // Al entrar, o al elegir un step en otra parte, la lista se coloca en su sección.
  useEffect(() => {
    if (!selectedStepId) return
    scroller.current?.querySelector(`[data-step="${selectedStepId}"]`)?.scrollIntoView({ block: 'start' })
  }, [selectedStepId, tab])

  return (
    <div ref={scroller} data-code-scroll className="h-full overflow-y-auto">
      {steps.map((step) => (
        <StepSection key={step.id} project={project} step={step} tab={tab} />
      ))}
    </div>
  )
}

function StepSection({ project, step, tab }: { project: ProjectDto; step: StepDto; tab: CodeTab }) {
  const number = useEditorStore((s) => s.steps[step.id]?.number)
  const kinds = kindsOfTab(tab)
  // En DBML solo se muestran los archivos con contenido (o SQL Server si el step está vacío).
  const withContent = useEditorStore((s) => {
    if (tab !== 'dbml') return tab
    const filled = kinds.filter((k) => (s.drafts[fileKey(step.id, k)] ?? step.files[k].content).trim() !== '')
    return (filled.length > 0 ? filled : ['model']).join(',')
  })
  const revealKind = useEditorStore((s) => (s.revealRequest?.stepId === step.id ? s.revealRequest.kind : null))
  // Un archivo que ya se mostró no desaparece al vaciarlo: se quedaría sin editor a mitad de la edición.
  const [kept, setKept] = useState(withContent)
  const wanted = [...withContent.split(','), ...(revealKind ? [revealKind] : [])]
  const missing = wanted.filter((k) => !kept.split(',').includes(k))
  if (missing.length > 0) setKept([...kept.split(','), ...missing].join(','))
  const shown = kinds.filter((k) => kept.split(',').includes(k) || wanted.includes(k))

  return (
    <section data-step={step.id} className="border-b border-slate-200">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-100 bg-white/95 px-3 py-1.5 backdrop-blur">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: step.color }} />
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800" title={step.slug}>
          {number && <span className="mr-1.5 text-slate-400 tabular-nums">{number}</span>}
          {step.name}
        </h3>
        <SaveStatus files={kinds.map((kind) => ({ stepId: step.id, kind }))} />
      </header>
      {shown.map((kind) => (
        <FileBlock key={kind} project={project} step={step} kind={kind} caption={tab === 'dbml'} />
      ))}
      {tab === 'dbml' && (
        <div className="flex items-center gap-1.5 px-3 pt-1 pb-3">
          <NewTableButton project={project} step={step} kind="model" />
          <NewTableButton project={project} step={step} kind="mongo" />
        </div>
      )}
    </section>
  )
}

function FileBlock({ project, step, kind, caption }: { project: ProjectDto; step: StepDto; kind: FileKind; caption: boolean }) {
  const key = fileKey(step.id, kind)
  const draft = useEditorStore((s) => s.drafts[key])
  const errors = useEditorStore((s) => s.errors)
  const warnings = useEditorStore((s) => s.warnings)
  const revealRequest = useEditorStore((s) => s.revealRequest)
  const value = draft ?? step.files[kind].content
  const diagnostics = useMemo(
    () => [...errors, ...warnings].filter((d) => d.stepId === step.id && d.kind === kind),
    [errors, warnings, step.id, kind],
  )
  const reveal = useMemo(
    () =>
      revealRequest && revealRequest.stepId === step.id && revealRequest.kind === kind
        ? { line: revealRequest.line, token: revealRequest.token }
        : null,
    [revealRequest, step.id, kind],
  )

  // Monaco solo se monta cuando el archivo se acerca a la vista: un proyecto puede tener decenas de steps.
  const holder = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = holder.current
    if (near || !el) return
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), {
      root: el.closest('[data-code-scroll]'),
      rootMargin: '600px 0px',
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [near])
  const estimated = value.split('\n').length * LINE_HEIGHT + 12

  return (
    <div ref={holder}>
      {caption && <p className="px-3 pt-2 text-[10.5px] font-semibold tracking-wider text-slate-400 uppercase">{KIND_LABELS[kind]}</p>}
      {near || reveal ? (
        <CodeEditor
          path={filePath(step.id, kind)}
          value={value}
          language={fileLanguage(kind)}
          diagnostics={diagnostics}
          reveal={reveal}
          autoHeight={estimated}
          onChange={(v) => setDraftContent(project, step.id, kind, v)}
        />
      ) : (
        <div style={{ height: estimated }} />
      )}
    </div>
  )
}
