import { EdgeLabelRenderer, getBezierPath, Position, type EdgeProps } from '@xyflow/react'
import { memo } from 'react'
import { useEditorStore } from '../store.ts'
import type { RelationEdge as RelationEdgeType } from './graph.ts'

type EndKind = 'one' | 'zero-one' | 'many'

/** Marcador crow's foot dibujado en el extremo (x, y); `dir` = hacia dónde sale la línea. */
function markerPath(x: number, y: number, dir: 1 | -1, kind: EndKind): string {
  const at = (d: number) => x + dir * d
  if (kind === 'many') {
    return `M ${at(14)} ${y} L ${at(0)} ${y - 7} M ${at(14)} ${y} L ${at(0)} ${y} M ${at(14)} ${y} L ${at(0)} ${y + 7} M ${at(18)} ${y - 6} L ${at(18)} ${y + 6}`
  }
  if (kind === 'one') {
    return `M ${at(10)} ${y - 6} L ${at(10)} ${y + 6} M ${at(15)} ${y - 6} L ${at(15)} ${y + 6}`
  }
  // 0..1: barra + círculo
  return `M ${at(10)} ${y - 6} L ${at(10)} ${y + 6} M ${at(24)} ${y} m -4 0 a 4 4 0 1 0 8 0 a 4 4 0 1 0 -8 0`
}

function RelationEdgeComponent(props: EdgeProps<RelationEdgeType>) {
  const { id, sourceX, sourceY, targetX, targetY, data } = props
  const hovered = useEditorStore((s) => s.hoveredEdge === id)
  const newToken = useEditorStore((s) => s.highlights.newRelations[id])
  const selectedTable = useEditorStore((s) => s.selectedTable)
  const dimmedByFocus = useEditorStore((s) => s.focusRelations !== null && !s.focusRelations.has(id))
  if (!data) return null
  const { relation, fromColor, toColor, optionalOne, sourceDir, targetDir, removing } = data
  const logical = relation.kind === 'logical'
  const involved = selectedTable !== null && (relation.from.table === selectedTable || relation.to.table === selectedTable)
  // La selección de una tabla manda sobre el enfoque por step.
  const dimmed = selectedTable !== null ? !involved : dimmedByFocus

  // Aleja los extremos para dejar sitio a los marcadores.
  const sx = sourceX + sourceDir * 2
  const tx = targetX + targetDir * 2
  const [path, labelX, labelY] = getBezierPath({
    sourceX: sx,
    sourceY,
    targetX: tx,
    targetY,
    sourcePosition: sourceDir === 1 ? Position.Right : Position.Left,
    targetPosition: targetDir === 1 ? Position.Right : Position.Left,
    curvature: 0.35,
  })

  const sameColor = fromColor.toLowerCase() === toColor.toLowerCase()
  const gradientId = `sdb-grad-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`
  const stroke = sameColor ? fromColor : `url(#${gradientId})`
  const fromKind: EndKind = relation.from.cardinality === 'N' ? 'many' : 'one'
  const toKind: EndKind = relation.to.cardinality === 'N' ? 'many' : optionalOne ? 'zero-one' : 'one'
  const width = hovered ? 3.2 : involved ? 2.4 : 1.8

  return (
    <g className={`sdb-edge ${dimmed ? 'sdb-edge-dimmed' : ''} ${hovered ? 'sdb-edge-hover' : ''} ${removing ? 'sdb-edge-out' : ''}`}>
      {!sameColor && (
        <defs>
          <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={sx} y1={sourceY} x2={tx} y2={targetY}>
            <stop offset="0%" stopColor={fromColor} />
            <stop offset="100%" stopColor={toColor} />
          </linearGradient>
        </defs>
      )}
      {hovered && <path d={path} fill="none" stroke={fromColor} strokeOpacity={0.18} strokeWidth={10} />}
      <path
        key={newToken ?? 'static'}
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        pathLength={newToken ? 1 : undefined}
        strokeDasharray={logical ? '7 5' : undefined}
        className={`${newToken ? 'sdb-edge-draw' : ''} ${involved && !logical ? 'sdb-edge-ants' : ''} ${involved && logical ? 'sdb-edge-ants-logical' : ''}`}
      />
      <path d={markerPath(sx, sourceY, sourceDir, fromKind)} fill="none" stroke={fromColor} strokeWidth={1.8} />
      <path d={markerPath(tx, targetY, targetDir, toKind)} fill="none" stroke={toColor} strokeWidth={1.8} />
      {/* Zona de interacción ancha e invisible */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={16} className="react-flow__edge-interaction" />
      {logical && (
        <EdgeLabelRenderer>
          <div
            className={`sdb-edge-label nodrag nopan ${dimmed ? 'sdb-edge-label-dimmed' : ''} ${removing ? 'sdb-edge-out' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            title={`Referencia lógica: no hay FK; la consistencia la garantiza la aplicación. Indexar ${relation.from.columns.join(', ')} en Mongo.`}
          >
            ref. lógica
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  )
}

export const RelationEdge = memo(RelationEdgeComponent)
