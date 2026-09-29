import type { ElkNode } from 'elkjs/lib/elk-api.js'
import ELK from 'elkjs/lib/elk-api.js'
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url'
import type { ProjectModel } from '../../core/types.ts'
import type { Point, Size } from './graph.ts'

let elk: InstanceType<typeof ELK> | null = null

function getElk() {
  // ELK corre en un web worker (RNF-01).
  elk ??= new ELK({ workerUrl: elkWorkerUrl })
  return elk
}

const ROOT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.spacing.nodeNode': '48',
  'elk.layered.spacing.nodeNodeBetweenLayers': '110',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.spacing.componentComponent': '80',
  'elk.separateConnectedComponents': 'true',
}

async function layoutFlat(
  keys: string[],
  model: ProjectModel,
  size: (key: string) => Size,
  direction: 'RIGHT' | 'DOWN',
): Promise<{ positions: Record<string, Point>; width: number; height: number }> {
  const set = new Set(keys)
  const edges = model.relations
    .filter((r) => r.from.table !== r.to.table && set.has(r.from.table) && set.has(r.to.table))
    .map((r, i) => ({ id: `e${i}`, sources: [r.to.table], targets: [r.from.table] }))
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: { ...ROOT_OPTIONS, 'elk.direction': direction },
    children: keys.map((k) => ({ id: k, ...size(k) })),
    edges,
  }
  const result = await getElk().layout(graph)
  const positions: Record<string, Point> = {}
  for (const child of result.children ?? []) {
    positions[child.id] = { x: Math.round(child.x ?? 0), y: Math.round(child.y ?? 0) }
  }
  return { positions, width: result.width ?? 0, height: result.height ?? 0 }
}

/**
 * Auto-organizar con ELK `layered`. Agrupado por step: cada step se organiza
 * por separado y los bloques se ubican en orden cronológico (izq. → der.).
 */
export async function elkLayout(
  model: ProjectModel,
  sizes: Map<string, Size>,
  groupByStep: boolean,
  stepOrder: string[],
): Promise<Record<string, Point>> {
  const size = (key: string) => sizes.get(key) ?? { width: 240, height: 160 }
  if (!groupByStep) {
    return (await layoutFlat(model.tables.map((t) => t.key), model, size, 'RIGHT')).positions
  }
  const out: Record<string, Point> = {}
  const GAP_X = 140
  const GAP_Y = 120
  const MAX_ROW_WIDTH = 2600
  let x = 0
  let y = 0
  let rowHeight = 0
  for (const stepId of stepOrder) {
    const keys = model.tables.filter((t) => t.stepId === stepId).map((t) => t.key)
    if (keys.length === 0) continue
    const block = await layoutFlat(keys, model, size, keys.length > 4 ? 'RIGHT' : 'DOWN')
    if (x > 0 && x + block.width > MAX_ROW_WIDTH) {
      x = 0
      y += rowHeight + GAP_Y
      rowHeight = 0
    }
    for (const [k, p] of Object.entries(block.positions)) out[k] = { x: x + p.x, y: y + p.y }
    x += block.width + GAP_X
    rowHeight = Math.max(rowHeight, block.height)
  }
  return out
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const overlaps = (a: Rect, b: Rect, pad = 30) =>
  a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y

/**
 * Ubica tablas nuevas sin posición cerca de las de su step, sin mover las
 * demás (SPEC §6.4). Devuelve solo las posiciones nuevas.
 */
export function autoPlace(
  model: ProjectModel,
  positions: Record<string, Point>,
  sizes: Map<string, Size>,
): Record<string, Point> {
  const size = (key: string) => sizes.get(key) ?? { width: 240, height: 160 }
  const rects: Rect[] = Object.entries(positions)
    .filter(([key]) => model.tables.some((t) => t.key === key))
    .map(([key, p]) => ({ x: p.x, y: p.y, w: size(key).width, h: size(key).height }))
  const placed: Record<string, Point> = {}
  const globalMaxX = rects.reduce((m, r) => Math.max(m, r.x + r.w), 0)

  for (const t of model.tables) {
    if (positions[t.key]) continue
    const { width, height } = size(t.key)
    const siblings = model.tables
      .filter((o) => o.stepId === t.stepId && (positions[o.key] || placed[o.key]))
      .map((o) => ({ ...(positions[o.key] ?? placed[o.key]), ...size(o.key) }))
    let start: Point
    if (siblings.length > 0) {
      const minX = Math.min(...siblings.map((s) => s.x))
      const maxY = Math.max(...siblings.map((s) => s.y + s.height))
      start = { x: minX, y: maxY + 50 }
    } else {
      start = { x: rects.length ? globalMaxX + 120 : 0, y: 0 }
    }
    const candidate: Rect = { x: start.x, y: start.y, w: width, h: height }
    for (let i = 0; i < 400 && rects.some((r) => overlaps(r, candidate)); i++) {
      // Barrido: a la derecha en pasos y luego una fila más abajo.
      candidate.x += width + 50
      if (i % 4 === 3) {
        candidate.x = start.x
        candidate.y += 120
      }
    }
    placed[t.key] = { x: Math.round(candidate.x), y: Math.round(candidate.y) }
    rects.push(candidate)
  }
  return placed
}
