import { describe, expect, it } from 'vitest'
import { diffLines } from './linediff.ts'

const kinds = (lines: { kind: string }[]) => lines.map((l) => l.kind[0]).join('')

describe('diffLines', () => {
  it('marca solo las líneas propias de cada lado', () => {
    const d = diffLines('a\nb\nc\nd', 'a\nX\nc\nd\ne')
    expect(kinds(d.left)).toBe('scss')
    expect(kinds(d.right)).toBe('scssc')
    expect(d.right[1].text).toBe('X')
  })

  it('textos iguales: nada marcado', () => {
    const d = diffLines('uno\ndos', 'uno\ndos')
    expect(kinds(d.left)).toBe('ss')
    expect(kinds(d.right)).toBe('ss')
  })

  it('un lado vacío', () => {
    const d = diffLines('', 'a\nb')
    expect(kinds(d.left)).toBe('c')
    expect(kinds(d.right)).toBe('cc')
  })
})
