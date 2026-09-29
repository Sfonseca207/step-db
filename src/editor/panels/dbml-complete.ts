import { MONGO_BASE_TYPES } from '../../core/model.ts'
import type { Conventions } from '../../core/schemas.ts'
import { DBML_KINDS, type DbmlKind, type ProjectModel, type StepSource, type Store } from '../../core/types.ts'

/**
 * Autocompletado de DBML según el contexto del cursor. Lógica pura (sin Monaco ni DOM):
 * `dbml-language.ts` la adapta al editor. No usa el parser: tiene que responder mientras
 * se teclea, que es justo cuando el archivo no parsea.
 */

/* ------------------------------------------------------------------ */
/* Catálogo                                                            */
/* ------------------------------------------------------------------ */

export interface CatalogColumn {
  name: string
  type: string
  pk: boolean
}

export interface CatalogTable {
  /** Como se escribe en una referencia: `schema.tabla`, o `tabla` si se declaró sin schema. */
  ref: string
  schema: string | null
  name: string
  store: Store
  columns: CatalogColumn[]
}

export interface CatalogStep {
  slug: string
  name: string
  number: string
}

/** Lo que el proyecto ofrece para completar: sale del texto de todos los steps y del último modelo válido. */
export interface Catalog {
  tables: CatalogTable[]
  enums: string[]
  partials: string[]
  steps: CatalogStep[]
  conventions: Conventions
}

/* ------------------------------------------------------------------ */
/* Resultado                                                           */
/* ------------------------------------------------------------------ */

export type ItemKind = 'keyword' | 'snippet' | 'type' | 'enum' | 'table' | 'column' | 'schema' | 'step' | 'setting' | 'value' | 'operator'

export interface CompletionItem {
  label: string
  kind: ItemKind
  insert: string
  /** `insert` usa la sintaxis de snippets (`$1`, `${1:texto}`). */
  snippet?: boolean
  detail?: string
  /** Tras insertarlo se vuelven a pedir sugerencias (tabla → columnas, `ref:` → tablas). */
  retrigger?: boolean
}

/** Sugerencias, en orden, y el tramo del texto que reemplazan (`from` ≤ cursor ≤ `to`). */
export interface Completion {
  from: number
  to: number
  items: CompletionItem[]
}

/* ------------------------------------------------------------------ */
/* Recorrido del texto                                                 */
/* ------------------------------------------------------------------ */

type Mode = 'code' | 'line' | 'block' | 'single' | 'triple' | 'double' | 'tick'
type BlockType = 'table' | 'tablepartial' | 'enum' | 'ref' | 'indexes' | 'checks' | 'other'

interface Block {
  type: BlockType
  /** Tabla (o parcial) que se está leyendo, con las columnas vistas hasta el momento. */
  table: CatalogTable | null
}

interface Scan {
  mode: Mode
  blocks: Block[]
  /** Posición del `[` de settings abierto, o -1. */
  bracket: number
  /** Inicio del setting en curso dentro del `[`. */
  segStart: number
  /** Posición de la comilla que abrió la cadena en curso. */
  quote: number
  parens: number
  /** Inicio de la sentencia en curso (la línea, o la línea donde se abrió el `[`). */
  stmtStart: number
  tables: CatalogTable[]
  enums: string[]
  partials: string[]
}

const IDENT = String.raw`(?:"[^"\n]+"|[\p{L}\p{N}_$]+)`
const IDENT_RE = new RegExp(IDENT, 'gu')
const NAME_RE = new RegExp(String.raw`^\s*(${IDENT}(?:\s*\.\s*${IDENT})*)`, 'u')
const HEAD_RE = /^\s*(table|tablepartial|enum|ref|indexes|checks)\b(.*)$/is
const COLUMN_RE = new RegExp(String.raw`^\s*(${IDENT})\s+("[^"\n]+"|[^\s[(]+(?:\([^)]*\))?(?:\[\])?)(.*)$`, 'su')
const PLAIN_IDENT_RE = /^[\p{L}_][\p{L}\p{N}_$]*$/u
const NOT_COLUMNS = new Set(['note', 'indexes', 'checks', 'records'])

