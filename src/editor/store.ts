import { create } from 'zustand'
import type { Diagnostic, FileKind, ModelDiff, ProjectModel } from '../core/types.ts'

export type FocusMode = 'all' | 'step' | 'deps'

export interface StepMeta {
  id: string
  slug: string
  name: string
  color: string
  number: string
  position: number
  status: 'en_curso' | 'completado'
}

export interface Toast {
  id: number
  title: string
  body: string
  color?: string
  tables?: string[]
  tone?: 'info' | 'error' | 'success'
}

export type SidePanelTab = 'dbml' | 'views' | 'notes' | 'mssql' | 'mongo' | 'warnings' | 'history'

export const fileKey = (stepId: string, kind: FileKind) => `${stepId}:${kind}`

interface Highlights {
  /** Claves con un token incremental: cambiar el token reinicia la animación. */
  newTables: Record<string, number>
  removedTables: Record<string, number>
  flashColumns: Record<string, number>
  newRelations: Record<string, number>
}

export interface ConflictState {
  stepId: string
  kind: FileKind
  mine: string
  current: { content: string; version: number }
}

interface EditorState {
  projectId: string | null
  steps: Record<string, StepMeta>
  /** Último modelo válido (el canvas nunca queda en blanco por un error). */
  model: ProjectModel | null
  errors: Diagnostic[]
  warnings: Diagnostic[]
  drafts: Record<string, string>
  saving: Record<string, 'idle' | 'saving' | 'error'>
  conflict: ConflictState | null

  selectedStepId: string | null
  focusMode: FocusMode
  focusSet: Set<string> | null
  selectedTable: string | null
  /** Tablas relacionadas con la seleccionada (incluida ella). */
  selectedRelated: Set<string> | null
  hoveredEdge: string | null
  hoverColumns: Record<string, string[]>
  searchOpen: boolean
  sideTab: SidePanelTab
  showHulls: boolean
  replay: { active: boolean; stepIndex: number; playing: boolean; speed: number } | null
  /** Tablas visibles durante el replay (null = todas). */
  replayVisible: Set<string> | null
  highlights: Highlights
  toasts: Toast[]
  /** Petición de centrar el canvas (tabla o step). */
  centerRequest: { tables: string[]; token: number } | null
  /** Petición de abrir un archivo en el editor y saltar a una línea. */
  revealRequest: { stepId: string; kind: FileKind; line: number; token: number } | null

  reset(projectId: string): void
  setSteps(steps: StepMeta[]): void
  setModel(model: ProjectModel | null, errors: Diagnostic[]): void
  setWarnings(warnings: Diagnostic[]): void
  setDraft(stepId: string, kind: FileKind, content: string | null): void
  setSaving(key: string, state: 'idle' | 'saving' | 'error'): void
  setConflict(conflict: ConflictState | null): void
  selectStep(stepId: string | null): void
  setFocusMode(mode: FocusMode): void
  selectTable(key: string | null): void
  hoverEdge(edgeId: string | null, columns?: Record<string, string[]>): void
  setSearchOpen(open: boolean): void
  setSideTab(tab: SidePanelTab): void
  toggleHulls(): void
  setReplay(replay: EditorState['replay'], visible?: Set<string> | null): void
  applyDiff(diff: ModelDiff): void
  pushToast(toast: Omit<Toast, 'id'>): void
  dismissToast(id: number): void
  requestCenter(tables: string[]): void
  requestReveal(stepId: string, kind: FileKind, line: number): void
}

let seq = 1
const next = () => seq++

function computeFocusSet(
  model: ProjectModel | null,
  mode: FocusMode,
  stepId: string | null,
): Set<string> | null {
  if (!model || mode === 'all' || !stepId) return null
  const own = new Set(model.tables.filter((t) => t.stepId === stepId).map((t) => t.key))
  // Tablas de otros steps a las que el step agregó columnas también cuentan como suyas.
  for (const t of model.tables) if (t.columns.some((c) => c.stepId === stepId)) own.add(t.key)
  if (mode === 'step') return own
  const withDeps = new Set(own)
  for (const r of model.relations) {
    if (own.has(r.from.table)) withDeps.add(r.to.table)
    if (own.has(r.to.table)) withDeps.add(r.from.table)
  }
  return withDeps
}

const emptyHighlights = (): Highlights => ({ newTables: {}, removedTables: {}, flashColumns: {}, newRelations: {} })

