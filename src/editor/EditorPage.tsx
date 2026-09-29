import { ReactFlowProvider } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { UserMenu } from '../components/AppShell.tsx'
import { IconPanelLeft } from '../components/icons.tsx'
import { Logo } from '../components/Logo.tsx'
import { ApiError } from '../lib/api.ts'
import { useViewportWidth } from '../lib/useViewport.ts'
import { Canvas } from './canvas/Canvas.tsx'
import { ConflictDialog } from './ConflictDialog.tsx'
import { useAutosave } from './drafts.ts'
import { ErrorBanner } from './ErrorBanner.tsx'
import { useLayoutPersistence, useModelSync, useProject } from './hooks.ts'
import { RAIL_WIDTH } from './panels/sections.ts'
import { SidebarRail } from './panels/SidebarRail.tsx'
import { SidePanel } from './panels/SidePanel.tsx'
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

function Resizer({ onDrag }: { onDrag: (dx: number) => void }) {
  const [active, setActive] = useState(false)
  const last = useRef(0)
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar el panel lateral"
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

/** Debajo de este ancho el panel se abre sobre el canvas. */
const COMPACT_WIDTH = 1024

export default function EditorPage() {
  const { projectId = '' } = useParams()
  const project = useProject(projectId)
  const reset = useEditorStore((s) => s.reset)
  const { persistPositions, persistViewport } = useLayoutPersistence(projectId)
  const viewport = useViewportWidth()
  const compact = viewport < COMPACT_WIDTH
  // El panel recuerda dos anchos: angosto para la línea de tiempo y amplio para el editor.
  const [stepsW, setStepsW] = useState(() => readWidth('stepdb:leftW', window.innerWidth < 1440 ? 256 : 280))
  const [editorW, setEditorW] = useState(() => readWidth('stepdb:rightW', Math.round(Math.min(460, Math.max(340, window.innerWidth * 0.31)))))
  const showsSteps = useEditorStore((s) => s.sideTab === 'steps')
  const open = useEditorStore((s) => s.sidebarOpen)
  const setOpen = useEditorStore((s) => s.setSidebarOpen)

  useEffect(() => {
    reset(projectId)
  }, [projectId, reset])

  useEffect(() => {
    try {
      localStorage.setItem('stepdb:leftW', String(stepsW))
      localStorage.setItem('stepdb:rightW', String(editorW))
    } catch {
      // sin almacenamiento: se ignora
    }
  }, [stepsW, editorW])

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

  // El panel nunca se come el canvas: su ancho guardado se limita según la pantalla.
  // En pantallas angostas flota sobre el canvas, así que solo lo limita el ancho de la ventana.
  const room = (share: number, min: number) => (compact ? viewport - RAIL_WIDTH - 24 : Math.max(min, viewport * share))
  const panelWidth = Math.round(showsSteps ? Math.min(stepsW, room(0.24, 220)) : Math.min(editorW, room(0.4, 320)))
  const resize = (dx: number) =>
    showsSteps ? setStepsW((w) => Math.min(460, Math.max(220, w + dx))) : setEditorW((w) => Math.min(900, Math.max(320, w + dx)))

  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col overflow-hidden bg-white">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 px-2 sm:gap-3 sm:px-3">
          <button
            className={`btn btn-ghost shrink-0 px-1.5 ${open ? 'text-slate-900' : 'text-slate-400'}`}
            onClick={() => setOpen(!open)}
            aria-label="Mostrar u ocultar el panel lateral"
            aria-pressed={open}
            title="Panel lateral"
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
          <UserMenu />
        </header>
        <div className="relative flex min-h-0 flex-1">
          <SidebarRail />
          {open && (
            <>
              <aside
                className={
                  compact
                    ? 'sdb-panel-in absolute inset-y-0 z-30 border-r border-slate-200 bg-white shadow-2xl'
                    : 'shrink-0 border-r border-slate-200'
                }
                style={compact ? { left: RAIL_WIDTH, width: panelWidth } : { width: panelWidth }}
                aria-label="Panel lateral"
              >
                <SidePanel project={project.data} />
              </aside>
              {!compact && <Resizer onDrag={resize} />}
            </>
          )}
          <div className="relative min-w-0 flex-1">
            <Canvas layout={project.data.layout} onPersistPositions={persistPositions} onPersistViewport={persistViewport} />
            <ErrorBanner />
            <ActivityPanel projectId={projectId} />
            <ReplayOverlay workDates={Object.fromEntries(project.data.steps.map((s) => [s.id, s.workDate]))} />
            <LiveStatus />
            <Toasts />
            {compact && open && (
              <button
                className="sdb-overlay absolute inset-0 z-20 cursor-default bg-slate-900/10"
                aria-label="Cerrar panel"
                onClick={() => setOpen(false)}
              />
            )}
          </div>
        </div>
        <ConflictDialog onResolve={resolveConflict} />
        <SearchPalette />
      </div>
    </ReactFlowProvider>
  )
}