const unquote = (id: string) => (id.startsWith('"') ? id.slice(1, -1) : id)
const quoteId = (name: string) => (PLAIN_IDENT_RE.test(name) ? name : `"${name}"`)
const stripLineComment = (s: string) => s.replace(/\/\/.*$/gm, '')

function parseName(rest: string): { schema: string | null; name: string; ref: string } | null {
  const m = NAME_RE.exec(rest)
  if (!m) return null
  const parts = (m[1].match(IDENT_RE) ?? []).map(unquote)
  if (parts.length === 0) return null
  return { schema: parts.length > 1 ? parts[parts.length - 2] : null, name: parts[parts.length - 1], ref: parts.slice(-2).map(quoteId).join('.') }
}

function parseColumn(stmt: string): CatalogColumn | null {
  const m = COLUMN_RE.exec(stripLineComment(stmt))
  if (!m) return null
  if (!m[1].startsWith('"') && NOT_COLUMNS.has(m[1].toLowerCase())) return null
  const settings = /\[([^\]]*)\]/.exec(m[3])?.[1] ?? ''
  return { name: unquote(m[1]), type: unquote(m[2]), pk: settings.split(',').some((p) => /^\s*(pk|primary\s+key)\s*$/i.test(p)) }
}

function openBlock(head: string, s: Scan): Block {
  const m = HEAD_RE.exec(stripLineComment(head))
  if (!m) return { type: 'other', table: null }
  const type = m[1].toLowerCase() as BlockType
  if (type !== 'table' && type !== 'tablepartial' && type !== 'enum') return { type, table: null }
  const name = parseName(m[2])
  if (!name) return { type, table: null }
  if (type === 'enum') {
    s.enums.push(name.ref)
    return { type, table: null }
  }
  const table: CatalogTable = { ...name, store: name.schema === 'mongo' ? 'mongo' : 'sqlserver', columns: [] }
  if (type === 'table') s.tables.push(table)
  else s.partials.push(name.name)
  return { type, table }
}

/** Recorre `text` hasta `end` y devuelve en qué punto de la gramática queda y lo declarado por el camino. */
function scan(text: string, end = text.length): Scan {
  const s: Scan = { mode: 'code', blocks: [], bracket: -1, segStart: 0, quote: -1, parens: 0, stmtStart: 0, tables: [], enums: [], partials: [] }
  let arraySuffix = false
  const endStatement = (at: number) => {
    const table = s.blocks[s.blocks.length - 1]?.table
    const column = table ? parseColumn(text.slice(s.stmtStart, at)) : null
    if (table && column && !table.columns.some((c) => c.name === column.name)) table.columns.push(column)
    s.stmtStart = at + 1
    s.parens = 0
  }
  for (let i = 0; i < end; i++) {
    const c = text[i]
    if (s.mode === 'line') {
      if (c !== '\n') continue
      s.mode = 'code'
    } else if (s.mode === 'block') {
      if (c === '*' && text[i + 1] === '/') {
        s.mode = 'code'
        i++
      }
      continue
    } else if (s.mode === 'triple') {
      if (c === '\\') i++
      else if (text.startsWith("'''", i)) {
        s.mode = 'code'
        i += 2
      }
      continue
    } else if (s.mode !== 'code') {
      // Cadenas de una línea: una sin cerrar termina con la línea y no se traga el resto del archivo.
      if (c === '\\' && s.mode !== 'tick') {
        i++
        continue
      }
      if (c !== '\n') {
        if (c === { single: "'", double: '"', tick: '`' }[s.mode]) s.mode = 'code'
        continue
      }
      s.mode = 'code'
    }

    if (c === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
      s.mode = text[i + 1] === '/' ? 'line' : 'block'
      i++
    } else if (c === "'" || c === '"' || c === '`') {
      s.quote = i
      if (text.startsWith("'''", i)) {
        s.mode = 'triple'
        i += 2
      } else s.mode = c === "'" ? 'single' : c === '"' ? 'double' : 'tick'
    } else if (c === '\n') {
      if (s.bracket === -1) endStatement(i)
    } else if (c === '[') {
      if (s.bracket !== -1) continue
      // `tipo[]` (arreglo de Mongo) no abre settings.
      if (/[\p{L}\p{N}_>]/u.test(text[i - 1] ?? '')) arraySuffix = true
      else {
        s.bracket = i
        s.segStart = i + 1
      }
    } else if (c === ']') {
      if (arraySuffix) arraySuffix = false
      else s.bracket = -1
    } else if (c === '(') {
      s.parens++
    } else if (c === ')') {
      s.parens = Math.max(0, s.parens - 1)
    } else if (c === ',') {
      if (s.bracket !== -1 && s.parens === 0) s.segStart = i + 1
    } else if (c === '{') {
      // Dentro de unos settings no hay llaves: un `[` sin cerrar termina aquí.
      s.bracket = -1
      s.blocks.push(openBlock(text.slice(s.stmtStart, i), s))
      s.stmtStart = i + 1
      s.parens = 0
    } else if (c === '}') {
      s.bracket = -1
      endStatement(i)
      s.blocks.pop()
    }
  }
  return s
}

