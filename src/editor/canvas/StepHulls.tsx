import { ViewportPortal } from '@xyflow/react'
import { tint } from '../../core/palette.ts'
import { useEditorStore } from '../store.ts'
import { estimateSize, type TableNode } from './graph.ts'

const PAD = 28

/** Fondo suave del color de cada step detrás de sus tablas (RF-29). */
export function StepHulls({ nodes }: { nodes: TableNode[] }) {
  const steps = useEditorStore((s) => s.steps)
  const boxes = new Map<string, { x1: number; y1: number; x2: number; y2: number }>()
  for (const n of nodes) {
    if (n.hidden) continue
    const stepId = n.data.table.stepId
    const w = n.measured?.width ?? estimateSize(n.data.table).width
    const h = n.measured?.height ?? estimateSize(n.data.table).height
    const b = boxes.get(stepId)
    const box = { x1: n.position.x, y1: n.position.y, x2: n.position.x + w, y2: n.position.y + h }
    boxes.set(
      stepId,
      b ? { x1: Math.min(b.x1, box.x1), y1: Math.min(b.y1, box.y1), x2: Math.max(b.x2, box.x2), y2: Math.max(b.y2, box.y2) } : box,
    )
  }
  return (
    <ViewportPortal>
      {[...boxes.entries()].map(([stepId, b]) => {
        const step = steps[stepId]
        if (!step) return null
        return (
          <div
            key={stepId}
            className="sdb-hull pointer-events-none absolute rounded-[28px]"
            style={{
              transform: `translate(${b.x1 - PAD}px, ${b.y1 - PAD - 18}px)`,
              width: b.x2 - b.x1 + PAD * 2,
              height: b.y2 - b.y1 + PAD * 2 + 18,
              background: tint(step.color, 0.07),
              border: `1.5px solid ${tint(step.color, 0.25)}`,
              zIndex: -1,
            }}
          >
            <span className="absolute top-2 left-4 text-[11px] font-semibold" style={{ color: step.color }}>
              {step.number} · {step.name}
            </span>
          </div>
        )
      })}
    </ViewportPortal>
  )
}
