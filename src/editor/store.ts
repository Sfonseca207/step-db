import { create } from 'zustand'
import { columnTable } from '../core/diff.ts'
import { computeFocus, type Focus, type FocusMode } from './focus.ts'
import type { ColumnModel, Diagnostic, FileKind, ModelDiff, ProjectModel, RelationModel } from '../core/types.ts'

export type { FocusMode } from './focus.ts'

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

/** Contenido del panel lateral: la línea de tiempo de steps o una de las vistas del editor. */
export type SidePanelTab = 'steps' | 'dbml' | 'views' | 'notes' | 'import' | 'mssql' | 'mongo' | 'combined' | 'warnings' | 'history'
export type CodeTab = 'dbml' | 'views' | 'notes'
/** `combined` es el DBML de todo el proyecto (el destino `dbml` de los exportadores). */
export type ExportTab = 'mssql' | 'mongo' | 'combined'

/** Qué muestra la sección de código: los archivos del step elegido o los de todos los steps. */
export type CodeScope = 'step' | 'all'

const CODE_SCOPE_KEY = 'stepdb:code-scope'
function storedCodeScope(): CodeScope {
  try {
    return localStorage.getItem(CODE_SCOPE_KEY) === 'all' ? 'all' : 'step'
  } catch {
    return 'step'
  }
}

export const fileKey = (stepId: string, kind: FileKind) => `${stepId}:${kind}`

export interface GhostColumn {
  token: number
  table: string
  column: ColumnModel
  /** Posición que tenía la columna en la tabla, para dibujarla en su sitio mientras se desvanece. */
  index: number
}

export interface GhostRelation {
  token: number
  relation: RelationModel
}

interface Highlights {
  /** Claves con un token incremental: cambiar el token reinicia la animación. */
  newTables: Record<string, number>
  removedTables: Record<string, number>
  flashColumns: Record<string, number>
  newRelations: Record<string, number>
  /** Columnas y relaciones eliminadas: se conservan un instante para el fade-out. */
  removedColumns: Record<string, GhostColumn>
  removedRelations: Record<string, GhostRelation>
}

/** Duración del glow de "nuevo" y del parpadeo de columnas. */
const HIGHLIGHT_MS = 2400
/** Duración del fade-out de lo eliminado. */
export const REMOVAL_MS = 420

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
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
  /** Versión del servidor sobre la que se empezó cada borrador (control de concurrencia). */
  draftBase: Record<string, number>
  saving: Record<string, 'idle' | 'saving' | 'error'>
  conflict: ConflictState | null

  selectedStepId: string | null
  focusMode: FocusMode
  focusSet: Set<string> | null
  /** Relaciones que quedan a color con el enfoque actual. */
  focusRelations: Set<string> | null
  selectedTable: string | null
  /** Tablas relacionadas con la seleccionada (incluida ella). */
  selectedRelated: Set<string> | null
  hoveredEdge: string | null
  hoverColumns: Record<string, string[]>
  searchOpen: boolean
  sideTab: SidePanelTab
  /** Última pestaña visitada de cada sección con subpestañas: a ella vuelve la barra lateral. */
  lastCodeTab: CodeTab
  lastExportTab: ExportTab
  codeScope: CodeScope
  sidebarOpen: boolean
  showHulls: boolean
  replay: { active: boolean; stepIndex: number; playing: boolean; speed: number } | null
  /** Tablas visibles durante el replay (null = todas). */
  replayVisible: Set<string> | null
  /** Relaciones visibles durante el replay. */
  replayRelations: Set<string> | null
  /** Posición máxima de step visible durante el replay (oculta columnas futuras). */
  replayMaxPos: number | null
  activityOpen: boolean
  /** Estado de la conexión en vivo (WebSocket). */
  live: 'connecting' | 'online' | 'offline'
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
  setDraft(stepId: string, kind: FileKind, content: string | null, baseVersion?: number): void
  setDraftBase(key: string, version: number): void
  setSaving(key: string, state: 'idle' | 'saving' | 'error'): void
  setConflict(conflict: ConflictState | null): void
  selectStep(stepId: string | null): void
  setFocusMode(mode: FocusMode): void
  selectTable(key: string | null): void
  hoverEdge(edgeId: string | null, columns?: Record<string, string[]>): void
  setSearchOpen(open: boolean): void
  /** Cambia el contenido del panel lateral y lo abre si estaba cerrado. */
  setSideTab(tab: SidePanelTab): void
  setCodeScope(scope: CodeScope): void
  setSidebarOpen(open: boolean): void
  toggleHulls(): void
  setReplay(
    replay: EditorState['replay'],
    visible?: { tables: Set<string>; relations: Set<string>; maxPos: number } | null,
  ): void
  toggleActivity(): void
  setLive(live: EditorState['live']): void
  /** Marca lo que cambió para animarlo. `prev` permite conservar lo eliminado durante su fade-out. */
  applyDiff(diff: ModelDiff, prev?: ProjectModel | null): void
  pushToast(toast: Omit<Toast, 'id'>): void
  dismissToast(id: number): void
  requestCenter(tables: string[]): void
  requestReveal(stepId: string, kind: FileKind, line: number): void
}