/* ------------------------------------------------------------------ */
/* Construcción del catálogo                                           */
/* ------------------------------------------------------------------ */

export function buildCatalog(input: {
  sources: readonly StepSource[]
  model: ProjectModel | null
  steps: readonly CatalogStep[]
  conventions: Conventions
}): Catalog {
  const { sources, model, conventions } = input
  const tables = new Map<string, CatalogTable>()
  const enums = new Set<string>()
  const partials = new Set<string>()
  for (const source of [...sources].sort((a, b) => a.position - b.position)) {
    for (const kind of DBML_KINDS) {
      const found = scan(source.files[kind] ?? '')
      for (const t of found.tables) if (!tables.has(t.ref)) tables.set(t.ref, t)
      for (const e of found.enums) enums.add(e)
      for (const p of found.partials) partials.add(p)
    }
  }
  // El modelo aporta lo que el texto no dice a simple vista: las columnas que llegan de un `~parcial`.
  const display = (schema: string | null) => (!schema || schema === 'public' ? conventions.defaultSqlSchema : schema)
  const scanned = new Map([...tables.values()].map((t) => [`${display(t.schema)}.${t.name}`, t]))
  for (const t of model?.tables ?? []) {
    const columns = t.columns.map((c) => ({ name: c.name, type: c.type, pk: c.pk }))
    const known = scanned.get(t.key)
    if (known) known.columns.push(...columns.filter((c) => !known.columns.some((k) => k.name === c.name)))
    else if (sources.length === 0) {
      const ref = `${quoteId(t.schema)}.${quoteId(t.name)}`
      tables.set(ref, { ref, schema: t.schema, name: t.name, store: t.store, columns })
    }
  }
  if (sources.length === 0) for (const e of model?.enums ?? []) enums.add(`${quoteId(e.schema)}.${quoteId(e.name)}`)
  return { tables: [...tables.values()], enums: [...enums], partials: [...partials], steps: [...input.steps], conventions }
}

/* ------------------------------------------------------------------ */
/* Vocabulario                                                         */
/* ------------------------------------------------------------------ */

