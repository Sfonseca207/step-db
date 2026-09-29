import type { ProjectModel } from '../core/types.ts'

export type FocusMode = 'all' | 'step' | 'deps'

export interface Focus {
  tables: Set<string>
  relations: Set<string>
}

/**
 * Qué queda a color al enfocar un step (RF-15).
 * - `step`: sus tablas y las tablas de otros steps a las que les agregó columnas.
 * - `deps`: además, las tablas de otros steps con las que se relaciona (por sus
 *   tablas o por las columnas que agregó).
 */
export function computeFocus(model: ProjectModel | null, mode: FocusMode, stepId: string | null): Focus | null {
  if (!model || mode === 'all' || !stepId) return null
  const own = new Set(model.tables.filter((t) => t.stepId === stepId).map((t) => t.key))
  const stepColumns = new Set<string>()
  const tables = new Set(own)
  for (const t of model.tables) {
    if (t.stepId === stepId) continue
    for (const c of t.columns) {
      if (c.stepId === stepId) {
        stepColumns.add(`${t.key}.${c.name}`)
        tables.add(t.key)
      }
    }
  }
  const relations = new Set<string>()
  for (const r of model.relations) {
    const viaTable = own.has(r.from.table) || own.has(r.to.table)
    const viaColumn =
      r.from.columns.some((c) => stepColumns.has(`${r.from.table}.${c}`)) ||
      r.to.columns.some((c) => stepColumns.has(`${r.to.table}.${c}`))
    if (!viaTable && !viaColumn) continue
    if (mode === 'deps') {
      tables.add(r.from.table)
      tables.add(r.to.table)
      relations.add(r.id)
    } else if (tables.has(r.from.table) && tables.has(r.to.table)) {
      relations.add(r.id)
    }
  }
  return { tables, relations }
}
