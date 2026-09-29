import { describe, expect, it } from 'vitest'
import { DEFAULT_CONVENTIONS } from '../../core/schemas.ts'
import type { DbmlKind, StepSource } from '../../core/types.ts'
import { buildCatalog, completeDbml, type Catalog } from './dbml-complete.ts'

const INICIO = `Table dbo.cliente [note: 'Quien compra'] {
  id bigint [pk, increment]
  nombre nvarchar(100) [not null] // nombre comercial
  creado_en datetime2 [not null, default: \`sysutcdatetime()\`]
}

Table dbo.pedido {
  id bigint [pk, increment]
  total decimal(18, 2)
}

Enum dbo.estado_pedido {
  abierto
  cerrado
}

TablePartial auditoria {
  actualizado_en datetime2
}
`

const VENTAS = `Table ventas.factura {
  id uniqueidentifier [pk]
}

Table sin_schema {
  codigo int [primary key]
}
`

const MONGO = `Table mongo.evento {
  _id objectId [pk]
  etiquetas string[]
}
`

const sources: StepSource[] = [
  { id: 's1', slug: '01-inicio', position: 1, files: { model: INICIO, mongo: MONGO } },
  { id: 's2', slug: '02-ventas', position: 2, files: { model: VENTAS, mongo: '' } },
]

const catalog: Catalog = buildCatalog({
  sources,
  model: null,
  steps: [
    { slug: '01-inicio', name: 'Inicio', number: '01' },
    { slug: '02-ventas', name: 'Ventas', number: '02' },
  ],
  conventions: DEFAULT_CONVENTIONS,
})

/** Sugerencias con el cursor en `|`. */
function at(marked: string, kind: DbmlKind = 'model') {
  const offset = marked.indexOf('|')
  const text = marked.replace('|', '')
  const found = completeDbml({ text, offset, kind, catalog })
  return {
    found,
    labels: found?.items.map((i) => i.label) ?? [],
    replaced: found ? text.slice(found.from, found.to) : null,
    item: (label: string) => found?.items.find((i) => i.label === label),
  }
}

describe('buildCatalog', () => {
  it('lee tablas, columnas y claves de todos los steps', () => {
    expect(catalog.tables.map((t) => t.ref)).toEqual(['dbo.cliente', 'dbo.pedido', 'mongo.evento', 'ventas.factura', 'sin_schema'])
    const cliente = catalog.tables[0]
    expect(cliente.columns).toEqual([
      { name: 'id', type: 'bigint', pk: true },
      { name: 'nombre', type: 'nvarchar(100)', pk: false },
      { name: 'creado_en', type: 'datetime2', pk: false },
    ])
    expect(catalog.tables.find((t) => t.ref === 'dbo.pedido')?.columns[1]).toEqual({ name: 'total', type: 'decimal(18, 2)', pk: false })
    expect(catalog.tables.find((t) => t.ref === 'sin_schema')?.columns[0].pk).toBe(true)
    expect(catalog.tables.find((t) => t.ref === 'mongo.evento')).toMatchObject({ store: 'mongo', columns: [{ name: '_id' }, { name: 'etiquetas', type: 'string[]' }] })
  })

  it('lee enums y parciales', () => {
    expect(catalog.enums).toEqual(['dbo.estado_pedido'])
    expect(catalog.partials).toEqual(['auditoria'])
  })

  it('sigue leyendo aunque el archivo esté a medio escribir', () => {
    const broken = buildCatalog({
      sources: [{ id: 's', slug: 's', position: 1, files: { model: "Table dbo.a {\n  id int [pk, note: 'sin cerrar\n  b int [\n}\nTable dbo.c {\n  id int\n}\n", mongo: '' } }],
      model: null,
      steps: [],
      conventions: DEFAULT_CONVENTIONS,
    })
    expect(broken.tables.map((t) => t.ref)).toEqual(['dbo.a', 'dbo.c'])
  })

  it('añade las columnas que el modelo resolvió desde un parcial', () => {
    const withModel = buildCatalog({
      sources: [{ id: 's', slug: 's', position: 1, files: { model: 'Table cosa {\n  id int [pk]\n  ~auditoria\n}\n', mongo: '' } }],
      model: {
        tables: [
          {
            key: 'dbo.cosa',
            schema: 'dbo',
            name: 'cosa',
            store: 'sqlserver',
            stepId: 's',
            columns: [
              { name: 'id', type: 'int', pk: true, notNull: true, unique: false, increment: false, stepId: 's', line: 2 },
              { name: 'actualizado_en', type: 'datetime2', pk: false, notNull: false, unique: false, increment: false, stepId: 's', line: 1 },
            ],
            indexes: [],
            loc: { stepId: 's', kind: 'model', startLine: 1, endLine: 4 },
          },
        ],
        relations: [],
        enums: [],
      },
      steps: [],
      conventions: DEFAULT_CONVENTIONS,
    })
    expect(withModel.tables[0]).toMatchObject({ ref: 'cosa', columns: [{ name: 'id' }, { name: 'actualizado_en' }] })
  })
})