/** Tipos de SQL Server, los más usados primero. Con `$1` los que llevan tamaño. */
const SQL_TYPES: [label: string, insert?: string][] = [
  ['bigint'],
  ['int'],
  ['nvarchar', 'nvarchar(${1:100})'],
  ['bit'],
  ['datetime2'],
  ['date'],
  ['decimal', 'decimal(${1:18}, ${2:2})'],
  ['uniqueidentifier'],
  ['varchar', 'varchar(${1:50})'],
  ['nvarchar(max)'],
  ['smallint'],
  ['tinyint'],
  ['numeric', 'numeric(${1:18}, ${2:2})'],
  ['money'],
  ['float'],
  ['real'],
  ['time'],
  ['datetime'],
  ['datetimeoffset'],
  ['smalldatetime'],
  ['char', 'char(${1:10})'],
  ['nchar', 'nchar(${1:10})'],
  ['varchar(max)'],
  ['varbinary', 'varbinary(${1:50})'],
  ['varbinary(max)'],
  ['binary', 'binary(${1:50})'],
  ['rowversion'],
  ['xml'],
  ['geography'],
  ['geometry'],
  ['hierarchyid'],
]

const MONGO_ARRAYS = ['string[]', 'objectId[]', 'object[]', 'int[]']

const OPERATORS: [op: string, detail: string][] = [
  ['>', 'Muchos a uno'],
  ['<', 'Uno a muchos'],
  ['-', 'Uno a uno'],
  ['<>', 'Muchos a muchos'],
]

const REF_ACTIONS = ['cascade', 'restrict', 'set null', 'set default', 'no action']

type Owner = 'column' | 'table' | 'ref' | 'index' | 'enum' | 'check'

const SETTINGS: Record<Owner, (kind: DbmlKind) => CompletionItem[]> = {
  column: (kind) => [
    { label: 'pk', kind: 'setting', insert: 'pk', detail: 'Clave primaria' },
    ...(kind === 'model' ? [{ label: 'increment', kind: 'setting' as const, insert: 'increment', detail: 'Identity' }] : []),
    { label: 'not null', kind: 'setting', insert: 'not null' },
    { label: 'null', kind: 'setting', insert: 'null' },
    { label: 'unique', kind: 'setting', insert: 'unique' },
    { label: 'ref:', kind: 'setting', insert: 'ref: > ', detail: 'Relación con otra tabla', retrigger: true },
    { label: 'default:', kind: 'setting', insert: 'default: ', detail: 'Valor por defecto', retrigger: true },
    { label: 'note:', kind: 'setting', insert: "note: '$1'", snippet: true, detail: 'Descripción' },
    { label: 'step:', kind: 'setting', insert: 'step: "$1"', snippet: true, detail: 'Step que agrega la columna', retrigger: true },
  ],
  table: () => [
    { label: 'note:', kind: 'setting', insert: "note: '$1'", snippet: true, detail: 'Descripción' },
    { label: 'headercolor:', kind: 'setting', insert: 'headercolor: #${1:3498DB}', snippet: true, detail: 'Color de la cabecera' },
  ],
  ref: () => [
    { label: 'delete:', kind: 'setting', insert: 'delete: ', detail: 'Acción al borrar', retrigger: true },
    { label: 'update:', kind: 'setting', insert: 'update: ', detail: 'Acción al actualizar', retrigger: true },
  ],
  index: () => [
    { label: 'unique', kind: 'setting', insert: 'unique' },
    { label: 'pk', kind: 'setting', insert: 'pk', detail: 'Clave primaria' },
    { label: 'name:', kind: 'setting', insert: "name: '$1'", snippet: true, detail: 'Nombre del índice' },
    { label: 'type:', kind: 'setting', insert: 'type: ', retrigger: true },
    { label: 'note:', kind: 'setting', insert: "note: '$1'", snippet: true, detail: 'Descripción' },
  ],
  enum: () => [{ label: 'note:', kind: 'setting', insert: "note: '$1'", snippet: true, detail: 'Descripción' }],
  check: () => [{ label: 'name:', kind: 'setting', insert: "name: '$1'", snippet: true, detail: 'Nombre del check' }],
}

/** Settings que no pueden ir juntos: escrito uno, el otro deja de ofrecerse. */
const EXCLUDES: Record<string, string[]> = { 'not null': ['null'], null: ['not null'], pk: ['null'] }

