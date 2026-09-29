import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type NodeChange,
  type Viewport,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Layout } from '../../core/schemas.ts'
import type { ProjectModel } from '../../core/types.ts'
import { useEditorStore, type StepMeta } from '../store.ts'
import { canvasActions } from './actions.ts'
import { buildEdges, buildNodes, estimateSize, type Ghosts, type Point, type RelationEdge as RelationEdgeT, type Size, type TableNode as TableNodeT } from './graph.ts'
import { autoPlace, elkLayout } from './layout.ts'
import { RelationEdge } from './RelationEdge.tsx'
import { StepHulls } from './StepHulls.tsx'
import { TableNode } from './TableNode.tsx'

const nodeTypes = { table: TableNode }
const edgeTypes = { relation: RelationEdge }

interface Props {
  layout: Layout
  onPersistPositions: (positions: Record<string, Point>) => void
  onPersistViewport: (viewport: Viewport) => void
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

export function Canvas({ layout, onPersistPositions, onPersistViewport }: Props) {
  const model = useEditorStore((s) => s.model)
  const steps = useEditorStore((s) => s.steps)
  const warnings = useEditorStore((s) => s.warnings)
  const removedTables = useEditorStore((s) => s.highlights.removedTables)
  const removedColumns = useEditorStore((s) => s.highlights.removedColumns)
  const removedRelations = useEditorStore((s) => s.highlights.removedRelations)
  const ghosts = useMemo<Ghosts>(
    () => ({
      columns: Object.values(removedColumns),
      relations: Object.values(removedRelations).map((g) => g.relation),
    }),
    [removedColumns, removedRelations],
  )
  const replayVisible = useEditorStore((s) => s.replayVisible)
  const replayRelations = useEditorStore((s) => s.replayRelations)
  const showHulls = useEditorStore((s) => s.showHulls)
  const selectTable = useEditorStore((s) => s.selectTable)
  const hoverEdge = useEditorStore((s) => s.hoverEdge)
  const centerRequest = useEditorStore((s) => s.centerRequest)
  const { fitView, getNodes } = useReactFlow()

  const [nodes, setNodes] = useState<TableNodeT[]>([])
  /** Modelo con el que se construyeron los nodos: las aristas usan el mismo (handles coherentes). */
  const [graphModel, setGraphModel] = useState<ProjectModel | null>(null)
  const positionsRef = useRef<Record<string, Point>>({ ...layout.positions })
  const lastModelRef = useRef<ProjectModel | null>(null)
  const initialLayoutDone = useRef(false)
  /** Encuadre pendiente (sin viewport guardado o tras el layout inicial). */
  const pendingFit = useRef(!layout.viewport)
  const animRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // El minimapa estorba en un canvas angosto.
  const [roomy, setRoomy] = useState(true)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setRoomy(entry.contentRect.width >= 640))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  /** Proporción del canvas (ancho / alto) para acomodar los bloques de steps. */
  const aspectOf = useCallback(() => {
    const el = containerRef.current
    return el && el.clientHeight > 0 ? el.clientWidth / el.clientHeight : 1.6
  }, [])

