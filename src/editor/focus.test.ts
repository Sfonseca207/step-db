import { describe, expect, it } from 'vitest'
import { loadGasAppSeed } from '../../server/seed/gasapp/index.ts'
import { buildProjectModel } from '../core/model.ts'
import { computeFocus } from './focus.ts'

const model = buildProjectModel(
  loadGasAppSeed().steps.map((s, i) => ({ id: `s${i + 1}`, slug: s.slug, position: i + 1, files: { model: s.files.model, mongo: s.files.mongo } })),
).model!

const sorted = (set: Set<string> | undefined) => [...(set ?? [])].sort()

describe('computeFocus (RF-15)', () => {
  it('Todos o sin step: sin enfoque', () => {
    expect(computeFocus(model, 'all', 's2')).toBeNull()
    expect(computeFocus(model, 'step', null)).toBeNull()
  })

  it('Solo step: sus tablas y las que recibieron columnas suyas', () => {
    const f = computeFocus(model, 'step', 's2')
    expect(sorted(f?.tables)).toEqual(['terceros.tercero', 'terceros.vehiculo', 'ventas.venta'])
    expect(f?.relations.size).toBe(2)
  })

  it('Step + dependencias: solo las tablas con las que el step se relaciona', () => {
    const f = computeFocus(model, 'deps', 's2')
    expect(sorted(f?.tables)).toEqual(['facturacion.factura', 'terceros.tercero', 'terceros.vehiculo', 'ventas.venta'])
    // vehiculo→tercero, venta.tercero_id→tercero y factura.tercero_id→tercero
    expect(f?.relations.size).toBe(3)
  })

  it('un step Mongo depende de las tablas SQL que referencia', () => {
    const f = computeFocus(model, 'deps', 's4')
    expect(sorted(f?.tables)).toEqual(['facturacion.factura', 'mongo.log_envio_venta', 'mongo.log_evento_factura', 'ventas.venta'])
  })
})