const settingKey = (s: string) => s.split(':')[0].trim().replace(/\s+/g, ' ').toLowerCase()

function defaultValues(type: string | undefined, kind: DbmlKind): string[] {
  if (kind === 'mongo') return ['null', 'true', 'false']
  const t = (type ?? '').toLowerCase()
  if (t === 'datetimeoffset') return ['`sysdatetimeoffset()`', 'null']
  if (/date|time/.test(t)) return ['`sysutcdatetime()`', '`getdate()`', 'null']
  if (t === 'uniqueidentifier') return ['`newid()`', '`newsequentialid()`', 'null']
  if (t === 'bit') return ['0', '1', 'null']
  if (/int|decimal|numeric|money|float|real/.test(t)) return ['0', 'null']
  if (/char|text/.test(t)) return ["''", 'null']
  return ['null', '0', "''", '`sysutcdatetime()`', '`newid()`']
}

/* ------------------------------------------------------------------ */
/* Sugerencias por contexto                                            */
/* ------------------------------------------------------------------ */

interface Ctx {
  text: string
  offset: number
  kind: DbmlKind
  catalog: Catalog
  store: Store
}

const result = (from: number, items: CompletionItem[], to: number): Completion | null => (items.length > 0 ? { from, to, items } : null)

/** Primero lo del mismo motor que el archivo: una FK no cruza de SQL Server a Mongo. */
function tablesFor(ctx: Ctx): CatalogTable[] {
  return [...ctx.catalog.tables].sort((a, b) => Number(a.store !== ctx.store) - Number(b.store !== ctx.store))
}

function columnItems(table: CatalogTable, pkFirst: boolean): CompletionItem[] {
  const columns = pkFirst ? [...table.columns].sort((a, b) => Number(b.pk) - Number(a.pk)) : table.columns
  return columns.map((c) => ({ label: c.name, kind: 'column', insert: quoteId(c.name), detail: c.pk ? `${c.type} · pk` : c.type }))
}

