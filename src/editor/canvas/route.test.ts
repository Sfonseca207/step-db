import { describe, expect, it } from 'vitest'
import { MIN_STUB, STUB, roundedPath, routeRelation, type Obstacle } from './route.ts'

const table = (id: string, x: number, y: number, width = 200, height = 200): Obstacle => ({ id, x, y, width, height })

/** Todos los tramos son horizontales o verticales. */
const orthogonal = (points: { x: number; y: number }[]) =>
  points.every((p, i) => i === 0 || p.x === points[i - 1].x || p.y === points[i - 1].y)

describe('routeRelation', () => {
  it('tablas enfrentadas: canal vertical a mitad del hueco', () => {
    const r = routeRelation({ source: { x: 200, y: 50 }, target: { x: 600, y: 300 }, sourceDir: 1, targetDir: -1 })
    expect(r.points).toEqual([
      { x: 200, y: 50 },
      { x: 400, y: 50 },
      { x: 400, y: 300 },
      { x: 600, y: 300 },
    ])
    expect(r.path).toBe('M 200 50 L 392 50 Q 400 50 400 58 L 400 292 Q 400 300 408 300 L 600 300')
    expect({ x: r.labelX, y: r.labelY }).toEqual({ x: 400, y: 175 })
  })

  it('misma altura: una sola línea recta', () => {
    const r = routeRelation({ source: { x: 200, y: 80 }, target: { x: 600, y: 80 }, sourceDir: 1, targetDir: -1 })
    expect(r.points).toEqual([
      { x: 200, y: 80 },
      { x: 600, y: 80 },
    ])
    expect(r.path).toBe('M 200 80 L 600 80')
  })

  it('el canal esquiva una tabla que está en medio del hueco', () => {
    const r = routeRelation({
      source: { x: 200, y: 50 },
      target: { x: 900, y: 400 },
      sourceDir: 1,
      targetDir: -1,
      obstacles: [table('a', 0, 0), table('b', 900, 300), table('medio', 480, 100, 140, 200)],
      ignore: ['a', 'b'],
    })
    const channel = r.points[1].x
    expect(channel < 480 || channel > 620).toBe(true)
    expect(channel).toBeGreaterThanOrEqual(200 + MIN_STUB)
    expect(channel).toBeLessThanOrEqual(900 - MIN_STUB)
    expect(orthogonal(r.points)).toBe(true)
  })

  it('mismo lado: el canal va por fuera de la tabla más saliente', () => {
    const r = routeRelation({ source: { x: 300, y: 400 }, target: { x: 360, y: 60 }, sourceDir: 1, targetDir: 1 })
    expect(r.points.map((p) => p.x)).toEqual([300, 360 + STUB, 360 + STUB, 360])
    const left = routeRelation({ source: { x: 100, y: 400 }, target: { x: 40, y: 60 }, sourceDir: -1, targetDir: -1 })
    expect(left.points.map((p) => p.x)).toEqual([100, 40 - STUB, 40 - STUB, 40])
  })

  it('mismo lado: se aleja para no atravesar una tabla vecina', () => {
    const r = routeRelation({
      source: { x: 300, y: 500 },
      target: { x: 300, y: 50 },
      sourceDir: 1,
      targetDir: 1,
      obstacles: [table('vecina', 320, 200, 200, 150)],
    })
    expect(r.points[1].x).toBeGreaterThan(520)
    expect(orthogonal(r.points)).toBe(true)
  })

  it('lados opuestos sin hueco: rodea en S sin tramos diagonales', () => {
    const r = routeRelation({ source: { x: 300, y: 100 }, target: { x: 310, y: 400 }, sourceDir: 1, targetDir: -1 })
    expect(r.points).toHaveLength(6)
    expect(orthogonal(r.points)).toBe(true)
  })
})

describe('roundedPath', () => {
  it('reduce el radio cuando el tramo es más corto que el codo', () => {
    const d = roundedPath([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 6 },
      { x: 100, y: 6 },
    ])
    expect(d).toBe('M 0 0 L 47 0 Q 50 0 50 3 L 50 3 Q 50 6 53 6 L 100 6')
  })
})