let seq = 1
const next = () => seq++

const focusState = (f: Focus | null) => ({ focusSet: f?.tables ?? null, focusRelations: f?.relations ?? null })

function computeRelated(model: ProjectModel | null, key: string | null): Set<string> | null {
  if (!key || !model || !model.tables.some((t) => t.key === key)) return null
  const related = new Set([key])
  for (const r of model.relations) {
    if (r.from.table === key) related.add(r.to.table)
    if (r.to.table === key) related.add(r.from.table)
  }
  return related
}

const emptyHighlights = (): Highlights => ({
  newTables: {},
  removedTables: {},
  flashColumns: {},
  newRelations: {},
  removedColumns: {},
  removedRelations: {},
})

export const useEditorStore = create<EditorState>((set, get) => ({
  projectId: null,
  steps: {},
  model: null,
  errors: [],
  warnings: [],
  drafts: {},
  draftBase: {},
  saving: {},
  conflict: null,
  selectedStepId: null,
  focusMode: 'all',
  focusSet: null,
  focusRelations: null,
  selectedTable: null,
  selectedRelated: null,
  hoveredEdge: null,
  hoverColumns: {},
  searchOpen: false,
  sideTab: 'steps',
  lastCodeTab: 'dbml',
  lastExportTab: 'mssql',
  codeScope: storedCodeScope(),
  // En pantallas angostas el panel flota sobre el canvas: arranca cerrado.
  sidebarOpen: typeof window === 'undefined' || window.innerWidth >= 1024,
  showHulls: false,
  replay: null,
  replayVisible: null,
  replayRelations: null,
  replayMaxPos: null,
  activityOpen: false,
  live: 'connecting',
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
      draftBase: {},
      saving: {},
      conflict: null,
      selectedStepId: null,
      focusMode: 'all',
      focusSet: null,
      focusRelations: null,
      selectedTable: null,
      selectedRelated: null,
      hoveredEdge: null,
      hoverColumns: {},
      replay: null,
      replayVisible: null,
      replayRelations: null,
      replayMaxPos: null,
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
      ...focusState(computeFocus(nextModel, s.focusMode, s.selectedStepId)),
      selectedRelated: computeRelated(nextModel, s.selectedTable),
    })
  },
  setWarnings(warnings) {
    set({ warnings })
  },
  setDraft(stepId, kind, content, baseVersion) {
    const key = fileKey(stepId, kind)
    const drafts = { ...get().drafts }
    const draftBase = { ...get().draftBase }
    if (content === null) {
      delete drafts[key]
      delete draftBase[key]
    } else {
      drafts[key] = content
      if (draftBase[key] === undefined && baseVersion !== undefined) draftBase[key] = baseVersion
    }
    set({ drafts, draftBase })
  },
  setDraftBase(key, version) {
    set({ draftBase: { ...get().draftBase, [key]: version } })
  },
  setSaving(key, state) {
    set({ saving: { ...get().saving, [key]: state } })
  },
  setConflict(conflict) {
    set({ conflict })
  },
  selectStep(stepId) {
    const s = get()
    // Sin step seleccionado no hay nada que enfocar: el modo vuelve a "Todos".
    const focusMode = stepId ? s.focusMode : 'all'
    set({
      selectedStepId: stepId,
      focusMode,
      ...focusState(computeFocus(s.model, focusMode, stepId)),
      // Enfocar un step reemplaza la selección de tabla (si no, ambas atenuaciones se cruzan).
      ...(focusMode !== 'all' ? { selectedTable: null, selectedRelated: null } : {}),
    })
  },
  setFocusMode(mode) {
    const s = get()
    set({
      focusMode: mode,
      ...focusState(computeFocus(s.model, mode, s.selectedStepId)),
      selectedTable: null,
      selectedRelated: null,
    })
  },
  selectTable(key) {
    set({ selectedTable: key, selectedRelated: computeRelated(get().model, key) })
  },
  hoverEdge(edgeId, columns) {
    set({ hoveredEdge: edgeId, hoverColumns: columns ?? {} })
  },
  setSearchOpen(open) {
    set({ searchOpen: open })
  },
  setSideTab(tab) {
    set({
      sideTab: tab,
      sidebarOpen: true,
      ...(tab === 'dbml' || tab === 'views' || tab === 'notes' ? { lastCodeTab: tab } : {}),
      ...(tab === 'mssql' || tab === 'mongo' || tab === 'combined' ? { lastExportTab: tab } : {}),
    })
  },
  setCodeScope(scope) {
    set({ codeScope: scope })
    try {
      localStorage.setItem(CODE_SCOPE_KEY, scope)
    } catch {
      // sin almacenamiento: la preferencia dura lo que dure la sesión
    }
  },
  setSidebarOpen(open) {
    set({ sidebarOpen: open })
  },
  toggleHulls() {
    set({ showHulls: !get().showHulls })
  },
  setReplay(replay, visible = null) {
    set({
      replay,
      replayVisible: replay && visible ? visible.tables : null,
      replayRelations: replay && visible ? visible.relations : null,
      replayMaxPos: replay && visible ? visible.maxPos : null,
    })
  },
  toggleActivity() {
    set({ activityOpen: !get().activityOpen })
  },
  setLive(live) {
    if (get().live !== live) set({ live })
  },
  applyDiff(diff, prev) {
    const h = get().highlights
    const token = next()
    const newTables = { ...h.newTables }
    const removedTables = { ...h.removedTables }
    const flashColumns = { ...h.flashColumns }
    const newRelations = { ...h.newRelations }
    const removedColumns = { ...h.removedColumns }
    const removedRelations = { ...h.removedRelations }
    const added = new Set(diff.tables.added)
    const removed = new Set(diff.tables.removed)
    const animateRemovals = !prefersReducedMotion()

    for (const t of diff.tables.added) {
      newTables[t] = token
      delete removedTables[t]
    }
    for (const c of [...diff.columns.added, ...diff.columns.changed]) {
      if (!added.has(columnTable(c))) flashColumns[c] = token
      delete removedColumns[c]
    }
    for (const r of diff.relations.added) {
      newRelations[r] = token
      delete removedRelations[r]
    }
    if (animateRemovals) {
      for (const t of diff.tables.removed) removedTables[t] = token
      if (prev) {
        const prevTables = new Map(prev.tables.map((t) => [t.key, t]))
        for (const c of diff.columns.removed) {
          const tableKey = columnTable(c)
          if (removed.has(tableKey)) continue
          const table = prevTables.get(tableKey)
          const index = table?.columns.findIndex((col) => `${tableKey}.${col.name}` === c) ?? -1
          if (table && index >= 0) removedColumns[c] = { token, table: tableKey, column: table.columns[index], index }
        }
        const prevRelations = new Map(prev.relations.map((r) => [r.id, r]))
        for (const id of diff.relations.removed) {
          const relation = prevRelations.get(id)
          if (relation) removedRelations[id] = { token, relation }
        }
      }
    }
    set({ highlights: { newTables, removedTables, flashColumns, newRelations, removedColumns, removedRelations } })

    // Limpia las marcas cuando termina cada animación.
    const prune = <T,>(rec: Record<string, T>, tokenOf: (v: T) => number) =>
      Object.fromEntries(Object.entries(rec).filter(([, v]) => tokenOf(v) !== token))
    setTimeout(() => {
      const cur = get().highlights
      set({
        highlights: {
          ...cur,
          removedTables: prune(cur.removedTables, (v) => v),
          removedColumns: prune(cur.removedColumns, (v) => v.token),
          removedRelations: prune(cur.removedRelations, (v) => v.token),
        },
      })
    }, REMOVAL_MS)
    setTimeout(() => {
      const cur = get().highlights
      set({
        highlights: {
          ...cur,
          newTables: prune(cur.newTables, (v) => v),
          flashColumns: prune(cur.flashColumns, (v) => v),
          newRelations: prune(cur.newRelations, (v) => v),
        },
      })
    }, HIGHLIGHT_MS)
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

// Solo en desarrollo: acceso al store para QA automatizado (Playwright).
if (import.meta.env.DEV) {
  ;(globalThis as unknown as { __stepdb?: unknown }).__stepdb = { store: useEditorStore }
}