  // Posiciones que llegan del servidor (otra pestaña) para tablas que no se están arrastrando.
  useEffect(() => {
    const incoming = layout.positions
    let changed = false
    for (const [key, p] of Object.entries(incoming)) {
      const cur = positionsRef.current[key]
      if (!cur || cur.x !== p.x || cur.y !== p.y) {
        positionsRef.current[key] = p
        changed = true
      }
    }
    if (changed) {
      // Sincroniza un sistema externo (posiciones publicadas por otra pestaña) con los nodos controlados.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNodes((prev) =>
        prev.map((n) => (n.dragging || !incoming[n.id] ? n : { ...n, position: incoming[n.id] })),
      )
    }
  }, [layout.positions])

  const sizesOf = useCallback((m: ProjectModel): Map<string, Size> => {
    const measured = new Map(getNodes().map((n) => [n.id, n.measured]))
    const sizes = new Map<string, Size>()
    for (const t of m.tables) {
      const ms = measured.get(t.key)
      sizes.set(t.key, ms?.width && ms?.height ? { width: ms.width, height: ms.height } : estimateSize(t))
    }
    return sizes
  }, [getNodes])

  /** Mueve los nodos a `target` con una transición animada. */
  const animateTo = useCallback((target: Record<string, Point>, duration = 480) => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    const from = new Map(getNodes().map((n) => [n.id, n.position]))
    const apply = (t: number) =>
      setNodes((prev) =>
        prev.map((n) => {
          const to = target[n.id]
          const a = from.get(n.id)
          if (!to || !a) return n
          return { ...n, position: { x: a.x + (to.x - a.x) * t, y: a.y + (to.y - a.y) * t } }
        }),
      )
    if (prefersReducedMotion()) {
      apply(1)
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - p) ** 3
      apply(eased)
      if (p < 1) animRef.current = requestAnimationFrame(tick)
      else animRef.current = null
    }
    animRef.current = requestAnimationFrame(tick)
  }, [getNodes])

  // Reconstruye los nodos cuando cambia el modelo válido.
  useEffect(() => {
    if (!model) return
    const positions = positionsRef.current
    const missing = model.tables.filter((t) => !positions[t.key])
    const nothingPlaced = model.tables.length > 0 && missing.length === model.tables.length

    if (nothingPlaced && !initialLayoutDone.current) {
      // Primera apertura sin layout: ELK para todo el proyecto.
      initialLayoutDone.current = true
      const sizes = new Map(model.tables.map((t) => [t.key, estimateSize(t)]))
      const order = Object.values(steps)
        .sort((a, b) => a.position - b.position)
        .map((s) => s.id)
      void elkLayout(model, sizes, true, order, aspectOf()).then((placed) => {
        Object.assign(positionsRef.current, placed)
        setNodes(buildNodes(model, steps, positionsRef.current, useEditorStore.getState().warnings))
        setGraphModel(model)
        onPersistPositions(placed)
        pendingFit.current = true
      })
      return
    }
    initialLayoutDone.current = true

    if (missing.length > 0) {
      const placed = autoPlace(model, positions, sizesOf(model))
      Object.assign(positionsRef.current, placed)
      onPersistPositions(placed)
    }

    setNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]))
      const built = buildNodes(model, steps, positionsRef.current, warnings, ghosts).map((n) => {
        const old = prevById.get(n.id)
        return old ? { ...n, position: old.position, selected: old.selected, measured: old.measured } : n
      })
      // Tablas eliminadas: se conservan un momento para el fade-out.
      const keys = new Set(built.map((n) => n.id))
      const fadingTables = prev.filter((n) => !keys.has(n.id) && removedTables[n.id] !== undefined)
      return [...built, ...fadingTables]
    })
    setGraphModel(model)
    lastModelRef.current = model
  }, [model, steps, warnings, removedTables, ghosts, sizesOf, aspectOf, onPersistPositions, fitView])

  // Encuadra cuando los nodos ya están en React Flow (usa el tamaño estimado de los no medidos).
  useEffect(() => {
    if (!pendingFit.current || nodes.length === 0) return
    const raf = requestAnimationFrame(() => {
      pendingFit.current = false
      void fitView({ padding: 0.12, duration: prefersReducedMotion() ? 0 : 400, maxZoom: 1, includeHiddenNodes: true })
    })
    return () => cancelAnimationFrame(raf)
  }, [nodes, fitView])

  const onNodesChange = useCallback((changes: NodeChange<TableNodeT>[]) => {
    setNodes((prev) => applyNodeChanges(changes, prev))
  }, [])

  const onNodeDragStop = useCallback(
    (_: unknown, _node: TableNodeT, dragged: TableNodeT[]) => {
      const moved: Record<string, Point> = {}
      for (const n of dragged) {
        const p = { x: Math.round(n.position.x), y: Math.round(n.position.y) }
        moved[n.id] = p
        positionsRef.current[n.id] = p
      }
      onPersistPositions(moved)
    },
    [onPersistPositions],
  )

  // Aristas: el lado de cada extremo depende de la posición actual de los nodos.
  const sidesKey = useMemo(
    () =>
      nodes
        .map((n) => `${n.id}:${Math.round(n.position.x / 20)}:${Math.round((n.measured?.width ?? 0) / 20)}`)
        .join('|'),
    [nodes],
  )
  const edges = useMemo(() => {
    if (!graphModel) return []
    const centers = new Map<string, { cx: number; left: number; right: number }>()
    // Las tablas salen de los nodos: incluyen las eliminadas que aún se están desvaneciendo.
    const tables = new Map(nodes.map((n) => [n.id, n.data.table]))
    for (const n of nodes) {
      const w = n.measured?.width ?? estimateSize(n.data.table).width
      centers.set(n.id, { cx: n.position.x + w / 2, left: n.position.x, right: n.position.x + w })
    }
    const current = new Set(graphModel.relations.map((r) => r.id))
    const fading = ghosts.relations.filter((r) => !current.has(r.id))
    return buildEdges([...graphModel.relations, ...fading], tables, steps, centers, new Set(fading.map((r) => r.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sidesKey` resume las posiciones relevantes
  }, [graphModel, steps, sidesKey, ghosts])

  const visibleNodes = useMemo(
    () => (replayVisible ? nodes.map((n) => ({ ...n, hidden: !replayVisible.has(n.id) })) : nodes),
    [nodes, replayVisible],
  )
  const visibleEdges = useMemo(
    () =>
      replayVisible
        ? // Se filtran (no solo se ocultan): el replay quita filas y sus handles.
          edges.filter((e) => replayVisible.has(e.source) && replayVisible.has(e.target) && replayRelations?.has(e.id))
        : edges,
    [edges, replayVisible, replayRelations],
  )

  // Acciones expuestas a la barra de herramientas.
  useEffect(() => {
    canvasActions.autoOrganize = async (groupByStep: boolean) => {
      if (!model) return
      const order = Object.values(steps)
        .sort((a: StepMeta, b: StepMeta) => a.position - b.position)
        .map((s) => s.id)
      const placed = await elkLayout(model, sizesOf(model), groupByStep, order, aspectOf())
      Object.assign(positionsRef.current, placed)
      animateTo(placed)
      onPersistPositions(placed)
      setTimeout(() => canvasActions.fitView(), 520)
    }
    canvasActions.fitView = (keys?: string[]) => {
      void fitView({
        // Con render parcial (muchos nodos) los no medidos cuentan con su tamaño estimado.
        includeHiddenNodes: true,
        nodes: keys && keys.length > 0 ? keys.map((id) => ({ id })) : undefined,
        padding: keys && keys.length > 0 ? 0.35 : 0.15,
        duration: prefersReducedMotion() ? 0 : 500,
        maxZoom: 1,
      })
    }
    canvasActions.positions = () => ({ ...positionsRef.current })
  }, [model, steps, sizesOf, aspectOf, animateTo, onPersistPositions, fitView])

  // Centrar: espera a que las tablas pedidas existan y estén medidas (p. ej. recién creadas por MCP).
  const pendingCenter = useRef<{ tables: string[]; token: number; since: number } | null>(null)
  useEffect(() => {
    if (centerRequest) pendingCenter.current = { ...centerRequest, since: Date.now() }
  }, [centerRequest])
  useEffect(() => {
    const req = pendingCenter.current
    if (!req) return
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const ready = req.tables.filter((k) => byId.get(k)?.measured?.width)
    if (ready.length === req.tables.length || Date.now() - req.since > 2500) {
      pendingCenter.current = null
      if (ready.length > 0) canvasActions.fitView(ready)
    }
  }, [nodes, centerRequest])

  return (
    <div ref={containerRef} className="sdb-canvas relative h-full w-full bg-white">
      <ReactFlow<TableNodeT, RelationEdgeT>
        nodes={visibleNodes}
        edges={visibleEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={(_, n) => selectTable(n.id)}
        onNodeDoubleClick={(_, n) => {
          const loc = n.data.table.loc
          useEditorStore.getState().selectStep(loc.stepId)
          useEditorStore.getState().setSideTab('dbml')
          useEditorStore.getState().requestReveal(loc.stepId, loc.kind, loc.startLine)
        }}
        onPaneClick={() => selectTable(null)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') selectTable(null)
        }}
        onEdgeMouseEnter={(_, e) => {
          const r = e.data?.relation
          if (!r) return
          const cols: Record<string, string[]> = { [r.from.table]: r.from.columns }
          cols[r.to.table] = [...(cols[r.to.table] ?? []), ...r.to.columns]
          hoverEdge(e.id, cols)
        }}
        onEdgeMouseLeave={() => hoverEdge(null)}
        onMoveEnd={(_, viewport) => onPersistViewport(viewport)}
        defaultViewport={layout.viewport ?? { x: 40, y: 40, zoom: 0.85 }}
        minZoom={0.1}
        maxZoom={2}
        nodesConnectable={false}
        // El modelo es code-first: las tablas no se borran desde el canvas.
        deleteKeyCode={null}
        elementsSelectable
        onlyRenderVisibleElements={nodes.length > 80}
        attributionPosition="top-right"
      >
        {showHulls && <StepHulls nodes={visibleNodes} />}
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.4} color="#dbe2ea" bgColor="#ffffff" />
        {roomy && <MiniMap
          pannable
          zoomable
          nodeColor={(n) => (n.data as { color?: string }).color ?? '#94A3B8'}
          nodeStrokeWidth={0}
          nodeBorderRadius={4}
          maskColor="rgba(248,250,252,0.7)"
          className="!rounded-xl !border !border-slate-200 !shadow-sm"
          style={{ width: 176, height: 124 }}
        />}
        <Controls showInteractive={false} showFitView={false} className="!rounded-lg !border !border-slate-200 !shadow-sm">
          <ControlButton onClick={() => canvasActions.fitView()} title="Encuadrar todo" aria-label="Encuadrar todo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
          </ControlButton>
        </Controls>
      </ReactFlow>
      {model && model.tables.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="sdb-rise max-w-sm rounded-2xl border border-dashed border-slate-300 bg-white/90 p-6 text-center">
            <p className="text-sm font-semibold text-slate-800">Este modelo todavía no tiene tablas</p>
            <p className="mt-1 text-sm text-slate-500">
              Escribe DBML en el editor, pulsa <b className="font-semibold text-slate-700">Nueva tabla</b> o pídele a Claude que
              escriba el step por MCP. Lo que guardes aparecerá aquí animado.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
