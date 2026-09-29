import { parseMongoType } from '../model.ts'
import type { ColumnModel, RelationModel, TableModel } from '../types.ts'
import { formatWorkDate, orderedSteps, type ExportInput, type ExportOptions } from './types.ts'

interface JsonSchemaNode {
  bsonType: string
  description?: string
  required?: string[]
  properties?: Record<string, JsonSchemaNode>
  items?: JsonSchemaNode
}

const BSON: Record<string, string> = {
  objectId: 'objectId',
  string: 'string',
  int: 'int',
  long: 'long',
  double: 'double',
  decimal: 'decimal',
  bool: 'bool',
  date: 'date',
  object: 'object',
  array: 'array',
}

function typeNode(type: string): JsonSchemaNode {
  const parsed = parseMongoType(type)
  if (!parsed) return { bsonType: 'string' }
  if (parsed.base === 'array') {
    return parsed.items ? { bsonType: 'array', items: typeNode(parsed.items) } : { bsonType: 'array' }
  }
  return { bsonType: BSON[parsed.base] ?? 'string' }
}

/** `$jsonSchema` de una colección; los campos punteados se vuelven objetos anidados. */
export function collectionSchema(t: TableModel): JsonSchemaNode {
  const root: JsonSchemaNode = { bsonType: 'object', properties: {} }
  if (t.note) root.description = t.note
  const ensureObject = (parent: JsonSchemaNode, key: string): JsonSchemaNode => {
    parent.properties ??= {}
    const existing = parent.properties[key]
    if (existing && existing.bsonType === 'object') return existing
    const node: JsonSchemaNode = { bsonType: 'object', properties: {} }
    parent.properties[key] = node
    return node
  }
  const addRequired = (node: JsonSchemaNode, key: string) => {
    node.required ??= []
    if (!node.required.includes(key)) node.required.push(key)
  }
  for (const c of t.columns as ColumnModel[]) {
    const parts = c.name.split('.')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) node = ensureObject(node, parts[i])
    const leaf = parts[parts.length - 1]
    const existing = node.properties?.[leaf]
    const def = typeNode(c.type)
    if (existing?.properties && def.bsonType === 'object') def.properties = existing.properties
    if (c.note) def.description = c.note
    node.properties ??= {}
    node.properties[leaf] = def
    if (c.notNull) {
      // Un campo anidado obligatorio también hace obligatorio a su padre.
      let parent = root
      for (let i = 0; i < parts.length - 1; i++) {
        addRequired(parent, parts[i])
        parent = parent.properties![parts[i]]
      }
      addRequired(node, leaf)
    }
  }
  return root
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((l, i) => (i === 0 ? l : pad + l))
    .join('\n')
}

function logicalRefComment(r: RelationModel, collection: TableModel, tables: Map<string, TableModel>): string {
  const mongoSide = r.from.table === collection.key ? r.from : r.to
  const other = mongoSide === r.from ? r.to : r.from
  const otherTable = tables.get(other.table)
  const where = otherTable?.store === 'sqlserver' ? 'SQL Server' : 'MongoDB'
  return [
    `// Referencia lógica: ${collection.name}.${mongoSide.columns.join(', ')} → ${other.table}.${other.columns.join(', ')} (${where})`,
    `//   No hay FK; la consistencia la garantiza la aplicación. Indexar ${mongoSide.columns.join(', ')} en Mongo.`,
  ].join('\n')
}

/** Script `mongosh` (RF-60/61): colecciones con validador, índices y referencias lógicas. */
export function exportMongo(input: ExportInput, opts: ExportOptions = {}): string {
  const steps = orderedSteps(input.steps)
  const onlyStep = opts.stepId ? steps.find((s) => s.id === opts.stepId) : undefined
  const tables = new Map(input.model.tables.map((t) => [t.key, t]))
  const out: string[] = [
    `// ${input.projectName} · MongoDB (mongosh)`,
    `// Generado por StepDB. ${onlyStep ? `Colecciones del step ${onlyStep.slug}.` : 'Modelo completo.'}`,
    '',
  ]
  let any = false
  for (const step of steps) {
    if (onlyStep && step.id !== onlyStep.id) continue
    const collections = input.model.tables.filter((t) => t.store === 'mongo' && t.stepId === step.id)
    if (collections.length === 0) continue
    any = true
    out.push(`// ${'='.repeat(72)}`)
    out.push(`// Step ${String(step.position).padStart(2, '0')} · ${step.name} (${formatWorkDate(step.workDate)})`)
    if (step.description) out.push(`// ${step.description}`)
    out.push(`// ${'='.repeat(72)}`, '')
    for (const t of collections) {
      const schema = JSON.stringify({ $jsonSchema: collectionSchema(t) }, null, 2)
      out.push(`db.createCollection(${JSON.stringify(t.name)}, {\n  validator: ${indent(schema, 2)},\n  validationLevel: 'moderate',\n});`)
      for (const idx of t.indexes) {
        if (idx.pk) continue
        const keys = Object.fromEntries(idx.columns.map((c) => [c.replace(/^`|`$/g, ''), 1]))
        const options: Record<string, unknown> = {}
        if (idx.name) options.name = idx.name
        if (idx.unique) options.unique = true
        const optText = Object.keys(options).length ? `, ${JSON.stringify(options)}` : ''
        out.push(`db.getCollection(${JSON.stringify(t.name)}).createIndex(${JSON.stringify(keys)}${optText});`)
      }
      const refs = input.model.relations.filter((r) => r.kind === 'logical' && (r.from.table === t.key || r.to.table === t.key))
      for (const r of refs) out.push(logicalRefComment(r, t, tables))
      out.push('')
    }
  }
  if (!any) out.push('// No hay colecciones MongoDB en este alcance.')
  return out.join('\n').trimEnd() + '\n'
}
