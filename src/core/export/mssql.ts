import type { ColumnModel, EnumModel, IndexModel, RelationModel, TableModel } from '../types.ts'
import { formatWorkDate, orderedSteps, type ExportInput, type ExportOptions, type ExportStep } from './types.ts'

const q = (name: string) => `[${name.replace(/]/g, ']]')}]`
const qt = (t: { schema: string; name: string }) => `${q(t.schema)}.${q(t.name)}`
const str = (s: string) => `N'${s.replace(/'/g, "''")}'`
const ident = (s: string) => s.replace(/[^A-Za-z0-9_]/g, '_')

/** Hash corto y estable (FNV-1a) para acortar nombres sin perder unicidad. */
function shortHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Nombre de constraint o índice: SQL Server admite hasta 128 caracteres. */
export function objectName(prefix: string, ...parts: string[]): string {
  const name = [prefix, ...parts.map(ident)].join('_')
  return name.length <= 128 ? name : `${name.slice(0, 119)}_${shortHash(name)}`
}

function defaultSql(c: ColumnModel): string | null {
  const d = c.default
  if (!d) return null
  switch (d.type) {
    case 'number':
      return `DEFAULT (${d.value})`
    case 'boolean':
      return `DEFAULT (${d.value === 'true' ? 1 : 0})`
    case 'string':
      return `DEFAULT (${str(d.value)})`
    default:
      return `DEFAULT (${d.value})`
  }
}

function columnSql(c: ColumnModel, inlinePk: boolean, enums: Map<string, EnumModel>): string {
  const en = c.enumRef ? enums.get(c.enumRef) : undefined
  const parts = [q(c.name), en ? 'NVARCHAR(255)' : c.type]
  if (c.increment) parts.push('IDENTITY(1, 1)')
  if (inlinePk && c.pk) parts.push('PRIMARY KEY')
  else if (c.notNull) parts.push('NOT NULL')
  else parts.push('NULL')
  if (c.unique && !c.pk) parts.push('UNIQUE')
  const def = defaultSql(c)
  if (def) parts.push(def)
  if (en) parts.push(`CHECK (${q(c.name)} IN (${en.values.map((v) => str(v.name)).join(', ')}))`)
  return parts.join(' ')
}

function pkColumns(t: TableModel): string[] {
  const idx = t.indexes.find((i) => i.pk)
  if (idx) return idx.columns
  return t.columns.filter((c) => c.pk).map((c) => c.name)
}

function stepHeader(step: ExportStep, title = 'Step'): string {
  const lines = [
    '-- ' + '='.repeat(72),
    `-- ${title} ${String(step.position).padStart(2, '0')} · ${step.name} (${formatWorkDate(step.workDate)})`,
  ]
  if (step.description) for (const l of step.description.split('\n')) lines.push(`-- ${l}`)
  lines.push('-- ' + '='.repeat(72))
  return lines.join('\n')
}

function section(title: string): string {
  return `-- ${'-'.repeat(72)}\n-- ${title}\n-- ${'-'.repeat(72)}`
}

/** Paso donde se crea un índice: el más tardío entre sus columnas. */
function indexStep(t: TableModel, idx: IndexModel, pos: Map<string, number>): string {
  let best = t.stepId
  for (const colName of idx.columns) {
    const c = t.columns.find((x) => x.name === colName)
    if (c && (pos.get(c.stepId) ?? 0) > (pos.get(best) ?? 0)) best = c.stepId
  }
  return best
}

/** Paso "dueño" de una FK: el de la columna hija. */
function relationStep(r: RelationModel, child: TableModel): string {
  const c = child.columns.find((x) => x.name === r.from.columns[0])
  return c?.stepId ?? child.stepId
}

/** Divide el SQL de vistas en lotes (por `GO` o por cada `CREATE VIEW`). */
export function splitViewBatches(sql: string): string[] {
  const trimmed = sql.trim()
  if (!trimmed) return []
  if (/^\s*GO\s*$/im.test(trimmed)) {
    return trimmed
      .split(/^\s*GO\s*$/im)
      .map((b) => b.trim())
      .filter(Boolean)
  }
  return trimmed
    .split(/(?=^\s*CREATE\s+(?:OR\s+ALTER\s+)?VIEW\b)/im)
    .map((b) => b.trim())
    .filter(Boolean)
}

