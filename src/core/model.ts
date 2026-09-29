import { Compiler, DEFAULT_ENTRY, MemoryProjectLayout } from '@dbml/parse'
import { translateParserMessage } from './messages.ts'
import { DEFAULT_CONVENTIONS, type Conventions } from './schemas.ts'
import type {
  BuildResult,
  ColumnDefault,
  ColumnModel,
  DbmlKind,
  Diagnostic,
  EnumModel,
  IndexModel,
  ProjectModel,
  RelationModel,
  SourceLoc,
  StepSource,
  TableModel,
} from './types.ts'

/* ------------------------------------------------------------------ */
/* Estructuras mínimas de la salida de @dbml/parse que usamos.          */
/* (Se usa el parser directamente y no @dbml/core, que pesa ~20 MB     */
/* por incluir los importadores de todos los motores SQL.)             */
/* ------------------------------------------------------------------ */

interface RawPos {
  line: number
  column: number
}
interface RawToken {
  start: RawPos
  end: RawPos
}
interface RawNote {
  value: string
}
interface RawField {
  name: string
  type: { schemaName: string | null; type_name: string; args: string | null }
  pk?: boolean
  not_null?: boolean
  unique?: boolean
  increment?: boolean
  note?: RawNote | null
  dbdefault?: { type: string; value: string | number | boolean } | null
  metadata?: Record<string, unknown> | null
  token?: RawToken
}
interface RawIndex {
  columns: { type: string; value: string }[]
  unique?: boolean
  pk?: boolean
  name?: string | null
  type?: string | null
}
interface RawTable {
  name: string
  schemaName: string | null
  note?: RawNote | null
  headerColor?: string | null
  metadata?: Record<string, unknown> | null
  fields: RawField[]
  indexes: RawIndex[]
  /** Referencias `~parcial` dentro de la tabla, con su posición entre las columnas. */
  partials?: { order: number; name: string }[]
  token: RawToken
}
interface RawPartial {
  name: string
  fields: RawField[]
  indexes: RawIndex[]
  note?: RawNote | null
  headerColor?: string | null
}
interface RawEndpoint {
  schemaName: string | null
  tableName: string
  fieldNames: string[]
  relation: '1' | '*'
}
interface RawRef {
  name?: string | null
  onDelete?: string | null
  onUpdate?: string | null
  endpoints: RawEndpoint[]
  token: RawToken
}
interface RawEnum {
  name: string
  schemaName: string | null
  values: { name: string; note?: RawNote | null }[]
  token: RawToken
}
interface RawDatabase {
  tables: RawTable[]
  refs: RawRef[]
  enums: RawEnum[]
  tablePartials?: RawPartial[]
}
/** Error del compilador; sus posiciones son 0-based. */
interface RawCompileError {
  diagnostic: string
  nodeOrToken?: { startPos?: RawPos }
}

/** Una columna tal como queda en la tabla: propia o inyectada desde un `TablePartial`. */
interface ResolvedField {
  field: RawField
  injected: boolean
}

/** Expande las referencias `~parcial` de una tabla en su posición (las columnas propias mandan). */
function resolveFields(table: RawTable, partials: ReadonlyMap<string, RawPartial>): ResolvedField[] {
  const refs = table.partials ?? []
  if (refs.length === 0) return table.fields.map((field) => ({ field, injected: false }))
  const own = new Set(table.fields.map((f) => f.name))
  const byOrder = new Map(refs.map((r) => [r.order, r.name]))
  const out: ResolvedField[] = []
  const seen = new Set<string>()
  let next = 0
  for (let pos = 0; pos < table.fields.length + refs.length; pos++) {
    const partialName = byOrder.get(pos)
    if (partialName === undefined) {
      const field = table.fields[next++]
      if (field) out.push({ field, injected: false })
      continue
    }
    for (const field of partials.get(partialName)?.fields ?? []) {
      if (own.has(field.name) || seen.has(field.name)) continue
      seen.add(field.name)
      out.push({ field, injected: true })
    }
  }
  while (next < table.fields.length) out.push({ field: table.fields[next++], injected: false })
  return out
}

/* ------------------------------------------------------------------ */
/* Merge con mapa de offsets                                           */
/* ------------------------------------------------------------------ */

export interface Chunk {
  stepId: string
  stepSlug: string
  kind: DbmlKind
  /** Línea global (1-based) donde empieza el archivo dentro del texto combinado. */
  startLine: number
  lineCount: number
}

export interface MergedSource {
  text: string
  chunks: Chunk[]
}

