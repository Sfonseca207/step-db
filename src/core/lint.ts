import type { Conventions } from './schemas.ts'
import type { Diagnostic, ProjectModel, TableModel } from './types.ts'

const CASE_RE: Record<Conventions['case'], RegExp> = {
  snake_case: /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/,
  camelCase: /^[a-z][a-zA-Z0-9]*$/,
  PascalCase: /^[A-Z][a-zA-Z0-9]*$/,
}

const LOG_NAME_RE = /(^|_)(log|logs|bitacora|bitacoras|auditoria|auditorias|historial|historiales)(_|$)/i

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, (m) => (m === '{' || m === '}' ? m : `\\${m}`))
  return new RegExp(`^${escaped.replace('{tabla}', '(.+)').replace(/[{}]/g, '')}$`)
}

function warn(table: TableModel, code: string, message: string, line?: number): Diagnostic {
  return {
    severity: 'warning',
    code,
    message,
    table: table.key,
    stepId: table.loc.stepId,
    kind: table.loc.kind,
    line: line ?? table.loc.startLine,
  }
}

/** Nombre legible de cada regla del linter. */
export const LINT_RULE_LABELS: Record<string, string> = {
  'no-pk': 'Tabla sin clave primaria',
  case: 'Nombre fuera de convención',
  'fk-without-ref': 'Parece FK pero no tiene Ref',
  'fk-without-index': 'FK sin índice',
  'logical-ref-without-index': 'Referencia lógica sin índice',
  'sql-log-table': 'Log en SQL',
}

/** ¿Las columnas están cubiertas (como prefijo) por la PK, un índice o un `unique`? */
function isIndexed(table: TableModel, columns: string[]): boolean {
  if (columns.length === 1) {
    const col = table.columns.find((c) => c.name === columns[0])
    if (col && (col.pk || col.unique)) return true
  }
  const pkCols = table.columns.filter((c) => c.pk).map((c) => c.name)
  const candidates = [pkCols, ...table.indexes.map((i) => i.columns)]
  return candidates.some((idx) => columns.every((c, i) => idx[i] === c))
}

/** Linter del modelo (RF-70): advertencias que no bloquean el guardado. */
export function lintModel(model: ProjectModel, conventions: Conventions): Diagnostic[] {
  const out: Diagnostic[] = []
  const caseRe = CASE_RE[conventions.case]
  const fkRe = patternToRegex(conventions.foreignKeyPattern)
  const tables = new Map(model.tables.map((t) => [t.key, t]))
  const refCols = new Set<string>()
  for (const r of model.relations) {
    for (const c of r.from.columns) refCols.add(`${r.from.table}.${c}`)
    for (const c of r.to.columns) refCols.add(`${r.to.table}.${c}`)
  }

  for (const t of model.tables) {
    // 1. Tabla sin PK
    const hasPk = t.columns.some((c) => c.pk) || t.indexes.some((i) => i.pk)
    if (!hasPk) out.push(warn(t, 'no-pk', `${t.key} no tiene clave primaria`))

    // 2. Casing de tabla y columnas
    if (!caseRe.test(t.name)) out.push(warn(t, 'case', `El nombre de tabla '${t.name}' no cumple ${conventions.case}`))
    for (const c of t.columns) {
      if (t.store === 'mongo' && c.name === '_id') continue
      const segments = t.store === 'mongo' ? c.name.split('.') : [c.name]
      if (segments.some((s) => !caseRe.test(s))) {
        out.push(warn(t, 'case', `La columna '${t.key}.${c.name}' no cumple ${conventions.case}`, c.line))
      }
    }

    // 3. Columna con patrón de FK sin Ref
    for (const c of t.columns) {
      if (c.pk) continue
      if (fkRe.test(c.name) && !refCols.has(`${t.key}.${c.name}`)) {
        out.push(warn(t, 'fk-without-ref', `'${t.key}.${c.name}' parece una FK pero no tiene Ref`, c.line))
      }
    }

    // 6. Tabla SQL con nombre de log
    if (t.store === 'sqlserver' && LOG_NAME_RE.test(t.name)) {
      out.push(
        warn(t, 'sql-log-table', `'${t.key}' parece un log: evalúa si debería ser una colección MongoDB en lugar de una tabla SQL`),
      )
    }
  }

  // 4 y 5. Índices en columnas de referencia
  for (const r of model.relations) {
    const sides = r.op === '>' ? [r.from] : r.op === '<' ? [r.to] : r.op === '-' ? [r.from] : [r.from, r.to]
    for (const side of sides) {
      const t = tables.get(side.table)
      if (!t) continue
      if (r.kind === 'fk' && t.store === 'sqlserver' && !isIndexed(t, side.columns)) {
        const line = t.columns.find((c) => c.name === side.columns[0])?.line
        out.push(warn(t, 'fk-without-index', `La FK '${t.key}(${side.columns.join(', ')})' no tiene índice`, line))
      }
    }
    if (r.kind === 'logical') {
      for (const side of [r.from, r.to]) {
        const t = tables.get(side.table)
        if (!t || t.store !== 'mongo' || isIndexed(t, side.columns)) continue
        const line = t.columns.find((c) => c.name === side.columns[0])?.line
        out.push(
          warn(t, 'logical-ref-without-index', `La referencia lógica '${t.key}.${side.columns.join(', ')}' no está indexada en Mongo`, line),
        )
      }
    }
  }

  return out
}
