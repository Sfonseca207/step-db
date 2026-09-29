import type { Conventions } from '../core/schemas.ts'
import type { DbmlKind } from '../core/types.ts'

function applyCase(words: string[], mode: Conventions['case']): string {
  if (mode === 'snake_case') return words.join('_')
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1)
  const joined = words.map(cap).join('')
  return mode === 'camelCase' ? joined.charAt(0).toLowerCase() + joined.slice(1) : joined
}

/** Plantilla de tabla/colección que respeta las convenciones del proyecto (RF-34). */
export function tableTemplate(conv: Conventions, kind: DbmlKind, existing: Set<string>): { key: string; text: string } {
  const base = kind === 'mongo' ? ['nueva', 'coleccion'] : conv.tableNames === 'plural' ? ['nuevas', 'tablas'] : ['nueva', 'tabla']
  const schema = kind === 'mongo' ? 'mongo' : conv.defaultSqlSchema
  let name = applyCase(base, conv.case)
  for (let i = 2; existing.has(`${schema}.${name}`); i++) name = applyCase([...base, String(i)], conv.case)
  const created = applyCase(['creado', 'en'], conv.case)
  const text =
    kind === 'mongo'
      ? `Table mongo.${name} [note: 'Describe la colección'] {\n  _id objectId [pk]\n  ${created} date [not null]\n}\n`
      : `Table ${schema}.${name} [note: 'Describe la tabla'] {\n  ${conv.primaryKey} bigint [pk, increment]\n  ${created} datetime2 [not null, default: \`sysutcdatetime()\`]\n}\n`
  return { key: `${schema}.${name}`, text }
}
