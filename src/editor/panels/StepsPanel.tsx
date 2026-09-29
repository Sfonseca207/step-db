import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type DragEvent } from 'react'
import type { ProjectDto, StepDto } from '../../core/api.ts'
import { contrastText, nextStepColor } from '../../core/palette.ts'
import { foreignColumnsOfStep } from '../../core/model.ts'
import { stepNumber } from '../../core/slug.ts'
import { IconPlus } from '../../components/icons.tsx'
import { api, ApiError } from '../../lib/api.ts'
import { projectQueryKey } from '../hooks.ts'
import { useEditorStore } from '../store.ts'
import { Celebration } from './Celebration.tsx'
import { StepDialog, type StepFormValues } from './StepDialog.tsx'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "2026-09-28" → "28 sep". */
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[(m ?? 1) - 1] ?? ''}`
}

export function StepsPanel({ project }: { project: ProjectDto }) {
  const qc = useQueryClient()
  const key = projectQueryKey(project.id)
  const model = useEditorStore((s) => s.model)
  const selectedStepId = useEditorStore((s) => s.selectedStepId)
  const selectStep = useEditorStore((s) => s.selectStep)
  const requestCenter = useEditorStore((s) => s.requestCenter)
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'edit'; step: StepDto } | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [celebrate, setCelebrate] = useState<{ stepId: string; token: number } | null>(null)

  const stats = useMemo(() => {
    const out = new Map<string, { tables: number; collections: number; foreign: { table: string; column: string }[] }>()
    for (const s of project.steps) {
      const own = model?.tables.filter((t) => t.stepId === s.id) ?? []
      out.set(s.id, {
        tables: own.filter((t) => t.store === 'sqlserver').length,
        collections: own.filter((t) => t.store === 'mongo').length,
        foreign: model ? foreignColumnsOfStep(model, s.id) : [],
      })
    }
    return out
  }, [model, project.steps])

  const refetch = () => qc.invalidateQueries({ queryKey: key })

  const createStep = useMutation({
    mutationFn: (v: StepFormValues) =>
      api<StepDto>('POST', `/api/projects/${project.id}/steps`, {
        name: v.name,
        workDate: v.workDate,
        color: v.color,
        description: v.description || null,
      }),
    onSuccess: async (s) => {
      setDialog(null)
      await refetch()
      selectStep(s.id)
    },
    onError: (e) => setDialogError(e instanceof ApiError ? e.message : 'No se pudo crear el step'),
  })

  const updateStep = useMutation({
    mutationFn: (v: { id: string; values: Partial<StepFormValues> }) =>
      api<StepDto>('PATCH', `/api/steps/${v.id}`, {
        ...v.values,
        ...(v.values.description !== undefined ? { description: v.values.description || null } : {}),
      }),
    onSuccess: async (s, v) => {
      setDialog(null)
      const before = project.steps.find((x) => x.id === s.id)
      if (v.values.status === 'completado' && before?.status !== 'completado') {
        const token = Date.now()
        setCelebrate({ stepId: s.id, token })
        setTimeout(() => setCelebrate((c) => (c?.token === token ? null : c)), 1200)
      }
      await refetch()
    },
    onError: (e) => setDialogError(e instanceof ApiError ? e.message : 'No se pudo guardar el step'),
  })

  const setActive = useMutation({
    mutationFn: (stepId: string) => api<ProjectDto>('PATCH', `/api/projects/${project.id}`, { activeStepId: stepId }),
    onSuccess: (p) => qc.setQueryData(key, p),
  })

  const reorder = useMutation({
    mutationFn: (ids: string[]) => api<StepDto[]>('PUT', `/api/projects/${project.id}/steps/order`, { stepIds: ids }),
    onMutate: (ids) => {
      // Optimista: reordena en la caché.
      qc.setQueryData<ProjectDto>(key, (p) =>
        p ? { ...p, steps: ids.map((id, i) => ({ ...p.steps.find((s) => s.id === id)!, position: i + 1 })) } : p,
      )
    },
    onSettled: () => refetch(),
  })

  function onDrop(e: DragEvent, targetId: string) {
    e.preventDefault()
    setOverId(null)
    if (!dragId || dragId === targetId) return
    const ids = project.steps.map((s) => s.id).filter((id) => id !== dragId)
    ids.splice(ids.indexOf(targetId), 0, dragId)
    reorder.mutate(ids)
    setDragId(null)
  }

  const usedColors = project.steps.map((s) => s.color)

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50/60">
      <div className="flex shrink-0 items-center justify-between px-4 pt-3 pb-2">
        <h2 className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Steps · {project.steps.length}</h2>
        <button
          className={`text-[11px] font-medium ${selectedStepId ? 'text-slate-500 hover:text-slate-900' : 'invisible'}`}
          onClick={() => selectStep(null)}
        >
          Quitar selección
        </button>
      </div>
      <ol className="relative min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <span className="absolute top-2 bottom-2 left-[26px] w-px bg-slate-200" aria-hidden />
        {project.steps.map((s, index) => {
          const st = stats.get(s.id)
          const active = project.activeStepId === s.id
          const selected = selectedStepId === s.id
          return (
            <li
              key={s.id}
              className={`sdb-rise relative pl-8 pb-2 ${overId === s.id ? 'sdb-drop-target' : ''}`}
              style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
              draggable
              onDragStart={(e) => {
                setDragId(s.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                e.preventDefault()
                if (dragId && dragId !== s.id) setOverId(s.id)
              }}
              onDragLeave={() => setOverId((o) => (o === s.id ? null : o))}
              onDrop={(e) => onDrop(e, s.id)}
              onDragEnd={() => {
                setDragId(null)
                setOverId(null)
              }}
            >
              <span
                className={`absolute top-4 left-[9px] h-3.5 w-3.5 rounded-full border-2 border-white transition-colors duration-300 ${active ? 'sdb-pulse' : ''}`}
                style={{ background: s.color, '--pulse': s.color } as React.CSSProperties}
                title={active ? 'Step activo' : undefined}
              />
              <div
                className={`group relative rounded-xl border bg-white transition hover:shadow-sm ${
                  dragId === s.id ? 'opacity-40' : ''
                } ${selected ? 'shadow-sm' : 'border-slate-200'}`}
                style={selected ? { borderColor: s.color, boxShadow: `0 0 0 1px ${s.color}` } : undefined}
              >
                {celebrate?.stepId === s.id && <Celebration key={celebrate.token} color={s.color} />}
                <button
                  type="button"
                  aria-pressed={selected}
                  className="block w-full rounded-xl p-2.5 text-left focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:outline-none"
                  onClick={() => {
                    selectStep(selected ? null : s.id)
                    if (!selected) {
                      const tables = model?.tables.filter((t) => t.stepId === s.id).map((t) => t.key) ?? []
                      if (tables.length) requestCenter(tables)
                    }
                  }}
                >
                <span className="flex items-start gap-2">
                  <span
                    className="mt-px rounded-md px-1.5 py-px text-[10.5px] font-bold tabular-nums transition-colors duration-300"
                    style={{ background: s.color, color: contrastText(s.color) }}
                  >
                    {stepNumber(s.position)}
                  </span>
                  <span className="line-clamp-2 min-w-0 flex-1 text-sm leading-snug font-semibold text-slate-800" title={s.slug}>
                    {s.name}
                  </span>
                  {active && (
                    <span className="mt-0.5 rounded bg-slate-900 px-1.5 text-[10px] leading-4 font-semibold text-white">activo</span>
                  )}
                  <span
                    className={`text-xs ${s.status === 'completado' ? 'text-emerald-600' : 'text-sky-600'}`}
                    title={s.status === 'completado' ? 'Completado' : 'En curso'}
                  >
                    {s.status === 'completado' ? '✓' : '◉'}
                  </span>
                </span>
                <span className="mt-1 flex items-center gap-2 text-[11px] whitespace-nowrap text-slate-500">
                  <span>{shortDate(s.workDate)}</span>
                  <span className="text-slate-300">·</span>
                  <span>
                    {st?.tables ?? 0} {st?.tables === 1 ? 'tabla' : 'tablas'}
                    {st && st.collections > 0 ? ` · ${st.collections} ${st.collections === 1 ? 'colección' : 'colecciones'}` : ''}
                  </span>
                </span>
                {st && st.foreign.length > 0 && (
                  <span
                    className="mt-1 flex items-center gap-1 text-[11px] text-slate-500"
                    title={st.foreign.map((f) => `${f.table}.${f.column}`).join('\n')}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} />+{st.foreign.length}{' '}
                    {st.foreign.length === 1 ? 'columna' : 'columnas'} en tablas de otros steps
                  </span>
                )}
                {s.description && <span className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-slate-500">{s.description}</span>}
                </button>
                <div className="absolute top-1.5 right-1.5 hidden gap-0.5 rounded-lg bg-white/95 p-0.5 shadow-sm group-hover:flex group-focus-within:flex">
                  {!active && (
                    <button
                      className="rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                      onClick={() => setActive.mutate(s.id)}
                      title="Las tablas nuevas y el MCP usarán este step"
                    >
                      Activar
                    </button>
                  )}
                  <button
                    className="rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                    onClick={() => {
                      setDialogError(null)
                      setDialog({ mode: 'edit', step: s })
                    }}
                  >
                    Editar
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
      <div className="shrink-0 border-t border-slate-200 p-3">
        <button
          className="btn w-full border-dashed"
          onClick={() => {
            setDialogError(null)
            setDialog({ mode: 'create' })
          }}
        >
          <IconPlus /> Nuevo step
        </button>
      </div>
      {dialog && (
        <StepDialog
          step={dialog.mode === 'edit' ? dialog.step : undefined}
          defaultColor={nextStepColor(usedColors)}
          busy={createStep.isPending || updateStep.isPending}
          error={dialogError}
          onClose={() => setDialog(null)}
          onSubmit={(v) => {
            if (dialog.mode === 'create') createStep.mutate(v)
            else updateStep.mutate({ id: dialog.step.id, values: v })
          }}
        />
      )}
    </div>
  )
}
