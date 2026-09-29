import { describe, expect, it } from 'vitest'
import { translateParserMessage } from './messages.ts'
import { buildProjectModel } from './model.ts'
import type { StepSource } from './types.ts'

const step = (model: string, mongo = ''): StepSource[] => [{ id: 's', slug: '01-s', position: 1, files: { model, mongo } }]

describe('translateParserMessage', () => {
  it('traduce los errores más comunes del parser', () => {
    expect(translateParserMessage("Expect a comma ','")).toBe("Se esperaba una coma ','")
    expect(translateParserMessage("Table 'b' does not exist in Schema 'public'")).toBe("La tabla 'b' no existe en el schema 'public'")
    expect(translateParserMessage("no viable alternative at input ','")).toBe("Sintaxis no reconocida cerca de ','")
  })

  it('deja igual lo que no reconoce', () => {
    expect(translateParserMessage('Algo totalmente nuevo')).toBe('Algo totalmente nuevo')
  })

  it('los errores reales del modelo salen en español', () => {
    const cases = [
      'Table a {\n  id int [pk\n}',
      'Table a {\n  id int\n}\nTable a {\n  id int\n}',
      'Table a {\n  id int\n}\nRef: a.id > b.id',
      'Table a {\n  id int\n  indexes {\n    nada\n  }\n}',
      'Table a {\n  id int pk extra\n}',
      'Table a {\n}',
      'Table a {\n  id int\n  id int\n}',
      'Tabl a {\n  id int\n}',
      'Table a {\n  id int [pk, pk]\n}',
      'Table a {\n  id int [default: ]\n}',
      'Table a {\n  id\n}',
      'Table a {\n  id int [cosa]\n}',
      'Table a {\n  id int [not null, null]\n}',
      'Table a {\n  "id int\n}',
    ]
    for (const dbml of cases) {
      const { errors } = buildProjectModel(step(dbml))
      expect(errors.length).toBeGreaterThan(0)
      for (const e of errors) expect(e.message, dbml).not.toMatch(/\b(Expect|does not exist|already exists|Invalid|inside Table|must|can only|Duplicate|can not)\b/)
    }
  })
})
