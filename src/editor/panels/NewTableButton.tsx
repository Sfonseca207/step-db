import type { ProjectDto, StepDto } from '../../core/api.ts'
import type { DbmlKind } from '../../core/types.ts'
import { IconPlus } from '../../components/icons.tsx'
import { setDraftContent } from '../drafts.ts'
import { tableTemplate } from '../templates.ts'
import { fileKey, useEditorStore } from '../store.ts'

export function NewTableButton({ project, step, kind }: { project: ProjectDto; step: StepDto; kind: DbmlKind }) {
  function insert() {
    const state = useEditorStore.getState()
    const existing = new Set(state.model?.tables.map((t) => t.key) ?? [])
    const { key, text } = tableTemplate(project.conventions, kind, existing)
    const current = state.drafts[fileKey(step.id, kind)] ?? step.files[kind].content
    const sep = current.length === 0 || current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n'
    const next = `${current}${sep}${text}`
    setDraftContent(project, step.id, kind, next)
    const line = next.split('\n').length - text.split('\n').length + 1
    state.requestReveal(step.id, kind, line)
    setTimeout(() => {
      useEditorStore.getState().selectTable(key)
      useEditorStore.getState().requestCenter([key])
    }, 450)
  }
  return (
    <button className="btn px-2 py-0.5 text-xs whitespace-nowrap" onClick={insert} title="Insertar una tabla que respeta las convenciones">
      <IconPlus width={12} height={12} />
      {kind === 'mongo' ? 'Nueva colección' : 'Nueva tabla'}
    </button>
  )
}
