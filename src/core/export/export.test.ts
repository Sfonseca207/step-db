import { describe, expect, it } from 'vitest'
import { loadGasAppSeed } from '../../../server/seed/gasapp/index.ts'
import { buildProjectModel } from '../model.ts'
import type { StepSource } from '../types.ts'
import { collectionSchema, exportCombinedDbml, exportMongo, exportMssql, objectName, splitViewBatches, type ExportInput } from './index.ts'

function gasapp(): ExportInput {
  const seed = loadGasAppSeed()
  const sources: StepSource[] = seed.steps.map((s, i) => ({
    id: `s${i + 1}`,
    slug: s.slug,
    position: i + 1,
    files: { model: s.files.model, mongo: s.files.mongo },
  }))
  const { model, errors } = buildProjectModel(sources)
  expect(errors).toEqual([])
  return {
    projectName: seed.name,
    model: model!,
    steps: seed.steps.map((s, i) => ({
      id: `s${i + 1}`,
      slug: s.slug,
      name: s.name,
      position: i + 1,
      workDate: s.workDate,
      description: s.description,
      color: s.color,
      views: s.files.views,
    })),
  }
}

describe('export SQL Server', () => {
  const sql = exportMssql(gasapp())

  it('coincide con el snapshot', async () => {
    await expect(sql).toMatchFileSnapshot('./__snapshots__/gasapp.mssql.sql')
  })

  it('crea schemas, usa GO y pone las FKs después de todas las tablas', () => {
    expect(sql).toMatch(/IF NOT EXISTS \(SELECT 1 FROM sys\.schemas WHERE name = N'ventas'\)/)
    expect(sql).toMatch(/^GO$/m)
    const lastCreate = sql.lastIndexOf('CREATE TABLE')
    const firstFk = sql.indexOf('FOREIGN KEY')
    const firstIndex = sql.indexOf('CREATE INDEX')
    const firstView = sql.indexOf('CREATE VIEW')
    expect(firstFk).toBeGreaterThan(lastCreate)
    expect(firstIndex).toBeGreaterThan(firstFk)
    expect(firstView).toBeGreaterThan(firstIndex)
  })

  it('no contiene objetos Mongo', () => {
    expect(sql).not.toMatch(/\[mongo\]/)
    expect(sql).not.toMatch(/log_envio_venta|log_evento_factura/)
  })

  it('traduce enums a CHECK, identidad y defaults', () => {
    expect(sql).toMatch(/\[estado\] NVARCHAR\(255\) NOT NULL DEFAULT \(N'registrada'\) CHECK \(\[estado\] IN \(N'registrada', N'anulada'\)\)/)
    expect(sql).toMatch(/\[id\] bigint IDENTITY\(1, 1\) PRIMARY KEY/)
    expect(sql).toMatch(/\[fecha\] datetime2 NOT NULL DEFAULT \(sysutcdatetime\(\)\)/)
    expect(sql).toMatch(/\[facturada\] bit NOT NULL DEFAULT \(0\)/)
  })

  it('por step: incremental con columnas agregadas y FKs hacia steps anteriores', () => {
    const step3 = exportMssql(gasapp(), { stepId: 's3' })
    expect(step3).toMatch(/CREATE TABLE \[facturacion\]\.\[factura\]/)
    expect(step3).not.toMatch(/CREATE TABLE \[ventas\]\.\[venta\]/)
    expect(step3).toMatch(/ALTER TABLE \[ventas\]\.\[venta\] ADD \[facturada\] bit NOT NULL DEFAULT \(0\);/)
    expect(step3).toMatch(/REFERENCES \[ventas\]\.\[venta\] \(\[id\]\)/)
    expect(step3).toMatch(/REFERENCES \[terceros\]\.\[tercero\] \(\[id\]\)/)
    expect(step3).toMatch(/CREATE VIEW facturacion\.v_venta_facturada/)
    const step1 = exportMssql(gasapp(), { stepId: 's1' })
    expect(step1).not.toMatch(/\[facturada\]/)
    expect(step1).not.toMatch(/\[tercero_id\]/)
  })

  it('idempotente envuelve cada CREATE TABLE', async () => {
    const idem = exportMssql(gasapp(), { idempotent: true })
    expect(idem).toMatch(/IF OBJECT_ID\(N'ventas\.venta', N'U'\) IS NULL\nBEGIN\nCREATE TABLE/)
    expect(idem).toMatch(/CREATE OR ALTER VIEW/)
    await expect(idem).toMatchFileSnapshot('./__snapshots__/gasapp.idempotent.mssql.sql')
  })

  it('los nombres de constraints no superan los 128 caracteres de SQL Server', () => {
    expect(objectName('FK', 'venta', 'tercero_id', 'tercero')).toBe('FK_venta_tercero_id_tercero')
    const long = objectName('FK', 'a'.repeat(80), 'columna_larga', 'b'.repeat(80))
    expect(long).toHaveLength(128)
    expect(long).not.toBe(objectName('FK', 'a'.repeat(80), 'columna_larga', 'b'.repeat(81)))
  })

  it('divide las vistas en lotes', () => {
    expect(splitViewBatches('CREATE VIEW a AS SELECT 1;\nCREATE VIEW b AS SELECT 2;')).toHaveLength(2)
    expect(splitViewBatches('CREATE VIEW a AS SELECT 1\nGO\nCREATE VIEW b AS SELECT 2')).toHaveLength(2)
  })
})

