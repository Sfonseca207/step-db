import { useState } from 'react'
import type { ProjectDto } from '../core/api.ts'
import { IconHistory, IconHull, IconLayout, IconPlay, IconSearch } from '../components/icons.tsx'
import { canvasActions } from './canvas/actions.ts'
import { ExportMenu } from './ExportMenu.tsx'
import { ImportDialog } from './ImportDialog.tsx'
import { useEditorStore, type FocusMode } from './store.ts'

const MODES: { id: FocusMode; label: string; title: string }[] = [
  { id: 'all', label: 'Todos', title: 'Todo a color' },
  { id: 'step', label: 'Solo step', title: 'El step seleccionado a color, el resto atenuado' },
  { id: 'deps', label: '+ deps', title: 'El step y las tablas con las que se relaciona' },
]

function IconButton(props: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={`btn px-2 ${props.active ? 'border-slate-400 bg-slate-100' : ''}`}
      onClick={props.onClick}
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.active}
    >
      {props.children}
    </button>
  )
}

export function Toolbar({ project }: { project: ProjectDto }) {
  const focusMode = useEditorStore((s) => s.focusMode)
  const setFocusMode = useEditorStore((s) => s.setFocusMode)
  const selectedStepId = useEditorStore((s) => s.selectedStepId)
  const selectStep = useEditorStore((s) => s.selectStep)
  const showHulls = useEditorStore((s) => s.showHulls)
  const toggleHulls = useEditorStore((s) => s.toggleHulls)
  const activityOpen = useEditorStore((s) => s.activityOpen)
  const toggleActivity = useEditorStore((s) => s.toggleActivity)
  const replay = useEditorStore((s) => s.replay)
  const setReplay = useEditorStore((s) => s.setReplay)
  const setSearchOpen = useEditorStore((s) => s.setSearchOpen)
  const [organizing, setOrganizing] = useState(false)
  const [groupByStep, setGroupByStep] = useState(true)
  const [importing, setImporting] = useState(false)

  async function organize() {
    setOrganizing(true)
    try {
      await canvasActions.autoOrganize(groupByStep)
    } finally {
      setOrganizing(false)
    }
  }

  return (
    <div className="ml-auto flex items-center gap-1.5">
      <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="radiogroup" aria-label="Modo de enfoque">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={focusMode === m.id}
            title={m.title}
            onClick={() => {
              setFocusMode(m.id)
              if (m.id !== 'all' && !selectedStepId) selectStep(project.activeStepId ?? project.steps[0]?.id ?? null)
            }}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              focusMode === m.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex items-center">
        <button className="btn rounded-r-none" onClick={organize} disabled={organizing || !!replay} title="Auto-organizar con ELK">
          <IconLayout />
          {organizing ? 'Organizando…' : 'Auto-organizar'}
        </button>
        <label className="btn -ml-px cursor-pointer gap-1 rounded-l-none px-2 text-xs text-slate-500" title="Agrupar por step al auto-organizar">
          <input type="checkbox" checked={groupByStep} onChange={(e) => setGroupByStep(e.target.checked)} />
          por step
        </label>
      </div>
      <button
        className={`btn ${replay ? 'border-slate-400 bg-slate-100' : ''}`}
        onClick={() =>
          replay
            ? setReplay(null)
            : setReplay(
                { active: true, stepIndex: 0, playing: true, speed: 1 },
                { tables: new Set(), relations: new Set(), maxPos: 0 },
              )
        }
        title="Reconstruir el modelo step por step"
      >
        <IconPlay width={13} height={13} /> Replay
      </button>
      <IconButton label="Buscar tabla o columna (⌘K)" onClick={() => setSearchOpen(true)}>
        <IconSearch />
      </IconButton>
      <IconButton label="Fondos por step" active={showHulls} onClick={toggleHulls}>
        <IconHull />
      </IconButton>
      <IconButton label="Actividad" active={activityOpen} onClick={toggleActivity}>
        <IconHistory />
      </IconButton>
      <button className="btn" onClick={() => setImporting(true)} title="Importar DBML o DDL de SQL Server">
        Importar
      </button>
      <ExportMenu project={project} />
      {importing && <ImportDialog project={project} onClose={() => setImporting(false)} />}
    </div>
  )
}