describe('completeDbml · nivel superior', () => {
  it('ofrece las declaraciones y reemplaza lo tecleado', () => {
    const r = at('Tabl|')
    expect(r.labels).toEqual(['Table', 'Ref', 'Enum', 'TablePartial'])
    expect(r.replaced).toBe('Tabl')
    expect(r.item('Table')?.insert).toContain('Table ${1:dbo}.${2:tabla}')
    expect(r.item('Table')?.insert).toContain('id bigint [pk, increment]')
  })

  it('en el archivo mongo la tabla es una colección y no hay enums', () => {
    const r = at('|', 'mongo')
    expect(r.labels).toEqual(['Table', 'Ref', 'TablePartial'])
    expect(r.item('Table')?.insert).toContain('Table mongo.')
  })

  it('tras `Table ` ofrece los schemas', () => {
    expect(at('Table |').labels).toEqual(['dbo', 'ventas'])
    expect(at('Table |', 'mongo').labels).toEqual(['mongo'])
    expect(at('Table dbo.|').found).toBeNull()
  })

  it('no sugiere en comentarios ni en textos', () => {
    expect(at('// Tab|').found).toBeNull()
    expect(at('/* Tab| */').found).toBeNull()
    expect(at("Table dbo.x [note: 'Tab|']").found).toBeNull()
    expect(at("Note: '''\n  Tab|\n'''").found).toBeNull()
  })
})

describe('completeDbml · cuerpo de tabla', () => {
  it('en una tabla vacía propone la clave primaria y las FK por convención', () => {
    const r = at('Table dbo.linea {\n  |\n}')
    expect(r.labels).toEqual(['id', 'cliente_id', 'pedido_id', 'factura_id', 'sin_schema_id', 'indexes', 'Note'])
    expect(r.item('id')?.insert).toBe('id bigint [pk, increment]')
    expect(r.item('cliente_id')?.insert).toBe('cliente_id bigint [ref: > dbo.cliente.id]')
    expect(r.item('factura_id')?.insert).toBe('factura_id uniqueidentifier [ref: > ventas.factura.id]')
    expect(r.item('sin_schema_id')?.insert).toBe('sin_schema_id int [ref: > sin_schema.codigo]')
  })

  it('no repite columnas que la tabla ya tiene, estén antes o después del cursor', () => {
    const r = at('Table dbo.linea {\n  id bigint [pk]\n  cli|\n  pedido_id bigint\n}')
    expect(r.labels).toEqual(['cliente_id', 'factura_id', 'sin_schema_id', 'indexes', 'Note'])
    expect(r.replaced).toBe('cli')
  })

  it('tras el nombre de la columna ofrece los tipos de SQL Server y los enums', () => {
    const r = at('Table dbo.linea {\n  nombre nv|\n}')
    expect(r.labels.slice(0, 4)).toEqual(['bigint', 'int', 'nvarchar', 'bit'])
    expect(r.labels).toContain('dbo.estado_pedido')
    expect(r.labels).not.toContain('objectId')
    expect(r.replaced).toBe('nv')
    expect(r.item('nvarchar')).toMatchObject({ insert: 'nvarchar(${1:100})', snippet: true })
  })

  it('en el archivo mongo ofrece solo tipos de Mongo', () => {
    const r = at('Table mongo.log {\n  _id |\n}', 'mongo')
    expect(r.labels.slice(0, 3)).toEqual(['objectId', 'string', 'int'])
    expect(r.labels).toContain('string[]')
    expect(r.labels).not.toContain('bigint')
  })

  it('si el nombre sigue la convención de FK, propone primero el tipo con su relación', () => {
    const r = at('Table dbo.linea {\n  cliente_id |\n}')
    expect(r.found?.items[0]).toMatchObject({ label: 'bigint → dbo.cliente.id', insert: 'bigint [ref: > dbo.cliente.id]' })
  })

  it('no sugiere dentro de los argumentos del tipo ni después de él', () => {
    expect(at('Table dbo.linea {\n  nombre nvarchar(|\n}').found).toBeNull()
    expect(at('Table dbo.linea {\n  nombre nvarchar(100) |\n}').found).toBeNull()
    expect(at('Table mongo.log {\n  tags string[|\n}', 'mongo').found).toBeNull()
  })

  it('ofrece los parciales tras `~`', () => {
    const r = at('Table dbo.linea {\n  ~au|\n}')
    expect(r.labels).toEqual(['~auditoria'])
    expect(r.replaced).toBe('~au')
  })
})

