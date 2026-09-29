import { describe, expect, it } from 'vitest'
import { loadGasAppSeed } from '../../server/seed/gasapp/index.ts'
import { buildProjectModel, formatDiagnostic, foreignColumnsOfStep, locate, mergeSources, parseMongoType } from './model.ts'
import { diffModels, isEmptyDiff, summarizeDiff } from './diff.ts'
import { makeStepSlug, slugify } from './slug.ts'
import type { StepSource } from './types.ts'

function seedSteps(): StepSource[] {
  return loadGasAppSeed().steps.map((s, i) => ({
    id: `s${i + 1}`,
    slug: s.slug,
    position: i + 1,
    files: { model: s.files.model, mongo: s.files.mongo },
  }))
}

function step(id: string, position: number, model: string, mongo = ''): StepSource {
  return { id, slug: `${String(position).padStart(2, '0')}-${id}`, position, files: { model, mongo } }
}

describe('mergeSources / locate', () => {
  it('construye el mapa de offsets por step y archivo', () => {
    const merged = mergeSources([step('b', 2, 'x\ny'), step('a', 1, 'uno\ndos\ntres', 'm')])
    expect(merged.text).toBe('uno\ndos\ntres\nm\nx\ny\n')
    expect(merged.chunks.map((c) => [c.stepId, c.kind, c.startLine, c.lineCount])).toEqual([
      ['a', 'model', 1, 3],
      ['a', 'mongo', 4, 1],
      ['b', 'model', 5, 2],
      ['b', 'mongo', 7, 1],
    ])
    const where = locate(merged.chunks, 6)
    expect(where?.chunk.stepId).toBe('b')
    expect(where?.line).toBe(2)
  })
})

describe('buildProjectModel', () => {
  it('parsea el proyecto demo multi-step sin errores', () => {
    const { model, errors } = buildProjectModel(seedSteps())
    expect(errors).toEqual([])
    expect(model).not.toBeNull()
    const keys = model!.tables.map((t) => t.key).sort()
    expect(keys).toEqual([
      'core.estacion',
      'facturacion.factura',
      'facturacion.resolucion',
      'mongo.log_envio_venta',
      'mongo.log_evento_factura',
      'terceros.tercero',
      'terceros.vehiculo',
      'ventas.producto',
      'ventas.venta',
      'ventas.venta_pago',
    ])
    const factura = model!.tables.find((t) => t.key === 'facturacion.factura')!
    expect(factura.stepId).toBe('s3')
    expect(factura.store).toBe('sqlserver')
    expect(factura.loc).toMatchObject({ stepId: 's3', kind: 'model' })
    const log = model!.tables.find((t) => t.key === 'mongo.log_envio_venta')!
    expect(log.store).toBe('mongo')
    expect(log.loc.kind).toBe('mongo')
  })

  it('anota stepId a nivel de columna con [step: "…"]', () => {
    const { model } = buildProjectModel(seedSteps())
    const venta = model!.tables.find((t) => t.key === 'ventas.venta')!
    expect(venta.stepId).toBe('s1')
    expect(venta.columns.find((c) => c.name === 'total')!.stepId).toBe('s1')
    expect(venta.columns.find((c) => c.name === 'tercero_id')!.stepId).toBe('s2')
    expect(venta.columns.find((c) => c.name === 'facturada')!.stepId).toBe('s3')
    expect(foreignColumnsOfStep(model!, 's3')).toEqual([{ table: 'ventas.venta', column: 'facturada' }])
  })

  it('clasifica relaciones fk y lógicas y normaliza el lado N', () => {
    const { model } = buildProjectModel(seedSteps())
    const rels = model!.relations
    const logical = rels.filter((r) => r.kind === 'logical')
    expect(logical).toHaveLength(2)
    expect(logical.map((r) => r.from.table).sort()).toEqual(['mongo.log_envio_venta', 'mongo.log_evento_factura'])
    const pago = rels.find((r) => r.from.table === 'ventas.venta_pago')!
    expect(pago.kind).toBe('fk')
    expect(pago.op).toBe('>')
    expect(pago.to).toMatchObject({ table: 'ventas.venta', columns: ['id'], cardinality: '1' })
    expect(pago.from.cardinality).toBe('N')
    const oneToOne = rels.find((r) => r.op === '-')!
    expect([oneToOne.from.table, oneToOne.to.table].sort()).toEqual(['facturacion.factura', 'ventas.venta'])
    // La ref de venta.tercero_id se declara en el step 02.
    const terceroRef = rels.find((r) => r.from.table === 'ventas.venta' && r.to.table === 'terceros.tercero')!
    expect(terceroRef.stepId).toBe('s2')
  })

  it('reconoce enums y tipos Mongo', () => {
    const { model } = buildProjectModel(seedSteps())
    const venta = model!.tables.find((t) => t.key === 'ventas.venta')!
    expect(venta.columns.find((c) => c.name === 'estado')!.enumRef).toBe('ventas.estado_venta')
    expect(model!.enums.map((e) => e.key)).toEqual(['ventas.estado_venta'])
    expect(parseMongoType('array<string>')).toEqual({ base: 'array', items: 'string' })
    expect(parseMongoType('int[]')).toEqual({ base: 'array', items: 'int' })
    expect(parseMongoType('varchar')).toBeNull()
  })

  it('traduce errores de parseo a step · archivo:línea', () => {
    const steps = [
      step('a', 1, 'Table a {\n  id int [pk]\n}'),
      step('b', 2, '// comentario\nTable b {\n  id int pk extra\n}'),
    ]
    const { model, errors } = buildProjectModel(steps)
    expect(model).toBeNull()
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toMatchObject({ stepId: 'b', stepSlug: '02-b', kind: 'model', line: 3 })
    expect(formatDiagnostic(errors[0])).toMatch(/^02-b · model:3 — /)
  })

  it('ubica errores en el archivo mongo del step', () => {
    const steps = [step('a', 1, 'Table a {\n  id int [pk]\n}', 'Table mongo.l {\n  _id objectId [pk]\n  x varchar\n}')]
    const { errors } = buildProjectModel(steps)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ stepId: 'a', kind: 'mongo', line: 3, code: 'mongo-type' })
  })

  it('rechaza referencias a tablas de otro step inexistentes, con ubicación', () => {
    const steps = [step('a', 1, 'Table a {\n  id int [pk]\n}'), step('b', 2, '\n\nRef: a.id > zzz.id')]
    const { errors } = buildProjectModel(steps)
    expect(errors[0]).toMatchObject({ stepId: 'b', kind: 'model', line: 3 })
  })

  it('valida el store: mongo en su archivo y schema', () => {
    const wrongFile = buildProjectModel([step('a', 1, 'Table mongo.x {\n _id objectId\n}')])
    expect(wrongFile.errors[0]).toMatchObject({ code: 'store', kind: 'model', line: 1 })
    const wrongSchema = buildProjectModel([step('a', 1, '', 'Table ventas.x {\n id int\n}')])
    expect(wrongSchema.errors[0]).toMatchObject({ code: 'store', kind: 'mongo', line: 1 })
  })

  it('rechaza [step] con un slug desconocido', () => {
    const { errors } = buildProjectModel([step('a', 1, 'Table a {\n  id int [pk]\n  x int [step: "99-nada"]\n}')])
    expect(errors[0]).toMatchObject({ code: 'unknown-step', line: 3 })
  })

  it('un proyecto vacío produce un modelo vacío', () => {
    expect(buildProjectModel([step('a', 1, '')])).toEqual({ model: { tables: [], relations: [], enums: [] }, errors: [] })
  })
})

