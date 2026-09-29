/**
 * Trazado ortogonal de las relaciones, al estilo dbdiagram: cada extremo sale
 * en horizontal de su columna y ambos se unen por un canal vertical. El canal
 * se elige entre varios candidatos para cruzar el menor número de tablas.
 */

export interface RoutePoint {
  x: number
  y: number
}

export interface Obstacle {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface RouteInput {
  source: RoutePoint
  target: RoutePoint
  /** Hacia dónde sale la línea de cada extremo: 1 = derecha, -1 = izquierda. */
  sourceDir: 1 | -1
  targetDir: 1 | -1
  obstacles?: readonly Obstacle[]
  /** Tablas que no cuentan como obstáculo (las de los extremos). */
  ignore?: readonly string[]
}

export interface Route {
  path: string
  points: RoutePoint[]
  labelX: number
  labelY: number
}

/** Tramo recto antes del primer codo cuando ambos extremos salen por el mismo lado. */
export const STUB = 36
/** Tramo recto mínimo cuando las tablas están enfrentadas: deja sitio a los marcadores. */
export const MIN_STUB = 24
/** Separación mínima entre dos tablas para unirlas por el hueco que las separa. */
export const FACING_GAP = MIN_STUB * 2
const CORNER_RADIUS = 8
/** Distancia a la que el canal bordea una tabla. */
const CLEARANCE = 16
/** Margen alrededor de una tabla que también cuenta como cruce. */
const PAD = 6
/** Desvío máximo del canal, por el lado de afuera, para esquivar tablas. */
const MAX_DETOUR = 420

function crosses(a: RoutePoint, b: RoutePoint, r: Obstacle): boolean {
  return (
    Math.min(a.x, b.x) < r.x + r.width + PAD &&
    Math.max(a.x, b.x) > r.x - PAD &&
    Math.min(a.y, b.y) < r.y + r.height + PAD &&
    Math.max(a.y, b.y) > r.y - PAD
  )
}

function crossings(points: readonly RoutePoint[], obstacles: readonly Obstacle[]): number {
  let count = 0
  for (let i = 1; i < points.length; i++) {
    for (const o of obstacles) if (crosses(points[i - 1], points[i], o)) count++
  }
  return count
}

/** Quita puntos repetidos y los intermedios de un tramo recto. */
function simplify(points: readonly RoutePoint[]): RoutePoint[] {
  const out: RoutePoint[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue
    const prev = out[out.length - 2]
    if (prev && last) {
      const sameX = Math.abs(prev.x - last.x) < 0.5 && Math.abs(last.x - p.x) < 0.5
      const sameY = Math.abs(prev.y - last.y) < 0.5 && Math.abs(last.y - p.y) < 0.5
      if (sameX || sameY) out.pop()
    }
    out.push(p)
  }
  return out
}

const n = (v: number) => Math.round(v * 100) / 100

/** Polilínea con los codos redondeados. */
export function roundedPath(points: readonly RoutePoint[], radius = CORNER_RADIUS): string {
  if (points.length === 0) return ''
  let d = `M ${n(points[0].x)} ${n(points[0].y)}`
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]
    const p = points[i]
    const next = points[i + 1]
    const inLen = Math.hypot(p.x - prev.x, p.y - prev.y)
    const outLen = Math.hypot(next.x - p.x, next.y - p.y)
    const r = Math.min(radius, inLen / 2, outLen / 2)
    if (r < 0.5) {
      d += ` L ${n(p.x)} ${n(p.y)}`
      continue
    }
    const ax = p.x - ((p.x - prev.x) / inLen) * r
    const ay = p.y - ((p.y - prev.y) / inLen) * r
    const bx = p.x + ((next.x - p.x) / outLen) * r
    const by = p.y + ((next.y - p.y) / outLen) * r
    d += ` L ${n(ax)} ${n(ay)} Q ${n(p.x)} ${n(p.y)} ${n(bx)} ${n(by)}`
  }
  const last = points[points.length - 1]
  if (points.length > 1) d += ` L ${n(last.x)} ${n(last.y)}`
  return d
}