describe('completeDbml · settings', () => {
  it('ofrece los settings de columna', () => {
    const r = at('Table dbo.linea {\n  id bigint [|]\n}')
    expect(r.labels).toEqual(['pk', 'increment', 'not null', 'null', 'unique', 'ref:', 'default:', 'note:', 'step:'])
    expect(at('Table mongo.log {\n  _id objectId [|]\n}', 'mongo').labels).not.toContain('increment')
  })

  it('no repite los ya escritos ni ofrece los incompatibles', () => {
    const r = at('Table dbo.linea {\n  id bigint [not null, |, unique]\n}')
    expect(r.labels).toEqual(['pk', 'increment', 'ref:', 'default:', 'note:', 'step:'])
  })

  it('reemplaza un setting de dos palabras entero', () => {
    const r = at('Table dbo.linea {\n  id bigint [pk, not n|]\n}')
    expect(r.replaced).toBe('not n')
    expect(r.labels).toContain('not null')
  })

  it('distingue los settings de tabla, relación e índice', () => {
    expect(at('Table dbo.linea [|] {').labels).toEqual(['note:', 'headercolor:'])
    expect(at('Ref: dbo.pedido.id > dbo.cliente.id [|]').labels).toEqual(['delete:', 'update:'])
    expect(at('Table dbo.linea {\n  id int\n  indexes {\n    id [|]\n  }\n}').labels).toEqual(['unique', 'pk', 'name:', 'type:', 'note:'])
  })

  it('ofrece los valores de delete, update y type', () => {
    expect(at('Ref: dbo.pedido.id > dbo.cliente.id [delete: |]').labels).toEqual(['cascade', 'restrict', 'set null', 'set default', 'no action'])
    const r = at('Ref: dbo.pedido.id > dbo.cliente.id [delete: cascade, update: set n|]')
    expect(r.replaced).toBe('set n')
    expect(at('Table dbo.linea {\n  id int\n  indexes {\n    id [type: |]\n  }\n}').labels).toEqual(['btree', 'hash'])
  })

  it('ofrece valores por defecto según el tipo', () => {
    expect(at('Table dbo.linea {\n  creado_en datetime2 [default: |]\n}').labels).toEqual(['`sysutcdatetime()`', '`getdate()`', 'null'])
    expect(at('Table dbo.linea {\n  activo bit [not null, default: |]\n}').labels).toEqual(['0', '1', 'null'])
  })

  it('ofrece los slugs de los steps, con o sin comillas abiertas', () => {
    const bare = at('Table dbo.linea {\n  nota nvarchar(50) [step: |]\n}')
    expect(bare.labels).toEqual(['01-inicio', '02-ventas'])
    expect(bare.item('02-ventas')).toMatchObject({ insert: '"02-ventas"', detail: '02 Ventas' })

    const open = at('Table dbo.linea {\n  nota nvarchar(50) [step: "|"]\n}')
    expect(open.item('02-ventas')?.insert).toBe('02-ventas')
    expect(open.replaced).toBe('')

    const editing = at('Table dbo.linea {\n  nota nvarchar(50) [not null, step: "01-in|icio"]\n}')
    expect(editing.replaced).toBe('01-inicio')
  })

  it('no sugiere dentro de otras comillas', () => {
    expect(at('Table dbo.linea {\n  "mi col|" int\n}').found).toBeNull()
    expect(at('Table dbo.linea {\n  nota int [name: "x|"]\n}').found).toBeNull()
  })
})