describe('diffModels', () => {
  const base = 'Table a {\n  id int [pk]\n  nombre varchar(10)\n}\nTable b {\n  id int [pk]\n  a_id int [ref: > a.id]\n}'

  it('detecta tablas, columnas y relaciones agregadas', () => {
    const prev = buildProjectModel([step('a', 1, 'Table a {\n  id int [pk]\n}')]).model
    const next = buildProjectModel([step('a', 1, base)]).model
    const diff = diffModels(prev, next)
    expect(diff.tables.added).toEqual(['dbo.b'])
    expect(diff.columns.added).toEqual(['dbo.a.nombre', 'dbo.b.id', 'dbo.b.a_id'])
    expect(diff.relations.added).toHaveLength(1)
    expect(summarizeDiff(diff)).toBe('+1 tabla, +1 columna, +1 relación')
  })

  it('detecta eliminaciones y modificaciones', () => {
    const prev = buildProjectModel([step('a', 1, base)]).model
    const next = buildProjectModel([step('a', 1, 'Table a {\n  id int [pk]\n  nombre varchar(20) [not null]\n}')]).model
    const diff = diffModels(prev, next)
    expect(diff.tables.removed).toEqual(['dbo.b'])
    expect(diff.columns.changed).toEqual(['dbo.a.nombre'])
    expect(diff.relations.removed).toHaveLength(1)
    expect(summarizeDiff(diff)).toBe('~1 columna, −1 tabla, −1 relación')
  })

  it('no cuenta aparte las columnas punteadas de una colección nueva', () => {
    const prev = buildProjectModel([step('a', 1, 'Table a {\n  id int [pk]\n}')]).model
    const next = buildProjectModel([
      step('a', 1, 'Table a {\n  id int [pk]\n}', 'Table mongo.l {\n  _id objectId [pk]\n  "r.codigo" int\n  "r.x.y" string\n}'),
    ]).model
    expect(summarizeDiff(diffModels(prev, next))).toBe('+1 tabla')
  })

  it('modelos iguales → diff vacío', () => {
    const m = buildProjectModel([step('a', 1, base)]).model
    expect(isEmptyDiff(diffModels(m, m))).toBe(true)
  })
})

describe('slug', () => {
  it('genera slugs NN-nombre sin tildes', () => {
    expect(slugify('Recepción de Ventas!')).toBe('recepcion-de-ventas')
    expect(makeStepSlug(2, 'Facturación')).toBe('02-facturacion')
  })
})
