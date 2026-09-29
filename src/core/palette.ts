/** Paleta de colores de steps (SPEC §10.1), asignados en orden. */
export const STEP_PALETTE = [
  '#E5484D', // rojo
  '#3E63DD', // azul
  '#30A46C', // verde
  '#F76B15', // naranja
  '#8E4EC6', // violeta
  '#12A594', // teal
  '#D6409F', // rosa
  '#FFC53D', // ámbar
  '#0090FF', // celeste
  '#AD7F58', // bronce
  '#46A758', // hierba
  '#E54666', // carmesí
] as const

/** Siguiente color de la paleta que no esté en uso (o cíclico si todos lo están). */
export function nextStepColor(used: readonly string[]): string {
  const usedSet = new Set(used.map((c) => c.toUpperCase()))
  const free = STEP_PALETTE.find((c) => !usedSet.has(c))
  return free ?? STEP_PALETTE[used.length % STEP_PALETTE.length]
}

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = Number.parseInt(h.slice(0, 6), 16)
  if (Number.isNaN(n)) return [0, 0, 0]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** Luminancia relativa WCAG. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Texto blanco o negro según el contraste con el fondo. */
export function contrastText(hex: string): '#FFFFFF' | '#111827' {
  const l = luminance(hex)
  const contrastWhite = 1.05 / (l + 0.05)
  const contrastDark = (l + 0.05) / (luminance('#111827') + 0.05)
  return contrastWhite >= contrastDark ? '#FFFFFF' : '#111827'
}

/** Mezcla un color con blanco: `amount` es la proporción del color (0..1). */
export function tint(hex: string, amount: number): string {
  const [r, g, b] = parseHex(hex)
  const mix = (c: number) => Math.round(255 + (c - 255) * amount)
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}
