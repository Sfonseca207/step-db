import { ReactFlowProvider } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { UserMenu } from '../components/AppShell.tsx'
import { IconPanelLeft, IconPanelRight } from '../components/icons.tsx'
import { Logo } from '../components/Logo.tsx'
import { ApiError } from '../lib/api.ts'
import { useViewportWidth } from '../lib/useViewport.ts'
import { Canvas } from './canvas/Canvas.tsx'
import { ConflictDialog } from './ConflictDialog.tsx'
import { useAutosave } from './drafts.ts'
import { ErrorBanner } from './ErrorBanner.tsx'
import { useLayoutPersistence, useModelSync, useProject } from './hooks.ts'
import { SidePanel } from './panels/SidePanel.tsx'
import { StepsPanel } from './panels/StepsPanel.tsx'
import { useRealtime } from './realtime.ts'
import { useEditorStore } from './store.ts'
import { LiveStatus } from './LiveStatus.tsx'
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

/** Debajo de este ancho los paneles se abren sobre el canvas, de a uno. */
const COMPACT_WIDTH = 1024

export default function EditorPage() {
  const { projectId = '' } = useParams()
  const project = useProject(projectId)
  const reset = useEditorStore((s) => s.reset)
  const { persistPositions, persistViewport } = useLayoutPersistence(projectId)
  const viewport = useViewportWidth()
  const compact = viewport < COMPACT_WIDTH
  const [leftW, setLeftW] = useState(() => readWidth('stepdb:leftW', window.innerWidth < 1440 ? 256 : 280))
  const [rightW, setRightW] = useState(() => readWidth('stepdb:rightW', Math.round(Math.min(460, Math.max(340, window.innerWidth * 0.31)))))
  const [leftOpen, setLeftOpen] = useState(() => window.innerWidth >= COMPACT_WIDTH)
  const [rightOpen, setRightOpen] = useState(() => window.innerWidth >= COMPACT_WIDTH)

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
    const missing = project.error instanceof ApiError && project.error.status === 404
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-slate-500">
        <p className="font-medium text-slate-800">{missing ? 'No se encontró el proyecto.' : 'No se pudo cargar el proyecto.'}</p>
        <p className="text-sm">
          {missing ? 'Puede que se haya borrado o que no tengas acceso.' : 'Revisa tu conexión; tus borradores siguen guardados en este navegador.'}
        </p>
        <div className="flex gap-2">
          {!missing && (
            <button className="btn btn-primary" onClick={() => void project.refetch()}>
              Reintentar
            </button>
          )}
          <Link to="/" className="btn">
            Volver a proyectos
          </Link>
        </div>
      </div>
    )
  }

  // Los paneles nunca se comen el canvas: su ancho guardado se limita según la pantalla.
  const leftWidth = Math.round(Math.min(leftW, Math.max(220, viewport * 0.24)))
  const rightWidth = Math.round(Math.min(rightW, Math.max(320, viewport * 0.36)))

  // En pantallas angostas solo un panel a la vez, flotando sobre el canvas.
  const toggleLeft = () => {
    setLeftOpen((v) => !v)
    if (compact) setRightOpen(false)
  }
  const toggleRight = () => {
    setRightOpen((v) => !v)
    if (compact) setLeftOpen(false)
  }
  const overlay = 'sdb-panel-in absolute inset-y-0 z-30 max-w-[88vw] bg-white shadow-2xl'

  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col overflow-hidden bg-white">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 px-2 sm:gap-3 sm:px-3">
          <button
            className={`btn btn-ghost shrink-0 px-1.5 ${leftOpen ? 'text-slate-900' : 'text-slate-400'}`}
            onClick={toggleLeft}
            aria-label="Mostrar u ocultar el panel de steps"
            aria-pressed={leftOpen}
            title="Panel de steps"
          >
            <IconPanelLeft />
          </button>
          <Link to="/" className="shrink-0" aria-label="StepDB: volver a proyectos">
            <span className="hidden sm:inline">
              <Logo />
            </span>
            <span className="sm:hidden">
              <Logo compact />
            </span>
          </Link>
          <span className="hidden text-slate-300 md:inline">·</span>
          <span className="hidden max-w-[22ch] min-w-0 shrink truncate font-medium text-slate-700 md:inline" title={project.data.name}>
            {project.data.name}
          </span>
          <Toolbar project={project.data} />
          <button
            className={`btn btn-ghost shrink-0 px-1.5 ${rightOpen ? 'text-slate-900' : 'text-slate-400'}`}
            onClick={toggleRight}
            aria-label="Mostrar u ocultar el editor"
            aria-pressed={rightOpen}
            title="Panel del editor"
          >
            <IconPanelRight />
          </button>
          <UserMenu />
        </header>
        <div className="relative flex min-h-0 flex-1">
          {leftOpen && (
            <>
              <aside
                className={compact ? `${overlay} left-0 border-r border-slate-200` : 'shrink-0 border-r border-slate-200'}
                style={{ width: leftWidth }}
                aria-label="Steps"
              >
                <StepsPanel project={project.data} />
              </aside>
              {!compact && <Resizer side="left" onDrag={(dx) => setLeftW((w) => Math.min(460, Math.max(220, w + dx)))} />}
            </>
          )}
          <div className="relative min-w-0 flex-1">
            <Canvas layout={project.data.layout} onPersistPositions={persistPositions} onPersistViewport={persistViewport} />
            <ErrorBanner />
            <ActivityPanel projectId={projectId} />
            <ReplayOverlay workDates={Object.fromEntries(project.data.steps.map((s) => [s.id, s.workDate]))} />
            <LiveStatus />
            <Toasts />
            {compact && (leftOpen || rightOpen) && (
              <button
                className="sdb-overlay absolute inset-0 z-20 cursor-default bg-slate-900/10"
                aria-label="Cerrar panel"
                onClick={() => {
                  setLeftOpen(false)
                  setRightOpen(false)
                }}
              />
            )}
          </div>
          {rightOpen && (
            <>
              {!compact && <Resizer side="right" onDrag={(dx) => setRightW((w) => Math.min(900, Math.max(320, w - dx)))} />}
              <aside
                className={compact ? `${overlay} right-0 border-l border-slate-200` : 'shrink-0 border-l border-slate-200'}
                style={{ width: rightWidth }}
                aria-label="Editor"
              >
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