/** `schema.tabla.columna` a medio escribir: tablas, luego (tras el punto) sus columnas. */
function pathItems(ctx: Ctx, partial: string, pkFirst: boolean): Completion | null {
  if (/["()]/.test(partial)) return null
  const dot = partial.lastIndexOf('.')
  const prefix = dot === -1 ? '' : partial.slice(0, dot)
  const from = ctx.offset - (partial.length - dot - 1)
  const tables = tablesFor(ctx)
  const tableItem = (t: CatalogTable, label: string): CompletionItem => ({
    label,
    kind: 'table',
    insert: `${label}.`,
    detail: t.store === 'mongo' ? 'Colección' : 'Tabla',
    retrigger: true,
  })
  if (prefix === '')
    return result(
      from,
      tables.map((t) => tableItem(t, t.ref)),
      ctx.offset,
    )
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  const table = tables.find((t) => t.ref === prefix) ?? tables.find((t) => same(t.ref, prefix))
  if (table) return result(from, columnItems(table, pkFirst), ctx.offset)
  return result(
    from,
    tables.filter((t) => t.schema !== null && same(quoteId(t.schema), prefix)).map((t) => tableItem(t, quoteId(t.name))),
    ctx.offset,
  )
}

function operatorItems(ctx: Ctx, typed: string): Completion | null {
  return result(
    ctx.offset - typed.length,
    OPERATORS.map(([op, detail]) => ({ label: op, kind: 'operator', insert: `${op} `, detail, retrigger: true })),
    ctx.offset,
  )
}

/** Extremos de un `Ref`: `a.b.c`, el operador y `x.y.z`. */
function endpointItems(ctx: Ctx, rest: string): Completion | null {
  if (!/\s/.test(rest)) return pathItems(ctx, rest, false)
  const op = /^\S+\s+(<>?|[>-])?$/.exec(rest)
  if (op) return operatorItems(ctx, op[1] ?? '')
  const second = /^\S+\s+(<>|[<>-])\s+(\S*)$/.exec(rest)
  return second ? pathItems(ctx, second[2], second[1] !== '<') : null
}

function valueItems(ctx: Ctx, values: string[], typed: string): Completion | null {
  return result(
    ctx.offset - typed.length,
    values.map((v) => ({ label: v, kind: 'value', insert: v })),
    ctx.offset,
  )
}

function stepItems(ctx: Ctx, from: number, to: number, quoted: boolean): Completion | null {
  return result(
    from,
    ctx.catalog.steps.map((s) => ({ label: s.slug, kind: 'step', insert: quoted ? `"${s.slug}"` : s.slug, detail: `${s.number} ${s.name}`.trim() })),
    to,
  )
}

function settingsCompletion(ctx: Ctx, s: Scan): Completion | null {
  const { text, offset, kind } = ctx
  const top = s.blocks[s.blocks.length - 1]?.type
  const head = /^\s*(\p{L}+)/u.exec(text.slice(s.stmtStart, s.bracket))?.[1].toLowerCase()
  const owner: Owner | null =
    top === 'table' || top === 'tablepartial'
      ? 'column'
      : top === 'indexes'
        ? 'index'
        : top === 'ref' || top === 'enum'
          ? top
          : top === 'checks'
            ? 'check'
            : top !== undefined
              ? null
              : head === 'table' || head === 'tablepartial'
                ? 'table'
                : head === 'ref'
                  ? 'ref'
                  : null
  if (!owner) return null

  const seg = text.slice(s.segStart, offset)
  const pair = /^\s*([A-Za-z ]+?)\s*:\s*(.*)$/s.exec(seg)
  if (pair) {
    const key = pair[1].toLowerCase()
    const value = pair[2]
    if (owner === 'column' && key === 'ref') {
      const m = /^(<>|[<>-])?\s*(\S*)$/.exec(value)
      if (!m) return null
      return m[1] ? pathItems(ctx, m[2], true) : operatorItems(ctx, m[2])
    }
    if (owner === 'column' && key === 'step') return /^\S*$/.test(value) ? stepItems(ctx, offset - value.length, offset, true) : null
    if (owner === 'column' && key === 'default')
      return valueItems(ctx, defaultValues(parseColumn(text.slice(s.stmtStart, s.bracket) + ' ')?.type, kind), value)
    if (owner === 'ref' && (key === 'delete' || key === 'update')) return valueItems(ctx, REF_ACTIONS, value)
    if (owner === 'index' && key === 'type') return valueItems(ctx, ['btree', 'hash'], value)
    return null
  }

  // Nombre de un setting: no se repiten los que ya están en la lista.
  const close = text.indexOf(']', offset)
  const lineEnd = text.indexOf('\n', offset)
  const tail = close !== -1 && (lineEnd === -1 || close < lineEnd) ? text.slice(offset, close) : ''
  const written = [...text.slice(s.bracket + 1, s.segStart).split(','), ...tail.split(',').slice(1)].map(settingKey)
  const hidden = new Set([...written, ...written.flatMap((k) => EXCLUDES[k] ?? [])])
  const typed = seg.trimStart()
  return result(
    offset - typed.length,
    SETTINGS[owner](kind).filter((i) => !hidden.has(settingKey(i.label))),
    offset,
  )
}

function topLevelItems(ctx: Ctx): CompletionItem[] {
  const { conventions } = ctx.catalog
  const table: CompletionItem =
    ctx.kind === 'mongo'
      ? { label: 'Table', kind: 'snippet', insert: 'Table mongo.${1:coleccion} {\n\t_id objectId [pk]\n\t$0\n}', snippet: true, detail: 'Colección nueva' }
      : {
          label: 'Table',
          kind: 'snippet',
          insert: `Table \${1:${conventions.defaultSqlSchema}}.\${2:tabla} {\n\t${conventions.primaryKey} bigint [pk, increment]\n\t$0\n}`,
          snippet: true,
          detail: 'Tabla nueva',
        }
  return [
    table,
    { label: 'Ref', kind: 'snippet', insert: 'Ref: ', detail: 'Relación entre dos columnas', retrigger: true },
    ...(ctx.kind === 'model'
      ? [
          {
            label: 'Enum',
            kind: 'snippet' as const,
            insert: `Enum \${1:${conventions.defaultSqlSchema}}.\${2:nombre} {\n\t\${0:valor}\n}`,
            snippet: true,
            detail: 'Lista de valores',
          },
        ]
      : []),
    { label: 'TablePartial', kind: 'snippet', insert: 'TablePartial ${1:nombre} {\n\t$0\n}', snippet: true, detail: 'Columnas reutilizables' },
  ]
}

/** Columna FK hacia cada tabla, con el nombre que dicta la convención (`{tabla}_id`). */
function foreignKeys(ctx: Ctx, own: CatalogTable | null): { name: string; type: string; target: string }[] {
  const pattern = ctx.catalog.conventions.foreignKeyPattern
  if (!pattern.includes('{tabla}')) return []
  const out: { name: string; type: string; target: string }[] = []
  for (const t of ctx.catalog.tables) {
    const pks = t.columns.filter((c) => c.pk)
    if (t.store !== ctx.store || pks.length !== 1 || t.ref === own?.ref) continue
    const name = pattern.replace('{tabla}', t.name)
    if (!out.some((f) => f.name === name)) out.push({ name, type: pks[0].type, target: `${t.ref}.${quoteId(pks[0].name)}` })
  }
  return out
}

function tableBodyCompletion(ctx: Ctx, s: Scan, line: string, isPartial: boolean): Completion | null {
  const { offset, kind, catalog } = ctx
  const own = s.blocks[s.blocks.length - 1]?.table ?? null
  // Las columnas de la tabla completa, no solo las que quedan por encima del cursor.
  const whole = (own && !isPartial && scan(ctx.text).tables.find((t) => t.ref === own.ref)) || own

  const first = /^\s*(~?[^\s[\]{}"~]*)$/.exec(line)
  if (first) {
    const typed = first[1]
    if (typed.startsWith('~'))
      return result(
        offset - typed.length,
        catalog.partials.map((p) => ({ label: `~${p}`, kind: 'keyword', insert: `~${quoteId(p)}`, detail: 'Columnas del parcial' })),
        offset,
      )
    const items: CompletionItem[] = []
    if (whole && whole.columns.length === 0 && !isPartial)
      items.push(
        kind === 'mongo'
          ? { label: '_id', kind: 'column', insert: '_id objectId [pk]', detail: 'Clave primaria' }
          : { label: catalog.conventions.primaryKey, kind: 'column', insert: `${catalog.conventions.primaryKey} bigint [pk, increment]`, detail: 'Clave primaria' },
      )
    for (const fk of foreignKeys(ctx, isPartial ? null : whole)) {
      if (whole?.columns.some((c) => c.name === fk.name)) continue
      items.push({ label: fk.name, kind: 'column', insert: `${quoteId(fk.name)} ${fk.type} [ref: > ${fk.target}]`, detail: `→ ${fk.target}` })
    }
    items.push(
      { label: 'indexes', kind: 'snippet', insert: 'indexes {\n\t${1:columna} [name: \'${2:ix}\']\n}', snippet: true, detail: 'Índices de la tabla' },
      { label: 'Note', kind: 'snippet', insert: "Note: '$1'", snippet: true, detail: 'Descripción' },
    )
    return result(offset - typed.length, items, offset)
  }

  const second = new RegExp(String.raw`^\s*(${IDENT})\s+([^\s[\]{}"()]*)$`, 'u').exec(line)
  if (!second || (!second[1].startsWith('"') && NOT_COLUMNS.has(second[1].toLowerCase()))) return null
  const items: CompletionItem[] = []
  const fk = foreignKeys(ctx, isPartial ? null : whole).find((f) => f.name.toLowerCase() === unquote(second[1]).toLowerCase())
  if (fk) items.push({ label: `${fk.type} → ${fk.target}`, kind: 'type', insert: `${fk.type} [ref: > ${fk.target}]`, detail: 'Tipo y relación' })
  if (kind === 'mongo') {
    for (const t of [...MONGO_BASE_TYPES, ...MONGO_ARRAYS]) items.push({ label: t, kind: 'type', insert: t })
  } else {
    for (const [label, insert] of SQL_TYPES) items.push({ label, kind: 'type', insert: insert ?? label, snippet: insert !== undefined })
    for (const e of catalog.enums) items.push({ label: e, kind: 'enum', insert: e, detail: 'Enum' })
  }
  return result(offset - second[2].length, items, offset)
}

function enclosingColumns(ctx: Ctx, s: Scan): CompletionItem[] {
  const own = s.blocks[s.blocks.length - 2]?.table
  if (!own) return []
  const whole = scan(ctx.text).tables.find((t) => t.ref === own.ref) ?? own
  return columnItems(whole, false)
}

/* ------------------------------------------------------------------ */
/* Entrada                                                             */
/* ------------------------------------------------------------------ */

export function completeDbml(input: { text: string; offset: number; kind: DbmlKind; catalog: Catalog }): Completion | null {
  const { text, offset } = input
  const ctx: Ctx = { ...input, store: input.kind === 'mongo' ? 'mongo' : 'sqlserver' }
  const s = scan(text, offset)

  if (s.mode === 'double') {
    // Solo `step: "…"` se completa dentro de unas comillas.
    if (s.bracket === -1 || !/^\s*step\s*:\s*$/i.test(text.slice(s.segStart, s.quote))) return null
    if (s.blocks[s.blocks.length - 1]?.table == null) return null
    const rest = /^[^"\n,\]]*/.exec(text.slice(offset))?.[0] ?? ''
    const closes = text[offset + rest.length] === '"'
    return stepItems(ctx, s.quote + 1, closes ? offset + rest.length : offset, false)
  }
  if (s.mode !== 'code') return null
  if (s.bracket !== -1) return settingsCompletion(ctx, s)

  const line = text.slice(s.stmtStart, offset)
  const top = s.blocks[s.blocks.length - 1]

  if (s.parens > 0 || top?.type === 'indexes') {
    if (top?.type !== 'indexes') return null
    const typed = /[^\s(),[\]{}"`]*$/.exec(line)?.[0] ?? ''
    if (s.parens === 0 && line.trim() !== typed) return null
    return result(offset - typed.length, enclosingColumns(ctx, s), offset)
  }
  if (top?.type === 'table' || top?.type === 'tablepartial') return tableBodyCompletion(ctx, s, line, top.type === 'tablepartial')
  if (top?.type === 'ref') return endpointItems(ctx, line.trimStart())
  if (top) return null

  const ref = /^\s*ref\b[^:{]*:\s*(.*)$/is.exec(line)
  if (ref) return endpointItems(ctx, ref[1])
  const named = /^\s*(table|enum)\s+(\S*)$/i.exec(line)
  if (named) {
    if (/[."]/.test(named[2])) return null
    const schemas =
      ctx.kind === 'mongo'
        ? ['mongo']
        : [...new Set([ctx.catalog.conventions.defaultSqlSchema, ...ctx.catalog.tables.filter((t) => t.store === 'sqlserver' && t.schema).map((t) => t.schema!)])]
    return result(
      offset - named[2].length,
      schemas.map((n) => ({ label: n, kind: 'schema', insert: `${quoteId(n)}.`, detail: 'Schema' })),
      offset,
    )
  }
  const word = /^\s*(\p{L}*)$/u.exec(line)
  return word ? result(offset - word[1].length, topLevelItems(ctx), offset) : null
}
