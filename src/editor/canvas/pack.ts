interface Point {
  x: number
  y: number
}

export interface Block {
  positions: Record<string, Point>
  width: number
  height: number
}

/**
 * Acomoda los bloques (uno por step, en orden cronológico) en filas. Prueba
 * todas las cantidades de bloques por fila y elige la que mejor aprovecha el
 * canvas, es decir, la que permite el mayor zoom al encuadrar todo.
 */
export function packBlocks(blocks: Block[], aspect: number, gapX = 140, gapY = 120): Record<string, Point> {
  const pack = (perRow: number) => {
    const placed: { block: Block; x: number; y: number }[] = []
    let y = 0
    let width = 0
    for (let i = 0; i < blocks.length; i += perRow) {
      const row = blocks.slice(i, i + perRow)
      let x = 0
      for (const block of row) {
        placed.push({ block, x, y })
        x += block.width + gapX
      }
      width = Math.max(width, x - gapX)
      y += Math.max(...row.map((b) => b.height)) + gapY
    }
    return { placed, width, height: y - gapY }
  }
  let best: ReturnType<typeof pack> | null = null
  let bestZoom = -1
  for (let perRow = 1; perRow <= blocks.length; perRow++) {
    const candidate = pack(perRow)
    // Zoom con el que cabría en un canvas de ancho `aspect` y alto 1.
    const zoom = Math.min(aspect / Math.max(candidate.width, 1), 1 / Math.max(candidate.height, 1))
    if (zoom > bestZoom * 1.02) {
      best = candidate
      bestZoom = zoom
    }
  }
  const out: Record<string, Point> = {}
  for (const { block, x, y } of best?.placed ?? []) {
    for (const [key, p] of Object.entries(block.positions)) out[key] = { x: x + p.x, y: y + p.y }
  }
  return out
}