/**
 * T-SQL de SQL Server (RF-50/51/52). Completo o por step (incremental:
 * tablas del step, columnas que agregó a tablas anteriores y sus FKs).
 */
export function exportMssql(input: ExportInput, opts: ExportOptions = {}): string {
  const steps = orderedSteps(input.steps)
  const pos = new Map(steps.map((s) => [s.id, s.position]))
  const onlyStep = opts.stepId ? steps.find((s) => s.id === opts.stepId) : undefined
  const inScope = (stepId: string) => !onlyStep || stepId === onlyStep.id
  const sqlTables = input.model.tables.filter((t) => t.store === 'sqlserver')
  const tableByKey = new Map(sqlTables.map((t) => [t.key, t]))
  const enums = new Map(input.model.enums.map((e) => [e.key, e]))
  const idem = Boolean(opts.idempotent)
  const out: string[] = []
  const batch = (sql: string) => out.push(`${sql}\nGO\n`)

  out.push(
    [
      `-- ${input.projectName} · SQL Server`,
      `-- Generado por StepDB. ${onlyStep ? `Script incremental del step ${onlyStep.slug}.` : 'Modelo completo.'}${idem ? ' Idempotente.' : ''}`,
      '-- Las colecciones MongoDB y sus referencias lógicas no se incluyen.',
      '',
    ].join('\n'),
  )

  // Schemas
  const tablesInScope = sqlTables.filter((t) => inScope(t.stepId))
  const addedColumns = onlyStep
    ? sqlTables.flatMap((t) => (t.stepId !== onlyStep.id ? t.columns.filter((c) => c.stepId === onlyStep.id).map((c) => ({ t, c })) : []))
    : []
  const schemas = [...new Set(tablesInScope.map((t) => t.schema))].filter((s) => s !== 'dbo')
  if (schemas.length > 0) {
    out.push(section('Schemas'))
    for (const s of schemas) {
      batch(`IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = ${str(s)})\n  EXEC(${str(`CREATE SCHEMA ${q(s)}`)});`)
    }
  }

  // Tablas por step
  for (const step of steps) {
    if (!inScope(step.id)) continue
    const own = sqlTables.filter((t) => t.stepId === step.id)
    const added = onlyStep ? addedColumns : []
    if (own.length === 0 && added.length === 0) continue
    out.push(stepHeader(step))
    for (const t of own) {
      // Completo: todas las columnas. Por step: solo las que existen hasta este step.
      const cols = onlyStep ? t.columns.filter((c) => (pos.get(c.stepId) ?? 0) <= step.position) : t.columns
      const pk = pkColumns(t)
      const inlinePk = pk.length === 1
      const lines = cols.map((c) => `  ${columnSql(c, inlinePk, enums)}`)
      if (pk.length > 1) lines.push(`  CONSTRAINT ${q(objectName('PK', t.name))} PRIMARY KEY (${pk.map(q).join(', ')})`)
      const create = `CREATE TABLE ${qt(t)} (\n${lines.join(',\n')}\n);`
      batch(idem ? `IF OBJECT_ID(${str(`${t.schema}.${t.name}`)}, N'U') IS NULL\nBEGIN\n${create}\nEND` : create)
    }
    for (const { t, c } of added) {
      const alter = `ALTER TABLE ${qt(t)} ADD ${columnSql(c, false, enums)};`
      batch(
        idem
          ? `IF COL_LENGTH(${str(`${t.schema}.${t.name}`)}, ${str(c.name)}) IS NULL\n  ${alter}`
          : `-- Columna agregada en este step a una tabla de un step anterior\n${alter}`,
      )
    }
  }

  // FKs
  const fks = input.model.relations.filter((r) => r.kind === 'fk')
  const fkSql: string[] = []
  for (const r of fks) {
    let child = tableByKey.get(r.from.table)
    let parent = tableByKey.get(r.to.table)
    let childCols = r.from.columns
    let parentCols = r.to.columns
    if (!child || !parent) continue
    if (r.op === '-') {
      // 1:1: la hija es el lado cuyas columnas no son la PK.
      const fromIsPk = childCols.every((c) => child!.columns.find((x) => x.name === c)?.pk)
      const toIsPk = parentCols.every((c) => parent!.columns.find((x) => x.name === c)?.pk)
      if (fromIsPk && !toIsPk) {
        ;[child, parent] = [parent, child]
        ;[childCols, parentCols] = [parentCols, childCols]
      }
    }
    const owner = relationStep({ ...r, from: { ...r.from, columns: childCols } }, child)
    if (!inScope(owner)) continue
    if (r.op === '<>') {
      fkSql.push(`-- Relación N:M ${child.key} <> ${parent.key}: requiere una tabla intermedia (no se genera FK).\n`)
      continue
    }
    const name = r.name ?? objectName('FK', child.name, ...childCols, parent.name)
    let stmt = `ALTER TABLE ${qt(child)} ADD CONSTRAINT ${q(name)}\n  FOREIGN KEY (${childCols.map(q).join(', ')}) REFERENCES ${qt(parent)} (${parentCols.map(q).join(', ')})`
    if (r.onDelete) stmt += `\n  ON DELETE ${r.onDelete.toUpperCase()}`
    if (r.onUpdate) stmt += `\n  ON UPDATE ${r.onUpdate.toUpperCase()}`
    stmt += ';'
    fkSql.push(
      `${idem ? `IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = ${str(name)})\n  ${stmt.replace(/\n/g, '\n  ')}` : stmt}\nGO\n`,
    )
  }
  if (fkSql.length > 0) {
    out.push(section('Claves foráneas'))
    out.push(...fkSql)
  }

  // Índices
  const idxSql: string[] = []
  for (const t of sqlTables) {
    for (const idx of t.indexes) {
      if (idx.pk) continue
      if (!inScope(indexStep(t, idx, pos))) continue
      if (idx.columns.some((c) => c.startsWith('`'))) {
        idxSql.push(`-- Índice por expresión en ${t.key} (${idx.columns.join(', ')}): SQL Server no lo soporta; usar una columna calculada.\n`)
        continue
      }
      const name = idx.name ?? objectName(idx.unique ? 'UX' : 'IX', t.name, ...idx.columns)
      const stmt = `CREATE ${idx.unique ? 'UNIQUE ' : ''}INDEX ${q(name)} ON ${qt(t)} (${idx.columns.map(q).join(', ')});`
      idxSql.push(
        `${idem ? `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = ${str(name)} AND object_id = OBJECT_ID(${str(`${t.schema}.${t.name}`)}))\n  ${stmt}` : stmt}\nGO\n`,
      )
    }
  }
  if (idxSql.length > 0) {
    out.push(section('Índices'))
    out.push(...idxSql)
  }

  // Vistas en orden de step
  const viewSteps = steps.filter((s) => inScope(s.id) && s.views.trim())
  if (viewSteps.length > 0) {
    out.push(section('Vistas'))
    for (const s of viewSteps) {
      out.push(`-- Step ${String(s.position).padStart(2, '0')} · ${s.name}`)
      for (const b of splitViewBatches(s.views)) {
        batch(idem ? b.replace(/^(\s*)CREATE\s+VIEW\b/im, '$1CREATE OR ALTER VIEW') : b)
      }
    }
  }

  // Descripciones (notas de tablas)
  const described = tablesInScope.filter((t) => t.note)
  if (described.length > 0) {
    out.push(section('Descripciones'))
    for (const t of described) {
      batch(
        `IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(${str(`${t.schema}.${t.name}`)}) AND minor_id = 0 AND name = N'MS_Description')\n  EXEC sp_addextendedproperty @name = N'MS_Description', @value = ${str(t.note!)},\n    @level0type = N'SCHEMA', @level0name = ${str(t.schema)}, @level1type = N'TABLE', @level1name = ${str(t.name)};`,
      )
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
