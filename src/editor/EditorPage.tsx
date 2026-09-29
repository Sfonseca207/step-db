import { ReactFlowProvider } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { UserMenu } from '../components/AppShell.tsx'
import { IconPanelLeft, IconPanelRight } from '../components/icons.tsx'
import { Logo } from '../components/Logo.tsx'
import { Canvas } from './canvas/Canvas.tsx'
import { ConflictDialog } from './ConflictDialog.tsx'
import { useAutosave } from './drafts.ts'
import { ErrorBanner } from './ErrorBanner.tsx'
import { useLayoutPersistence, useModelSync, useProject } from './hooks.ts'
import { SidePanel } from './panels/SidePanel.tsx'
import { StepsPanel } from './panels/StepsPanel.tsx'
import { useRealtime } from './realtime.ts'
import { useEditorStore } from './store.ts'
import { Toasts } from './Toasts.tsx'
import { ActivityPanel } from './ActivityPanel.tsx'
import { ReplayOverlay } from './Replay.tsx'
import { SearchPalette } from './SearchPalette.tsx'
import { Toolbar } from './Toolbar.tsx'
import './editor.css'

function readWidth(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key))
    return Number.isFinite(v) && v > 0 ? v : fallback
  } catch {
    return fallback
  }
}

function Resizer({ onDrag, side }: { onDrag: (dx: number) => void; side: 'left' | 'right' }) {
  const [active, setActive] = useState(false)
  const last = useRef(0)
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={side === 'left' ? 'Redimensionar panel de steps' : 'Redimensionar panel del editor'}
      className={`sdb-resizer ${active ? 'active' : ''}`}
      onPointerDown={(e) => {
        last.current = e.clientX
        setActive(true)
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!active) return
        onDrag(e.clientX - last.current)
        last.current = e.clientX
      }}
      onPointerUp={() => setActive(false)}
    />
  )
}

export default function EditorPage() {
  const { projectId = '' } = useParams()
  const project = useProject(projectId)
  const reset = useEditorStore((s) => s.reset)
  const { persistPositions, persistViewport } = useLayoutPersistence(projectId)
  const [leftW, setLeftW] = useState(() => readWidth('stepdb:leftW', 280))
  const [rightW, setRightW] = useState(() => readWidth('stepdb:rightW', 460))
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)

  useEffect(() => {
    reset(projectId)
  }, [projectId, reset])

  useEffect(() => {
    try {
      localStorage.setItem('stepdb:leftW', String(leftW))
      localStorage.setItem('stepdb:rightW', String(rightW))
    } catch {
      // sin almacenamiento: se ignora
    }
  }, [leftW, rightW])

  useModelSync(project.data)
  useRealtime(projectId)
  const { resolveConflict } = useAutosave(project.data)

  if (project.isLoading) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">Cargando proyecto…</div>
  }
  if (project.isError || !project.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
        <p>No se encontró el proyecto.</p>
        <Link to="/" className="btn">
          Volver a proyectos
        </Link>
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col overflow-hidden bg-white">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 px-3">
          <button
            className="btn btn-ghost px-1.5"
            onClick={() => setLeftOpen((v) => !v)}
            aria-label="Mostrar u ocultar el panel de steps"
            title="Panel de steps"
          >
            <IconPanelLeft />
          </button>
          <Link to="/" className="shrink-0">
            <Logo />
          </Link>
          <span className="text-slate-300">·</span>
          <span className="truncate font-medium text-slate-700">{project.data.name}</span>
          <Toolbar project={project.data} />
          <button
            className="btn btn-ghost px-1.5"
            onClick={() => setRightOpen((v) => !v)}
            aria-label="Mostrar u ocultar el editor"
            title="Panel del editor"
          >
            <IconPanelRight />
          </button>
          <UserMenu />
        </header>
        <div className="relative flex min-h-0 flex-1">
          {leftOpen && (
            <>
              <aside className="shrink-0 border-r border-slate-200" style={{ width: leftW }}>
                <StepsPanel project={project.data} />
              </aside>
              <Resizer side="left" onDrag={(dx) => setLeftW((w) => Math.min(460, Math.max(220, w + dx)))} />
            </>
          )}
          <div className="relative min-w-0 flex-1">
            <Canvas layout={project.data.layout} onPersistPositions={persistPositions} onPersistViewport={persistViewport} />
            <ErrorBanner />
            <ActivityPanel projectId={projectId} />
            <ReplayOverlay workDates={Object.fromEntries(project.data.steps.map((s) => [s.id, s.workDate]))} />
            <Toasts />
          </div>
          {rightOpen && (
            <>
              <Resizer side="right" onDrag={(dx) => setRightW((w) => Math.min(900, Math.max(320, w - dx)))} />
              <aside className="shrink-0 border-l border-slate-200" style={{ width: rightW }}>
                <SidePanel project={project.data} />
              </aside>
            </>
          )}
        </div>
        <ConflictDialog onResolve={resolveConflict} />
        <SearchPalette />
      </div>
    </ReactFlowProvider>
  )
}
