import type { ColumnModel, IndexModel, RelationModel, TableModel } from '../types.ts'
import { orderedSteps, type ExportInput } from './types.ts'

const SIMPLE = /^[A-Za-z_][A-Za-z0-9_]*$/
const id = (s: string) => (SIMPLE.test(s) ? s : `"${s.replace(/"/g, '\\"')}"`)
const tableRef = (key: string) => key.split('.').map(id).join('.')
const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

function columnSettings(c: ColumnModel): string {
  const s: string[] = []
  if (c.pk) s.push('pk')
  if (c.increment) s.push('increment')
  if (c.notNull && !c.pk) s.push('not null')
  if (c.unique) s.push('unique')
  if (c.default) {
    const d = c.default
    const v = d.type === 'string' ? quote(d.value) : d.type === 'expression' ? `\`${d.value}\`` : d.value
    s.push(`default: ${v}`)
  }
  if (c.note) s.push(`note: ${quote(c.note)}`)
  return s.length ? ` [${s.join(', ')}]` : ''
}

function typeText(type: string): string {
  return /^[A-Za-z_][\w.]*(\([^)]*\))?(\[\])?$/.test(type) ? type : `"${type}"`
}

function indexLine(i: IndexModel): string {
  const cols = i.columns.map((c) => (c.startsWith('`') ? c : id(c)))
  const target = cols.length === 1 ? cols[0] : `(${cols.join(', ')})`
  const s: string[] = []
  if (i.pk) s.push('pk')
  if (i.unique) s.push('unique')
  if (i.name) s.push(`name: ${quote(i.name)}`)
  if (i.type) s.push(`type: ${i.type}`)
  return `    ${target}${s.length ? ` [${s.join(', ')}]` : ''}`
}

function refLine(r: RelationModel): string {
  const side = (e: RelationModel['from']) =>
    e.columns.length === 1 ? `${tableRef(e.table)}.${id(e.columns[0])}` : `${tableRef(e.table)}.(${e.columns.map(id).join(', ')})`
  const s: string[] = []
  if (r.onDelete) s.push(`delete: ${r.onDelete}`)
  if (r.onUpdate) s.push(`update: ${r.onUpdate}`)
  return `Ref${r.name ? ` ${id(r.name)}` : ''}: ${side(r.from)} ${r.op} ${side(r.to)}${s.length ? ` [${s.join(', ')}]` : ''}`
}

function tableBlock(t: TableModel, color: string): string {
  const settings = [`headercolor: ${color}`]
  if (t.note) settings.push(`note: ${quote(t.note)}`)
  const lines = [`Table ${tableRef(t.key)} [${settings.join(', ')}] {`]
  for (const c of t.columns) lines.push(`  ${id(c.name)} ${typeText(c.type)}${columnSettings(c)}`)
  if (t.indexes.length > 0) {
    lines.push('', '  indexes {', ...t.indexes.map(indexLine), '  }')
  }
  lines.push('}')
  return lines.join('\n')
}

/**
 * DBML combinado compatible con dbdiagram.io (RF-81): un `TableGroup` por
 * step con su color y `headercolor` en cada tabla.
 */
export function exportCombinedDbml(input: ExportInput): string {
  const steps = orderedSteps(input.steps)
  const color = new Map(steps.map((s) => [s.id, s.color]))
  const out: string[] = [`// ${input.projectName} · DBML combinado (StepDB → dbdiagram.io)`, '']
  for (const e of input.model.enums) {
    out.push(`Enum ${tableRef(e.key)} {`)
    for (const v of e.values) out.push(`  ${id(v.name)}${v.note ? ` [note: ${quote(v.note)}]` : ''}`)
    out.push('}', '')
  }
  for (const step of steps) {
    const tables = input.model.tables.filter((t) => t.stepId === step.id)
    if (tables.length === 0) continue
    out.push(`// Step ${String(step.position).padStart(2, '0')} · ${step.name}`)
    for (const t of tables) out.push(tableBlock(t, color.get(t.stepId) ?? '#94A3B8'), '')
  }
  if (input.model.relations.length > 0) {
    for (const r of input.model.relations) out.push(refLine(r))
    out.push('')
  }
  for (const step of steps) {
    const tables = input.model.tables.filter((t) => t.stepId === step.id)
    if (tables.length === 0) continue
    const name = `step_${String(step.position).padStart(2, '0')}_${step.slug.replace(/^\d+-/, '').replace(/-/g, '_')}`
    out.push(`TableGroup ${id(name)} [color: ${step.color}, note: ${quote(step.name)}] {`)
    for (const t of tables) out.push(`  ${tableRef(t.key)}`)
    out.push('}', '')
  }
  return out.join('\n').trimEnd() + '\n'
}