export const useEditorStore = create<EditorState>((set, get) => ({
  projectId: null,
  steps: {},
  model: null,
  errors: [],
  warnings: [],
  drafts: {},
  saving: {},
  conflict: null,
  selectedStepId: null,
  focusMode: 'all',
  focusSet: null,
  selectedTable: null,
  selectedRelated: null,
  hoveredEdge: null,
  hoverColumns: {},
  searchOpen: false,
  sideTab: 'dbml',
  showHulls: false,
  replay: null,
  replayVisible: null,
  highlights: emptyHighlights(),
  toasts: [],
  centerRequest: null,
  revealRequest: null,

  reset(projectId) {
    set({
      projectId,
      steps: {},
      model: null,
      errors: [],
      warnings: [],
      drafts: {},
      saving: {},
      conflict: null,
      selectedStepId: null,
      focusMode: 'all',
      focusSet: null,
      selectedTable: null,
      selectedRelated: null,
      hoveredEdge: null,
      hoverColumns: {},
      replay: null,
      replayVisible: null,
      highlights: emptyHighlights(),
      toasts: [],
      centerRequest: null,
      revealRequest: null,
    })
  },
  setSteps(steps) {
    set({ steps: Object.fromEntries(steps.map((s) => [s.id, s])) })
  },
  setModel(model, errors) {
    const s = get()
    const nextModel = model ?? s.model
    set({
      model: nextModel,
      errors,
      focusSet: computeFocusSet(nextModel, s.focusMode, s.selectedStepId),
    })
  },
  setWarnings(warnings) {
    set({ warnings })
  },
  setDraft(stepId, kind, content) {
    const key = fileKey(stepId, kind)
    const drafts = { ...get().drafts }
    if (content === null) delete drafts[key]
    else drafts[key] = content
    set({ drafts })
  },
  setSaving(key, state) {
    set({ saving: { ...get().saving, [key]: state } })
  },
  setConflict(conflict) {
    set({ conflict })
  },
  selectStep(stepId) {
    const s = get()
    set({ selectedStepId: stepId, focusSet: computeFocusSet(s.model, s.focusMode, stepId) })
  },
  setFocusMode(mode) {
    const s = get()
    set({ focusMode: mode, focusSet: computeFocusSet(s.model, mode, s.selectedStepId) })
  },
  selectTable(key) {
    const model = get().model
    let related: Set<string> | null = null
    if (key && model) {
      related = new Set([key])
      for (const r of model.relations) {
        if (r.from.table === key) related.add(r.to.table)
        if (r.to.table === key) related.add(r.from.table)
      }
    }
    set({ selectedTable: key, selectedRelated: related })
  },
  hoverEdge(edgeId, columns) {
    set({ hoveredEdge: edgeId, hoverColumns: columns ?? {} })
  },
  setSearchOpen(open) {
    set({ searchOpen: open })
  },
  setSideTab(tab) {
    set({ sideTab: tab })
  },
  toggleHulls() {
    set({ showHulls: !get().showHulls })
  },
  setReplay(replay, visible = null) {
    set({ replay, replayVisible: replay ? visible : null })
  },
  applyDiff(diff) {
    const h = get().highlights
    const token = next()
    const newTables = { ...h.newTables }
    const removedTables = { ...h.removedTables }
    const flashColumns = { ...h.flashColumns }
    const newRelations = { ...h.newRelations }
    const added = new Set(diff.tables.added)
    for (const t of diff.tables.added) newTables[t] = token
    for (const t of diff.tables.removed) removedTables[t] = token
    for (const c of [...diff.columns.added, ...diff.columns.changed]) {
      if (!added.has(c.slice(0, c.lastIndexOf('.')))) flashColumns[c] = token
    }
    for (const r of diff.relations.added) newRelations[r] = token
    set({ highlights: { newTables, removedTables, flashColumns, newRelations } })
    // Limpia las marcas cuando termina la animación.
    setTimeout(() => {
      const cur = get().highlights
      const prune = (rec: Record<string, number>) =>
        Object.fromEntries(Object.entries(rec).filter(([, v]) => v !== token))
      set({
        highlights: {
          newTables: prune(cur.newTables),
          removedTables: prune(cur.removedTables),
          flashColumns: prune(cur.flashColumns),
          newRelations: prune(cur.newRelations),
        },
      })
    }, 2400)
  },
  pushToast(toast) {
    const id = next()
    set({ toasts: [...get().toasts.slice(-3), { ...toast, id }] })
    setTimeout(() => get().dismissToast(id), 6000)
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },
  requestCenter(tables) {
    set({ centerRequest: { tables, token: next() } })
  },
  requestReveal(stepId, kind, line) {
    set({ revealRequest: { stepId, kind, line, token: next() } })
  },
}))