describe('completeDbml · relaciones', () => {
  it('`ref:` pide primero el operador y luego la tabla', () => {
    const op = at('Table dbo.linea {\n  pedido_id bigint [ref: |]\n}')
    expect(op.labels).toEqual(['>', '<', '-', '<>'])
    expect(op.item('>')).toMatchObject({ insert: '> ', retrigger: true })

    const table = at('Table dbo.linea {\n  pedido_id bigint [not null, ref: > ped|]\n}')
    expect(table.labels).toEqual(['dbo.cliente', 'dbo.pedido', 'ventas.factura', 'sin_schema', 'mongo.evento'])
    expect(table.replaced).toBe('ped')
    expect(table.item('dbo.pedido')).toMatchObject({ insert: 'dbo.pedido.', retrigger: true })
  })

  it('tras la tabla ofrece sus columnas, la clave primero', () => {
    const r = at('Table dbo.linea {\n  x int [pk]\n  cliente_id bigint [ref: > dbo.cliente.|]\n}')
    expect(r.labels).toEqual(['id', 'nombre', 'creado_en'])
    expect(r.item('id')?.detail).toBe('bigint · pk')
    expect(r.replaced).toBe('')
    expect(at('Table dbo.linea {\n  c int [ref: > sin_schema.co|]\n}').labels).toEqual(['codigo'])
  })

  it('tras un schema ofrece sus tablas', () => {
    const r = at('Table dbo.linea {\n  c int [ref: > ventas.|]\n}')
    expect(r.labels).toEqual(['factura'])
    expect(r.item('factura')?.insert).toBe('factura.')
  })

  it('ve las tablas del archivo que se está editando aunque no parsee', () => {
    const local = buildCatalog({
      sources: [{ id: 's', slug: 's', position: 1, files: { model: 'Table dbo.nueva {\n  id int [pk]\n  otra_id int [ref: > \n}\n', mongo: '' } }],
      model: null,
      steps: [],
      conventions: DEFAULT_CONVENTIONS,
    })
    const text = 'Table dbo.nueva {\n  id int [pk]\n  otra_id int [ref: > '
    const found = completeDbml({ text: `${text}\n}\n`, offset: text.length, kind: 'model', catalog: local })
    expect(found?.items.map((i) => i.label)).toEqual(['dbo.nueva'])
  })

  it('completa los dos extremos de un `Ref:`', () => {
    expect(at('Ref: |').labels).toContain('dbo.pedido')
    expect(at('Ref fk_pedido: dbo.pedido.|').labels).toEqual(['id', 'total'])
    expect(at('Ref: dbo.pedido.id |').labels).toEqual(['>', '<', '-', '<>'])
    expect(at('Ref: dbo.pedido.id > |').labels).toContain('dbo.cliente')
    expect(at('Ref: dbo.pedido.id > dbo.cliente.|').labels).toEqual(['id', 'nombre', 'creado_en'])
    expect(at('Ref {\n  dbo.pedido.id > dbo.cliente.|\n}').labels).toEqual(['id', 'nombre', 'creado_en'])
  })

  it('en el archivo mongo van primero las colecciones', () => {
    expect(at('Ref: |', 'mongo').labels[0]).toBe('mongo.evento')
  })
})

describe('completeDbml · índices', () => {
  it('ofrece las columnas de la tabla, también en un índice compuesto', () => {
    const table = 'Table dbo.linea {\n  id int [pk]\n  pedido_id int\n  indexes {\n    CURSOR\n  }\n  despues int\n}'
    expect(at(table.replace('CURSOR', 'pe|')).labels).toEqual(['id', 'pedido_id', 'despues'])
    expect(at(table.replace('CURSOR', '(id, |)')).labels).toEqual(['id', 'pedido_id', 'despues'])
    expect(at(table.replace('CURSOR', 'id |')).found).toBeNull()
  })
})
