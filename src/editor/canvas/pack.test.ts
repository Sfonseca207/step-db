import { describe, expect, it } from 'vitest'
import { packBlocks, type Block } from './pack.ts'

const block = (name: string, width: number, height: number): Block => ({ positions: { [name]: { x: 0, y: 0 } }, width, height })

describe('packBlocks', () => {
  const four = [block('a', 500, 600), block('b', 500, 400), block('c', 500, 600), block('d', 500, 500)]

  it('canvas ancho: todos los bloques en una fila, en orden', () => {
    const p = packBlocks(four, 4)
    expect(Object.values(p).every((pt) => pt.y === 0)).toBe(true)
    expect([p.a.x, p.b.x, p.c.x, p.d.x]).toEqual([0, 640, 1280, 1920])
  })

  it('canvas casi cuadrado: dos filas de dos', () => {
    const p = packBlocks(four, 0.85)
    expect([p.a, p.b]).toEqual([{ x: 0, y: 0 }, { x: 640, y: 0 }])
    expect(p.c).toEqual({ x: 0, y: 720 })
    expect(p.d).toEqual({ x: 640, y: 720 })
  })

  it('canvas alto: una columna', () => {
    const p = packBlocks(four, 0.2)
    expect([p.a.x, p.b.x, p.c.x, p.d.x]).toEqual([0, 0, 0, 0])
    expect(p.b.y).toBe(720)
  })

  it('sin bloques no falla', () => {
    expect(packBlocks([], 1.5)).toEqual({})
  })
})