/** Punto a la mitad del recorrido: ahí va el rótulo. */
function midpoint(points: readonly RoutePoint[]): RoutePoint {
  let total = 0
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  let left = total / 2
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len >= left && len > 0) {
      const t = left / len
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    left -= len
  }
  return points[0]
}

/** El canal que cruza menos tablas; si empatan, el más cercano al preferido. */
function pickChannel(
  candidates: readonly number[],
  preferred: number,
  build: (x: number) => RoutePoint[],
  obstacles: readonly Obstacle[],
): RoutePoint[] {
  let best = build(preferred)
  if (obstacles.length === 0) return best
  let bestScore = crossings(best, obstacles)
  let bestDistance = 0
  for (const x of candidates) {
    if (bestScore === 0) break
    const points = build(x)
    const score = crossings(points, obstacles)
    const distance = Math.abs(x - preferred)
    if (score < bestScore || (score === bestScore && distance < bestDistance)) {
      best = points
      bestScore = score
      bestDistance = distance
    }
  }
  return best
}

export function routeRelation(input: RouteInput): Route {
  const { source: s, target: t, sourceDir, targetDir, obstacles = [], ignore = [] } = input
  const minY = Math.min(s.y, t.y)
  const maxY = Math.max(s.y, t.y)
  const within = (x1: number, x2: number) =>
    obstacles.filter(
      (o) =>
        !ignore.includes(o.id) &&
        o.x - PAD < Math.max(x1, x2) &&
        o.x + o.width + PAD > Math.min(x1, x2) &&
        o.y - PAD < maxY &&
        o.y + o.height + PAD > minY,
    )
  /** Bordes de los obstáculos por los que puede pasar el canal, dentro de [from, to]. */
  const edgesOf = (nearby: readonly Obstacle[], from: number, to: number) =>
    nearby
      .flatMap((o) => [o.x - CLEARANCE, o.x + o.width + CLEARANCE])
      .filter((x) => x >= Math.min(from, to) && x <= Math.max(from, to))

  let points: RoutePoint[]
  if (sourceDir !== targetDir && sourceDir * (t.x - s.x) >= FACING_GAP) {
    // Tablas enfrentadas: el canal va por el hueco que las separa.
    const from = s.x + sourceDir * MIN_STUB
    const to = t.x + targetDir * MIN_STUB
    const nearby = within(s.x, t.x)
    points = pickChannel(
      edgesOf(nearby, from, to),
      (from + to) / 2,
      (x) => [s, { x, y: s.y }, { x, y: t.y }, t],
      nearby,
    )
  } else if (sourceDir === targetDir) {
    // Mismo lado: el canal va por fuera de las dos tablas.
    const base = sourceDir === 1 ? Math.max(s.x, t.x) + STUB : Math.min(s.x, t.x) - STUB
    const limit = base + sourceDir * MAX_DETOUR
    const nearby = within(sourceDir === 1 ? Math.min(s.x, t.x) : Math.max(s.x, t.x), limit)
    points = pickChannel(
      edgesOf(nearby, base, limit),
      base,
      (x) => [s, { x, y: s.y }, { x, y: t.y }, t],
      nearby,
    )
  } else {
    // Lados opuestos sin hueco entre las tablas: rodea en S por la altura media.
    const midY = (s.y + t.y) / 2
    const sx = s.x + sourceDir * STUB
    const tx = t.x + targetDir * STUB
    points = [s, { x: sx, y: s.y }, { x: sx, y: midY }, { x: tx, y: midY }, { x: tx, y: t.y }, t]
  }

  points = simplify(points)
  const label = midpoint(points)
  return { path: roundedPath(points), points, labelX: label.x, labelY: label.y }
}