describe('export MongoDB', () => {
  const js = exportMongo(gasapp())

  it('coincide con el snapshot', async () => {
    await expect(js).toMatchFileSnapshot('./__snapshots__/gasapp.mongo.js')
  })

  it('anida los campos punteados en $jsonSchema', () => {
    const log = gasapp().model.tables.find((t) => t.key === 'mongo.log_envio_venta')!
    const schema = collectionSchema(log)
    expect(schema.properties?.respuesta).toEqual({
      bsonType: 'object',
      properties: { codigo: { bsonType: 'int' }, mensaje: { bsonType: 'string' } },
    })
    expect(schema.required).toEqual(['_id', 'venta_id', 'servicio', 'estado', 'intentos', 'creado_en'])
    expect(js).toMatch(/"respuesta": \{\s+"bsonType": "object",\s+"properties": \{\s+"codigo"/)
  })

  it('incluye índices, arrays tipados y comentarios de referencias lógicas', () => {
    expect(js).toMatch(/createIndex\(\{"venta_id":1,"servicio":1\}\)/)
    expect(js).toMatch(/"etiquetas": \{\s+"bsonType": "array",\s+"items": \{\s+"bsonType": "string"/)
    expect(js).toMatch(/Referencia lógica: log_envio_venta\.venta_id → ventas\.venta\.id \(SQL Server\)/)
    expect(js).toMatch(/No hay FK; la consistencia la garantiza la aplicación\. Indexar venta_id en Mongo\./)
  })
})

describe('export DBML combinado', () => {
  const dbml = exportCombinedDbml(gasapp())

  it('coincide con el snapshot', async () => {
    await expect(dbml).toMatchFileSnapshot('./__snapshots__/gasapp.combined.dbml')
  })

  it('vuelve a parsear con las mismas tablas y relaciones', () => {
    const input = gasapp()
    const reparsed = buildProjectModel([{ id: 'x', slug: '01-x', position: 1, files: { model: dbml, mongo: '' } }])
    // El archivo combinado mezcla SQL y Mongo en un solo "model": la única queja válida es la de store.
    const nonStore = reparsed.errors.filter((e) => e.code !== 'store')
    expect(nonStore).toEqual([])
    expect(dbml).toMatch(/TableGroup step_01_recepcion_ventas \[color: #E5484D/)
    expect(dbml).toMatch(/Table ventas\.venta \[headercolor: #E5484D/)
    expect(dbml).toMatch(/"respuesta\.codigo" int/)
    expect((dbml.match(/^Ref/gm) ?? []).length).toBe(input.model.relations.length)
  })
})
