import { Handle, Position, type NodeProps } from '@xyflow/react'
import { motion, useReducedMotion } from 'motion/react'
import { memo } from 'react'
import { contrastText, tint } from '../../core/palette.ts'
import { useEditorStore } from '../store.ts'
import type { TableNode as TableNodeType } from './graph.ts'

const EMPTY: string[] = []

function KeyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-label="PK" className="shrink-0 text-amber-500">
      <path
        fill="currentColor"
        d="M7 14a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm5.65-4A6 6 0 1 0 12.65 14H17v3h3v-3h2v-4h-9.35Z"
      />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-label="FK" className="shrink-0 text-slate-400">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"
      />
    </svg>
  )
}

function LeafIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-label="Colección MongoDB" className="shrink-0">
      <path fill={color} d="M12 2c2.8 3.2 5 6.6 5 10.2 0 3.9-2.2 6.6-4.4 7.6l-.3 2.2h-.6l-.3-2.2C9.2 18.8 7 16.1 7 12.2 7 8.6 9.2 5.2 12 2Z" />
    </svg>
  )
}

function TableNodeComponent({ id, data }: NodeProps<TableNodeType>) {
  const { table, color, stepNumber, rows, columnStepColors, fkColumns, handleColumns, warnings } = data
  const reduced = useReducedMotion()
  const newToken = useEditorStore((s) => s.highlights.newTables[id])
  const removing = useEditorStore((s) => s.highlights.removedTables[id] !== undefined)
  const dimmed = useEditorStore(
    (s) => (s.focusSet !== null && !s.focusSet.has(id)) || (s.selectedRelated !== null && !s.selectedRelated.has(id)),
  )
  const selected = useEditorStore((s) => s.selectedTable === id)
  const hoverCols = useEditorStore((s) => s.hoverColumns[id] ?? EMPTY)
  const flashColumns = useEditorStore((s) => s.highlights.flashColumns)

  const isMongo = table.store === 'mongo'
  const headerText = contrastText(color)
  const colByName = new Map(table.columns.map((c) => [c.name, c]))
  const handles = new Set(handleColumns)
  const fks = new Set(fkColumns)
  const isNew = newToken !== undefined

  return (
    <motion.div
      key={newToken ?? 'static'}
      initial={isNew && !reduced ? { scale: 0.55, opacity: 0 } : false}
      animate={{ scale: removing ? 0.9 : 1, opacity: removing ? 0 : 1 }}
      transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 280, damping: 20 }}
      className={`sdb-table ${isMongo ? 'sdb-mongo' : ''} ${dimmed ? 'sdb-dimmed' : ''} ${selected ? 'sdb-selected' : ''} ${isNew ? 'sdb-new' : ''}`}
      style={
        {
          '--step': color,
          '--step-soft': tint(color, 0.06),
          '--step-border': tint(color, 0.45),
          background: tint(color, 0.06),
        } as React.CSSProperties
      }
    >
      <div
        className="sdb-table-header"
        style={{ background: color, color: headerText }}
        title={table.note ? `${table.key}\n\n${table.note}` : table.key}
      >
        {isMongo && <LeafIcon color={headerText} />}
        <span className="truncate">
          <span className="opacity-70">{table.schema}.</span>
          <b>{table.name}</b>
        </span>
        {warnings.length > 0 && (
          <span
            className="sdb-warn-badge"
            title={warnings.map((w) => `⚠ ${w.message}`).join('\n')}
            aria-label={`${warnings.length} advertencias`}
          >
            ⚠ {warnings.length}
          </span>
        )}
        <span className="sdb-step-badge" style={{ color, background: headerText }}>
          {stepNumber}
        </span>
      </div>
      <div className="sdb-table-body">
        {rows.map((row) => {
          const col = colByName.get(row.name)
          const other = columnStepColors[row.name]
          const flash = flashColumns[`${id}.${row.name}`]
          const hovered = hoverCols.includes(row.name)
          return (
            <div
              key={flash ? `${row.name}:${flash}` : row.name}
              className={`sdb-row ${flash ? 'sdb-row-flash' : ''} ${hovered ? 'sdb-row-hover' : ''} ${row.synthetic ? 'sdb-row-synthetic' : ''}`}
              title={col?.note ?? undefined}
            >
              <span className="sdb-row-name" style={{ paddingLeft: row.depth * 14 }}>
                {row.depth > 0 && <span className="sdb-tree">└</span>}
                {col?.pk ? <KeyIcon /> : fks.has(row.name) ? <LinkIcon /> : <span className="w-3 shrink-0" />}
                <span className={`truncate ${col?.pk ? 'font-semibold' : ''}`}>{row.label}</span>
                {other && (
                  <span
                    className="sdb-col-dot"
                    style={{ background: other.color }}
                    title={`Agregada en el step ${other.slug}`}
                  />
                )}
              </span>
              <span className="sdb-row-type">
                {row.synthetic ? 'object' : col?.type}
                {col?.notNull && !col.pk && <span className="sdb-flag" title="not null">NN</span>}
                {col?.unique && <span className="sdb-flag" title="unique">U</span>}
              </span>
              {handles.has(row.name) && (
                <>
                  <Handle type="source" id={`s:L:${row.name}`} position={Position.Left} className="sdb-handle" isConnectable={false} />
                  <Handle type="source" id={`s:R:${row.name}`} position={Position.Right} className="sdb-handle" isConnectable={false} />
                  <Handle type="target" id={`t:L:${row.name}`} position={Position.Left} className="sdb-handle" isConnectable={false} />
                  <Handle type="target" id={`t:R:${row.name}`} position={Position.Right} className="sdb-handle" isConnectable={false} />
                </>
              )}
            </div>
          )
        })}
        {rows.length === 0 && <div className="sdb-row text-slate-400 italic">sin columnas</div>}
      </div>
    </motion.div>
  )
}

export const TableNode = memo(TableNodeComponent)
