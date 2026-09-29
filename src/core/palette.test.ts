import { describe, expect, it } from 'vitest'
import { contrastText, nextStepColor, STEP_PALETTE, tint } from './palette.ts'

describe('palette', () => {
  it('asigna el siguiente color libre', () => {
    expect(nextStepColor([])).toBe(STEP_PALETTE[0])
    expect(nextStepColor(['#e5484d'])).toBe(STEP_PALETTE[1])
  })
  it('elige texto de contraste', () => {
    expect(contrastText('#3E63DD')).toBe('#FFFFFF')
    expect(contrastText('#FFC53D')).toBe('#111827')
  })
  it('tiñe hacia blanco', () => {
    expect(tint('#000000', 0)).toBe('#ffffff')
    expect(tint('#3E63DD', 1)).toBe('#3e63dd')
  })
})