/** Concatena los archivos `model` y `mongo` de todos los steps (en orden de `position`). */
export function mergeSources(steps: readonly StepSource[]): MergedSource {
  const ordered = [...steps].sort((a, b) => a.position - b.position)
  const parts: string[] = []
  const chunks: Chunk[] = []
  let line = 1
  for (const step of ordered) {
    for (const kind of ['model', 'mongo'] as const) {
      const content = step.files[kind] ?? ''
      const lineCount = content.split('\n').length
      chunks.push({ stepId: step.id, stepSlug: step.slug, kind, startLine: line, lineCount })
      parts.push(content)
      line += lineCount
    }
  }
  return { text: parts.join('\n'), chunks }
}

/** Traduce una línea global del texto combinado a `step + archivo + línea local`. */
export function locate(chunks: readonly Chunk[], globalLine: number): { chunk: Chunk; line: number } | null {
  for (const chunk of chunks) {
    if (globalLine >= chunk.startLine && globalLine < chunk.startLine + chunk.lineCount) {
      return { chunk, line: globalLine - chunk.startLine + 1 }
    }
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Tipos Mongo                                                         */
/* ------------------------------------------------------------------ */

export const MONGO_BASE_TYPES = ['objectId', 'string', 'int', 'long', 'double', 'decimal', 'bool', 'date', 'object', 'array'] as const

/** `array<tipo>` (entre comillas en DBML) o `tipo[]`. */
export function parseMongoType(type: string): { base: string; items?: string } | null {
  const t = type.trim()
  const generic = /^array<(.+)>$/.exec(t)
  if (generic) {
    const inner = parseMongoType(generic[1])
    return inner ? { base: 'array', items: generic[1].trim() } : null
  }
  const suffix = /^(.+)\[\]$/.exec(t)
  if (suffix) {
    const inner = parseMongoType(suffix[1])
    return inner ? { base: 'array', items: suffix[1].trim() } : null
  }
  return (MONGO_BASE_TYPES as readonly string[]).includes(t) ? { base: t } : null
}

/* ------------------------------------------------------------------ */
/* Construcción del modelo                                             */
/* ------------------------------------------------------------------ */

function toDefault(raw: RawField['dbdefault']): ColumnDefault | undefined {
  if (!raw || raw.value === undefined || raw.value === null) return undefined
  const type = raw.type === 'number' || raw.type === 'string' || raw.type === 'boolean' ? raw.type : 'expression'
  return { type, value: String(raw.value) }
}

function diagFromLine(
  chunks: readonly Chunk[],
  globalLine: number | undefined,
  message: string,
  extra: Partial<Diagnostic> = {},
  column?: number,
): Diagnostic {
  const where = globalLine ? locate(chunks, globalLine) : null
  if (!where) return { severity: 'error', message, ...extra }
  return {
    severity: 'error',
    message,
    stepId: where.chunk.stepId,
    stepSlug: where.chunk.stepSlug,
    kind: where.chunk.kind,
    line: where.line,
    column,
    ...extra,
  }
}

/** Formatea un diagnóstico como `step · archivo:línea — mensaje`. */
export function formatDiagnostic(d: Diagnostic): string {
  const where = d.stepSlug ? `${d.stepSlug} · ${d.kind}${d.line ? `:${d.line}` : ''}` : 'proyecto'
  return `${where} — ${d.message}`
}

/**
 * Construye el modelo combinado del proyecto. Nunca lanza: los errores de
 * parseo y de validación estructural vuelven en `errors` con su ubicación local.
 */
export function buildProjectModel(
  steps: readonly StepSource[],
  conventions: Conventions = DEFAULT_CONVENTIONS,
): BuildResult {
  const merged = mergeSources(steps)
  const { chunks } = merged
  const slugToStep = new Map(steps.map((s) => [s.slug, s.id]))

  if (merged.text.trim() === '') {
    return { model: { tables: [], relations: [], enums: [] }, errors: [] }
  }

  let raw: RawDatabase
  try {
    const layout = new MemoryProjectLayout()
    layout.setSource(DEFAULT_ENTRY, merged.text)
    const compiler = new Compiler(layout)
    const compileErrors = compiler.parse.errors(DEFAULT_ENTRY) as unknown as RawCompileError[]
    if (compileErrors.length > 0) {
      const errors = compileErrors.map((e) => {
        const pos = e.nodeOrToken?.startPos
        return diagFromLine(
          chunks,
          pos ? pos.line + 1 : undefined,
          translateParserMessage(e.diagnostic),
          { code: 'parse' },
          pos ? pos.column + 1 : undefined,
        )
      })
      return { model: null, errors: dedupeDiagnostics(errors) }
    }
    raw = compiler.parse.rawDb(DEFAULT_ENTRY) as unknown as RawDatabase
  } catch (err) {
    return {
      model: null,
      errors: [{ severity: 'error', code: 'parse', message: err instanceof Error ? err.message : 'Error de parseo' }],
    }
  }
  const partials = new Map((raw.tablePartials ?? []).map((p) => [p.name, p]))

  const errors: Diagnostic[] = []
  const displaySchema = (schema: string | null | undefined) =>
    !schema || schema === 'public' ? conventions.defaultSqlSchema : schema

  // Enums
  const enums: EnumModel[] = []
  const enumKeys = new Set<string>()
  for (const e of raw.enums) {
    const where = locate(chunks, e.token.start.line)
    const s = displaySchema(e.schemaName)
    const key = `${s}.${e.name}`
    enumKeys.add(key)
    enums.push({
      key,
      schema: s,
      name: e.name,
      values: e.values.map((v) => ({ name: v.name, ...(v.note?.value ? { note: v.note.value } : {}) })),
      stepId: where?.chunk.stepId ?? '',
    })
  }

  // Tablas
  const tables: TableModel[] = []
  const seenKeys = new Map<string, TableModel>()
  for (const t of raw.tables) {
    const startLine = t.token.start.line
    const where = locate(chunks, startLine)
    if (!where) continue
    const s = displaySchema(t.schemaName)
    const key = `${s}.${t.name}`
    const isMongo = t.schemaName === 'mongo'
    const kind = where.chunk.kind
    const stepId = where.chunk.stepId
    const loc: SourceLoc = {
      stepId,
      kind,
      startLine: where.line,
      endLine: where.line + (t.token.end.line - startLine),
    }

    if (kind === 'mongo' && !isMongo) {
      errors.push(
        diagFromLine(chunks, startLine, `La tabla '${key}' está en el archivo mongo pero no en el schema 'mongo' (usa Table mongo.${t.name})`, {
          code: 'store',
          table: key,
        }),
      )
    }
    if (kind === 'model' && isMongo) {
      errors.push(
        diagFromLine(chunks, startLine, `La colección '${key}' debe definirse en el archivo mongo del step, no en el archivo model`, {
          code: 'store',
          table: key,
        }),
      )
    }
    const previous = seenKeys.get(key)
    if (previous) {
      errors.push(diagFromLine(chunks, startLine, `La tabla '${key}' ya existe`, { code: 'duplicate', table: key }))
    }

    const columns: ColumnModel[] = []
    for (const { field: f, injected } of resolveFields(t, partials)) {
      const typeName = f.type.schemaName ? `${f.type.schemaName}.${f.type.type_name}` : f.type.type_name
      const enumKey = `${displaySchema(f.type.schemaName)}.${f.type.type_name}`
      const fieldLine = injected || !f.token ? startLine : f.token.start.line
      let colStep = stepId
      const stepProp = f.metadata?.step
      if (stepProp !== undefined && stepProp !== null) {
        const target = slugToStep.get(String(stepProp))
        if (target) colStep = target
        else
          errors.push(
            diagFromLine(chunks, fieldLine, `Step '${String(stepProp)}' desconocido en la columna '${key}.${f.name}'`, {
              code: 'unknown-step',
              table: key,
            }),
          )
      }
      if (isMongo && !parseMongoType(f.type.type_name)) {
        errors.push(
          diagFromLine(
            chunks,
            fieldLine,
            `Tipo Mongo no permitido '${f.type.type_name}' en '${key}.${f.name}'. Usa: ${MONGO_BASE_TYPES.join(', ')}, "array<tipo>" o tipo[]`,
            { code: 'mongo-type', table: key },
          ),
        )
      }
      const localLine = locate(chunks, fieldLine)?.line ?? where.line
      columns.push({
        name: f.name,
        type: typeName,
        pk: Boolean(f.pk),
        notNull: Boolean(f.not_null) || Boolean(f.pk),
        unique: Boolean(f.unique),
        increment: Boolean(f.increment),
        ...(toDefault(f.dbdefault) ? { default: toDefault(f.dbdefault) } : {}),
        ...(f.note?.value ? { note: f.note.value } : {}),
        stepId: colStep,
        ...(enumKeys.has(enumKey) && !isMongo ? { enumRef: enumKey } : {}),
        line: localLine,
      })
    }

    const partialIndexes = (t.partials ?? []).flatMap((ref) => partials.get(ref.name)?.indexes ?? [])
    const indexes: IndexModel[] = [...t.indexes, ...partialIndexes].map((i) => ({
      ...(i.name ? { name: i.name } : {}),
      columns: i.columns.map((c) => (c.type === 'expression' ? `\`${c.value}\`` : c.value)),
      unique: Boolean(i.unique),
      pk: Boolean(i.pk),
      ...(i.type ? { type: i.type } : {}),
    }))

    const table: TableModel = {
      key,
      schema: s,
      name: t.name,
      store: isMongo ? 'mongo' : 'sqlserver',
      stepId,
      ...(t.note?.value ? { note: t.note.value } : {}),
      ...(t.headerColor ? { headerColor: t.headerColor } : {}),
      columns,
      indexes,
      loc,
    }
    seenKeys.set(key, table)
    tables.push(table)
  }

  // Relaciones
  const tableByRawKey = new Map<string, TableModel>()
  for (const t of tables) tableByRawKey.set(t.key, t)
  const relations: RelationModel[] = []
  const seenRelIds = new Set<string>()
  for (const [index, r] of raw.refs.entries()) {
    if (r.endpoints.length !== 2) continue
    let [a, b] = r.endpoints
    // Normaliza: el lado "muchos" queda como `from`.
    if (a.relation === '1' && b.relation === '*') [a, b] = [b, a]
    const fromKey = `${displaySchema(a.schemaName)}.${a.tableName}`
    const toKey = `${displaySchema(b.schemaName)}.${b.tableName}`
    const fromTable = tableByRawKey.get(fromKey)
    const toTable = tableByRawKey.get(toKey)
    const op: RelationModel['op'] =
      a.relation === '*' && b.relation === '1' ? '>' : a.relation === '1' && b.relation === '1' ? '-' : a.relation === '*' ? '<>' : '<'
    const logical = fromTable?.store === 'mongo' || toTable?.store === 'mongo'
    let id = `${fromKey}(${a.fieldNames.join(',')})${op}${toKey}(${b.fieldNames.join(',')})`
    if (seenRelIds.has(id)) id = `${id}#${index}`
    seenRelIds.add(id)
    const where = locate(chunks, r.token.start.line)
    relations.push({
      id,
      ...(r.name ? { name: r.name } : {}),
      kind: logical ? 'logical' : 'fk',
      from: { table: fromKey, columns: a.fieldNames, cardinality: a.relation === '*' ? 'N' : '1' },
      to: { table: toKey, columns: b.fieldNames, cardinality: b.relation === '*' ? 'N' : '1' },
      op,
      ...(r.onDelete ? { onDelete: r.onDelete } : {}),
      ...(r.onUpdate ? { onUpdate: r.onUpdate } : {}),
      stepId: where?.chunk.stepId ?? fromTable?.stepId ?? '',
    })
  }

  // Orden de definición: step, archivo (model antes que mongo) y línea.
  const stepPos = new Map(steps.map((s) => [s.id, s.position]))
  const kindOrder = { model: 0, mongo: 1 } as const
  tables.sort(
    (a, b) =>
      (stepPos.get(a.stepId) ?? 0) - (stepPos.get(b.stepId) ?? 0) ||
      kindOrder[a.loc.kind] - kindOrder[b.loc.kind] ||
      a.loc.startLine - b.loc.startLine,
  )

  const model: ProjectModel = { tables, relations, enums }
  if (errors.length > 0) return { model: null, errors: dedupeDiagnostics(errors) }
  return { model, errors: [] }
}

function dedupeDiagnostics(list: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>()
  const out: Diagnostic[] = []
  for (const d of list) {
    const k = `${d.stepId}|${d.kind}|${d.line}|${d.message}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(d)
  }
  return out.sort((x, y) => (x.line ?? 0) - (y.line ?? 0))
}

/** Tablas y colecciones de un step (por su archivo de origen). */
export function tablesOfStep(model: ProjectModel, stepId: string): TableModel[] {
  return model.tables.filter((t) => t.stepId === stepId)
}

/** Columnas que un step agregó a tablas de otros steps (RF-16). */
export function foreignColumnsOfStep(model: ProjectModel, stepId: string): { table: string; column: string }[] {
  const out: { table: string; column: string }[] = []
  for (const t of model.tables) {
    if (t.stepId === stepId) continue
    for (const c of t.columns) if (c.stepId === stepId) out.push({ table: t.key, column: c.name })
  }
  return out
}
