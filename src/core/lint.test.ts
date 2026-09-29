import { describe, expect, it } from 'vitest'
import { lintModel } from './lint.ts'
import { buildProjectModel } from './model.ts'
import { DEFAULT_CONVENTIONS } from './schemas.ts'

function lint(model: string, mongo = '', conventions = DEFAULT_CONVENTIONS) {
  const { model: m, errors } = buildProjectModel([{ id: 's1', slug: '01-a', position: 1, files: { model, mongo } }], conventions)
  expect(errors).toEqual([])
  return lintModel(m!, conventions)
}

const codes = (list: { code?: string; table?: string }[]) => list.map((w) => `${w.code}:${w.table}`).sort()

describe('lintModel (RF-70)', () => {
  it('tabla sin PK', () => {
    expect(codes(lint('Table ventas.x {\n  nombre varchar(10)\n}'))).toEqual(['no-pk:ventas.x'])
  })

  it('casing de tablas y columnas', () => {
    const w = lint('Table ventas.VentaDiaria {\n  id int [pk]\n  FechaVenta date\n}')
    expect(codes(w)).toEqual(['case:ventas.VentaDiaria', 'case:ventas.VentaDiaria'])
    expect(w.find((x) => x.message.includes('FechaVenta'))?.line).toBe(3)
    const camel = lint('Table ventas.ventaDiaria {\n  id int [pk]\n  fechaVenta date\n}', '', { ...DEFAULT_CONVENTIONS, case: 'camelCase' })
    expect(camel).toEqual([])
  })

  it('columna con patrón de FK sin Ref', () => {
    expect(codes(lint('Table ventas.venta {\n  id int [pk]\n  cliente_id int\n}'))).toEqual(['fk-without-ref:ventas.venta'])
  })

  it('FK sin índice en SQL (y con índice no avisa)', () => {
    const base = 'Table a.padre {\n  id int [pk]\n}\n'
    expect(codes(lint(`${base}Table a.hija {\n  id int [pk]\n  padre_id int [ref: > a.padre.id]\n}`))).toEqual([
      'fk-without-index:a.hija',
    ])
    expect(lint(`${base}Table a.hija {\n  id int [pk]\n  padre_id int [ref: > a.padre.id]\n  indexes {\n    padre_id\n  }\n}`)).toEqual([])
    // Un índice compuesto que empieza por la FK también sirve.
    expect(
      lint(`${base}Table a.hija {\n  id int [pk]\n  padre_id int [ref: > a.padre.id]\n  f date\n  indexes {\n    (padre_id, f)\n  }\n}`),
    ).toEqual([])
  })

  it('referencia lógica sin índice en Mongo', () => {
    const w = lint('Table a.venta {\n  id int [pk]\n}', 'Table mongo.log_x {\n  _id objectId [pk]\n  venta_id long\n}\nRef: mongo.log_x.venta_id > a.venta.id')
    expect(codes(w)).toEqual(['logical-ref-without-index:mongo.log_x'])
  })

  it('tabla SQL con nombre de log sugiere Mongo', () => {
    const w = lint('Table ventas.bitacora_envios {\n  id int [pk]\n}\nTable ventas.log {\n  id int [pk]\n}\nTable ventas.catalogo {\n  id int [pk]\n}')
    expect(codes(w)).toEqual(['sql-log-table:ventas.bitacora_envios', 'sql-log-table:ventas.log'])
  })

  it('FK con tipo distinto al de la columna referenciada', () => {
    const w = lint('Table a.padre {\n  id bigint [pk]\n}\nTable a.hija {\n  id int [pk]\n  padre_id int [ref: > a.padre.id]\n  indexes {\n    padre_id\n  }\n}')
    expect(codes(w)).toEqual(['fk-type-mismatch:a.hija'])
    expect(w[0].line).toBe(6)
    expect(w[0].message).toBe("'a.hija.padre_id' es int pero referencia a 'a.padre.id', que es bigint")
  })

  it('el proyecto de ejemplo solo avisa la FK tercero_id sin índice', async () => {
    const { loadGasAppSeed } = await import('../../server/seed/gasapp/index.ts')
    const seed = loadGasAppSeed()
    const { model } = buildProjectModel(
      seed.steps.map((s, i) => ({ id: `s${i + 1}`, slug: s.slug, position: i + 1, files: { model: s.files.model, mongo: s.files.mongo } })),
    )
    expect(codes(lintModel(model!, DEFAULT_CONVENTIONS))).toEqual(['fk-without-index:ventas.venta'])
  })
})
