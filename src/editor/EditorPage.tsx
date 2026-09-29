import { ReactFlowProvider } from '@xyflow/react'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router'
import { UserMenu } from '../components/AppShell.tsx'
import { Logo } from '../components/Logo.tsx'
import { Canvas } from './canvas/Canvas.tsx'
import { useLayoutPersistence, useModelSync, useProject } from './hooks.ts'
import { useEditorStore } from './store.ts'
import { Toolbar } from './Toolbar.tsx'
import './editor.css'

export default function EditorPage() {
  const { projectId = '' } = useParams()
  const project = useProject(projectId)
  const reset = useEditorStore((s) => s.reset)
  const { persistPositions, persistViewport } = useLayoutPersistence(projectId)

  useEffect(() => {
    reset(projectId)
  }, [projectId, reset])

  useModelSync(project.data)

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
          <Link to="/" className="shrink-0">
            <Logo />
          </Link>
          <span className="text-slate-300">·</span>
          <span className="truncate font-medium text-slate-700">{project.data.name}</span>
          <Toolbar project={project.data} />
          <UserMenu />
        </header>
        <div className="relative flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1">
            <Canvas layout={project.data.layout} onPersistPositions={persistPositions} onPersistViewport={persistViewport} />
          </div>
        </div>
      </div>
    </ReactFlowProvider>
  )
}
