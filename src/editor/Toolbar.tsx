import { useState } from 'react'
import type { ProjectDto } from '../core/api.ts'
import { IconHull, IconLayout } from '../components/icons.tsx'
import { canvasActions } from './canvas/actions.ts'
import { useEditorStore, type FocusMode } from './store.ts'

const MODES: { id: FocusMode; label: string; title: string }[] = [
  { id: 'all', label: 'Todos', title: 'Todo a color' },
  { id: 'step', label: 'Solo step', title: 'El step seleccionado a color, el resto atenuado' },
  { id: 'deps', label: '+ deps', title: 'El step y las tablas con las que se relaciona' },
]

export function Toolbar({ project }: { project: ProjectDto }) {
  const focusMode = useEditorStore((s) => s.focusMode)
  const setFocusMode = useEditorStore((s) => s.setFocusMode)
  const selectedStepId = useEditorStore((s) => s.selectedStepId)
  const selectStep = useEditorStore((s) => s.selectStep)
  const showHulls = useEditorStore((s) => s.showHulls)
  const toggleHulls = useEditorStore((s) => s.toggleHulls)
  const [organizing, setOrganizing] = useState(false)
  const [groupByStep, setGroupByStep] = useState(true)

  async function organize() {
    setOrganizing(true)
    try {
      await canvasActions.autoOrganize(groupByStep)
    } finally {
      setOrganizing(false)
    }
  }

  return (
    <div className="ml-auto flex items-center gap-2">
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
        <button className="btn rounded-r-none" onClick={organize} disabled={organizing} title="Auto-organizar con ELK">
          <IconLayout />
          {organizing ? 'Organizando…' : 'Auto-organizar'}
        </button>
        <label
          className="btn -ml-px cursor-pointer gap-1 rounded-l-none px-2 text-xs text-slate-500"
          title="Agrupar por step al auto-organizar"
        >
          <input type="checkbox" checked={groupByStep} onChange={(e) => setGroupByStep(e.target.checked)} />
          por step
        </label>
      </div>
      <button className={`btn ${showHulls ? 'border-slate-400 bg-slate-100' : ''}`} onClick={toggleHulls} title="Fondos por step">
        <IconHull />
        Fondos
      </button>
    </div>
  )
}
