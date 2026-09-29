import type { ColumnModel, DiffEntry, ModelDiff, ProjectModel, RelationModel, TableModel } from './types.ts'

/**
 * Tabla de un id de columna `schema.tabla.columna`. Las columnas Mongo pueden
 * tener puntos (`respuesta.codigo`), así que la tabla son los dos primeros segmentos.
 */
export function columnTable(columnId: string): string {
  return columnId.split('.').slice(0, 2).join('.')
}

const emptyEntry = (): DiffEntry => ({ added: [], removed: [], changed: [] })

export function emptyDiff(): ModelDiff {
  return { tables: emptyEntry(), columns: emptyEntry(), relations: emptyEntry() }
}

function columnSignature(c: ColumnModel): string {
  return JSON.stringify([c.type, c.pk, c.notNull, c.unique, c.increment, c.default ?? null, c.note ?? null, c.stepId])
}

function tableSignature(t: TableModel): string {
  return JSON.stringify([t.note ?? null, t.headerColor ?? null, t.stepId, t.store, t.indexes])
}

function relationSignature(r: RelationModel): string {
  return JSON.stringify([r.kind, r.op, r.name ?? null, r.onDelete ?? null, r.onUpdate ?? null])
}

/**
 * Diff semántico entre dos modelos. Identidad: `schema.tabla` y
 * `schema.tabla.columna`; las relaciones por su id normalizado.
 */
export function diffModels(prev: ProjectModel | null, next: ProjectModel | null): ModelDiff {
  const diff = emptyDiff()
  const prevTables = new Map((prev?.tables ?? []).map((t) => [t.key, t]))
  const nextTables = new Map((next?.tables ?? []).map((t) => [t.key, t]))

  for (const [key, t] of nextTables) {
    const before = prevTables.get(key)
    if (!before) {
      diff.tables.added.push(key)
      for (const c of t.columns) diff.columns.added.push(`${key}.${c.name}`)
      continue
    }
    if (tableSignature(before) !== tableSignature(t)) diff.tables.changed.push(key)
    const beforeCols = new Map(before.columns.map((c) => [c.name, c]))
    const afterCols = new Map(t.columns.map((c) => [c.name, c]))
    for (const [name, c] of afterCols) {
      const old = beforeCols.get(name)
      if (!old) diff.columns.added.push(`${key}.${name}`)
      else if (columnSignature(old) !== columnSignature(c)) diff.columns.changed.push(`${key}.${name}`)
    }
    for (const name of beforeCols.keys()) if (!afterCols.has(name)) diff.columns.removed.push(`${key}.${name}`)
  }
  for (const [key, t] of prevTables) {
    if (nextTables.has(key)) continue
    diff.tables.removed.push(key)
    for (const c of t.columns) diff.columns.removed.push(`${key}.${c.name}`)
  }

  const prevRels = new Map((prev?.relations ?? []).map((r) => [r.id, r]))
  const nextRels = new Map((next?.relations ?? []).map((r) => [r.id, r]))
  for (const [id, r] of nextRels) {
    const old = prevRels.get(id)
    if (!old) diff.relations.added.push(id)
    else if (relationSignature(old) !== relationSignature(r)) diff.relations.changed.push(id)
  }
  for (const id of prevRels.keys()) if (!nextRels.has(id)) diff.relations.removed.push(id)

  return diff
}

export function isEmptyDiff(diff: ModelDiff): boolean {
  return [diff.tables, diff.columns, diff.relations].every(
    (e) => e.added.length === 0 && e.removed.length === 0 && e.changed.length === 0,
  )
}

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`
}

/**
 * Resumen legible: "+2 tablas, +5 columnas, +3 relaciones, −1 columna".
 * Las columnas de tablas nuevas o borradas no se cuentan aparte.
 */
export function summarizeDiff(diff: ModelDiff): string {
  const addedTables = new Set(diff.tables.added)
  const removedTables = new Set(diff.tables.removed)
  const colsAdded = diff.columns.added.filter((c) => !addedTables.has(columnTable(c))).length
  const colsRemoved = diff.columns.removed.filter((c) => !removedTables.has(columnTable(c))).length
  const parts: string[] = []
  const push = (sign: string, n: number, s: string, p: string) => {
    if (n > 0) parts.push(`${sign}${plural(n, s, p)}`)
  }
  push('+', diff.tables.added.length, 'tabla', 'tablas')
  push('+', colsAdded, 'columna', 'columnas')
  push('+', diff.relations.added.length, 'relación', 'relaciones')
  push('~', diff.tables.changed.length, 'tabla', 'tablas')
  push('~', diff.columns.changed.length, 'columna', 'columnas')
  push('~', diff.relations.changed.length, 'relación', 'relaciones')
  push('−', diff.tables.removed.length, 'tabla', 'tablas')
  push('−', colsRemoved, 'columna', 'columnas')
  push('−', diff.relations.removed.length, 'relación', 'relaciones')
  return parts.length > 0 ? parts.join(', ') : 'sin cambios en el modelo'
}
