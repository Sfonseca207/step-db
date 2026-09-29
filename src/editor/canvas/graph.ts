import type { Edge, Node } from '@xyflow/react'
import type { Diagnostic, ProjectModel, RelationModel, TableModel } from '../../core/types.ts'
import type { StepMeta } from '../store.ts'

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface ColumnRow {
  /** Nombre completo de la columna (identidad y handle). */
  name: string
  label: string
  depth: number
  /** Fila sintética de un subdocumento Mongo no declarado (p. ej. `respuesta`). */
  synthetic: boolean
}

export interface TableNodeData extends Record<string, unknown> {
  table: TableModel
  color: string
  stepNumber: string
  stepName: string
  rows: ColumnRow[]
  /** Color del step de las columnas que vienen de otro step. */
  columnStepColors: Record<string, { color: string; slug: string }>
  fkColumns: string[]
  handleColumns: string[]
  warnings: Diagnostic[]
}

export type TableNode = Node<TableNodeData, 'table'>

export interface RelationEdgeData extends Record<string, unknown> {
  relation: RelationModel
  fromColor: string
  toColor: string
  /** El lado 1 es opcional (0..1) porque la FK admite nulos. */
  optionalOne: boolean
  sourceDir: 1 | -1
  targetDir: 1 | -1
}

export type RelationEdge = Edge<RelationEdgeData, 'relation'>

const HEADER_H = 38
const ROW_H = 22

/** Filas visibles de una tabla: los campos punteados de Mongo se anidan. */
export function columnRows(table: TableModel): ColumnRow[] {
  if (table.store !== 'mongo') {
    return table.columns.map((c) => ({ name: c.name, label: c.name, depth: 0, synthetic: false }))
  }
  const declared = new Set(table.columns.map((c) => c.name))
  const rows: ColumnRow[] = []
  const emitted = new Set<string>()
  for (const c of table.columns) {
    const parts = c.name.split('.')
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('.')
      if (!declared.has(parent) && !emitted.has(parent)) {
        emitted.add(parent)
        rows.push({ name: parent, label: parts[i - 1], depth: i - 1, synthetic: true })
      }
    }
    emitted.add(c.name)
    rows.push({ name: c.name, label: parts[parts.length - 1], depth: parts.length - 1, synthetic: false })
  }
  return rows
}

export function estimateSize(table: TableModel): Size {
  const rows = columnRows(table)
  const longest = Math.max(
    table.key.length + 6,
    ...rows.map((r) => r.label.length + r.depth * 2 + (table.columns.find((c) => c.name === r.name)?.type.length ?? 6) + 8),
  )
  return {
    width: Math.round(Math.min(420, Math.max(230, longest * 7.4 + 40))),
    height: HEADER_H + rows.length * ROW_H + 10,
  }
}

export function buildNodes(
  model: ProjectModel,
  steps: Record<string, StepMeta>,
  positions: Record<string, Point>,
  warnings: Diagnostic[],
): TableNode[] {
  const fkByTable = new Map<string, Set<string>>()
  const handleByTable = new Map<string, Set<string>>()
  const add = (map: Map<string, Set<string>>, table: string, cols: string[]) => {
    let set = map.get(table)
    if (!set) map.set(table, (set = new Set()))
    for (const c of cols) set.add(c)
  }
  for (const r of model.relations) {
    add(fkByTable, r.from.table, r.from.columns)
    add(handleByTable, r.from.table, r.from.columns)
    add(handleByTable, r.to.table, r.to.columns)
  }
  const warnByTable = new Map<string, Diagnostic[]>()
  for (const w of warnings) {
    if (!w.table) continue
    const list = warnByTable.get(w.table) ?? []
    list.push(w)
    warnByTable.set(w.table, list)
  }

  return model.tables.map((t) => {
    const step = steps[t.stepId]
    const columnStepColors: TableNodeData['columnStepColors'] = {}
    for (const c of t.columns) {
      if (c.stepId !== t.stepId && steps[c.stepId]) {
        columnStepColors[c.name] = { color: steps[c.stepId].color, slug: steps[c.stepId].slug }
      }
    }
    const size = estimateSize(t)
    return {
      id: t.key,
      type: 'table',
      position: positions[t.key] ?? { x: 0, y: 0 },
      // Tamaño estimado hasta que React Flow mida el nodo (fitView y render de solo lo visible).
      initialWidth: size.width,
      initialHeight: size.height,
      data: {
        table: t,
        color: step?.color ?? '#94A3B8',
        stepNumber: step?.number ?? '··',
        stepName: step?.name ?? '',
        rows: columnRows(t),
        columnStepColors,
        fkColumns: [...(fkByTable.get(t.key) ?? [])],
        handleColumns: [...(handleByTable.get(t.key) ?? [])],
        warnings: warnByTable.get(t.key) ?? [],
      },
    }
  })
}

/** Aristas columna a columna; cada extremo usa el lado más cercano de su nodo. */
export function buildEdges(
  model: ProjectModel,
  steps: Record<string, StepMeta>,
  centers: Map<string, { cx: number; left: number; right: number }>,
): RelationEdge[] {
  const tables = new Map(model.tables.map((t) => [t.key, t]))
  const edges: RelationEdge[] = []
  for (const r of model.relations) {
    const from = tables.get(r.from.table)
    const to = tables.get(r.to.table)
    if (!from || !to) continue
    const a = centers.get(from.key)
    const b = centers.get(to.key)
    let sourceSide: 'L' | 'R' = 'R'
    let targetSide: 'L' | 'R' = 'L'
    if (from.key === to.key) {
      sourceSide = 'R'
      targetSide = 'R'
    } else if (a && b) {
      if (b.left > a.right) [sourceSide, targetSide] = ['R', 'L']
      else if (a.left > b.right) [sourceSide, targetSide] = ['L', 'R']
      else [sourceSide, targetSide] = a.cx <= b.cx ? ['R', 'R'] : ['L', 'L']
    }
    const fromCol = r.from.columns[0]
    const toCol = r.to.columns[0]
    const optionalOne = r.from.columns.some((c) => !from.columns.find((x) => x.name === c)?.notNull)
    edges.push({
      id: r.id,
      type: 'relation',
      source: from.key,
      target: to.key,
      sourceHandle: `s:${sourceSide}:${fromCol}`,
      targetHandle: `t:${targetSide}:${toCol}`,
      data: {
        relation: r,
        fromColor: steps[from.stepId]?.color ?? '#94A3B8',
        toColor: steps[to.stepId]?.color ?? '#94A3B8',
        optionalOne,
        sourceDir: sourceSide === 'R' ? 1 : -1,
        targetDir: targetSide === 'R' ? 1 : -1,
      },
    })
  }
  return edges
}
