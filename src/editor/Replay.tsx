import { useEffect, useMemo, useRef } from 'react'
import { IconClose, IconNext, IconPause, IconPlay } from '../components/icons.tsx'
import { contrastText } from '../core/palette.ts'
import type { ModelDiff } from '../core/types.ts'
import { canvasActions } from './canvas/actions.ts'
import { useEditorStore } from './store.ts'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmt = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[(m ?? 1) - 1]}`
}

/**
 * Replay (RF-90): reconstruye el diagrama step por step. En cada step sus
 * tablas aparecen animadas, se dibujan sus relaciones y la cámara lo encuadra.
 */
export function ReplayOverlay({ workDates }: { workDates: Record<string, string> }) {
  const replay = useEditorStore((s) => s.replay)
  const steps = useEditorStore((s) => s.steps)
  const model = useEditorStore((s) => s.model)
  const setReplay = useEditorStore((s) => s.setReplay)
  const ordered = useMemo(() => Object.values(steps).sort((a, b) => a.position - b.position), [steps])
  const lastApplied = useRef<number>(-1)

  // Aplica el step actual: visibilidad, animaciones y cámara.
  useEffect(() => {
    if (!replay?.active || !model) {
      lastApplied.current = -1
      return
    }
    const step = ordered[replay.stepIndex]
    if (!step || lastApplied.current === replay.stepIndex) return
    lastApplied.current = replay.stepIndex
    const pos = new Map(ordered.map((s) => [s.id, s.position]))
    const upTo = (stepId: string) => (pos.get(stepId) ?? 0) <= step.position
    const tables = new Set(model.tables.filter((t) => upTo(t.stepId)).map((t) => t.key))
    const tableByKey = new Map(model.tables.map((t) => [t.key, t]))
    const relStep = (id: string) => {
      const r = model.relations.find((x) => x.id === id)!
      const child = tableByKey.get(r.from.table)
      const col = child?.columns.find((c) => c.name === r.from.columns[0])
      return col?.stepId ?? child?.stepId ?? r.stepId
    }
    const relations = new Set(
      model.relations.filter((r) => tables.has(r.from.table) && tables.has(r.to.table) && upTo(relStep(r.id))).map((r) => r.id),
    )
    // Primero tablas y columnas; las relaciones un instante después, cuando los handles ya existen.
    const prevRelations = useEditorStore.getState().replayRelations ?? new Set<string>()
    setReplay(replay, { tables, relations: new Set([...prevRelations].filter((id) => relations.has(id))), maxPos: step.position })
    setTimeout(() => {
      const cur = useEditorStore.getState()
      if (cur.replay?.active && cur.replay.stepIndex === replay.stepIndex) {
        setReplay(cur.replay, { tables, relations, maxPos: step.position })
      }
    }, 90)

    const own = model.tables.filter((t) => t.stepId === step.id).map((t) => t.key)
    const addedCols = model.tables.flatMap((t) =>
      t.stepId !== step.id ? t.columns.filter((c) => c.stepId === step.id).map((c) => `${t.key}.${c.name}`) : [],
    )
    const diff: ModelDiff = {
      tables: { added: own, removed: [], changed: [] },
      columns: { added: addedCols, removed: [], changed: [] },
      relations: { added: [...relations].filter((id) => relStep(id) === step.id), removed: [], changed: [] },
    }
    useEditorStore.getState().applyDiff(diff)
    const focus = [...own, ...addedCols.map((c) => c.split('.').slice(0, 2).join('.'))]
    setTimeout(() => canvasActions.fitView(focus.length ? focus : [...tables]), 80)
  }, [replay, model, ordered, setReplay])

  // Avance automático.
  useEffect(() => {
    if (!replay?.active || !replay.playing) return
    const t = setTimeout(() => {
      const cur = useEditorStore.getState().replay
      if (!cur) return
      if (cur.stepIndex >= ordered.length - 1) setReplay({ ...cur, playing: false }, currentVisible())
      else setReplay({ ...cur, stepIndex: cur.stepIndex + 1 }, currentVisible())
    }, 2600 / replay.speed)
    return () => clearTimeout(t)
  }, [replay, ordered.length, setReplay])

  if (!replay?.active) return null
  const step = ordered[replay.stepIndex]
  const atEnd = replay.stepIndex >= ordered.length - 1

  return (
    <>
      {step && (
        <div
          key={step.id}
          className="sdb-replay-label pointer-events-none absolute top-5 left-1/2 z-30 -translate-x-1/2 rounded-2xl px-5 py-2 text-center shadow-lg"
          style={{ background: step.color, color: contrastText(step.color) }}
        >
          <p className="text-[11px] font-semibold tracking-wider uppercase opacity-80">Step {step.number}</p>
          <p className="text-lg leading-tight font-semibold">
            {step.name} · {fmt(workDates[step.id] ?? '')}
          </p>
        </div>
      )}
      <div className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-lg backdrop-blur">
        <button
          className="btn btn-ghost px-2"
          aria-label={replay.playing ? 'Pausar' : 'Reproducir'}
          onClick={() => {
            const restart = atEnd && !replay.playing
            setReplay(
              { ...replay, playing: !replay.playing, stepIndex: restart ? 0 : replay.stepIndex },
              restart ? null : currentVisible(),
            )
            if (restart) lastApplied.current = -1
          }}
        >
          {replay.playing ? <IconPause /> : <IconPlay />}
        </button>
        <button
          className="btn btn-ghost px-2"
          aria-label="Siguiente step"
          disabled={atEnd}
          onClick={() => setReplay({ ...replay, playing: false, stepIndex: Math.min(ordered.length - 1, replay.stepIndex + 1) }, currentVisible())}
        >
          <IconNext />
        </button>
        <div className="mx-1 flex gap-0.5">
          {ordered.map((s, i) => (
            <span
              key={s.id}
              className="h-1.5 w-5 rounded-full transition"
              style={{ background: s.color, opacity: i <= replay.stepIndex ? 1 : 0.2 }}
            />
          ))}
        </div>
        <select
          className="rounded-md border border-slate-200 px-1 py-0.5 text-xs"
          value={replay.speed}
          aria-label="Velocidad"
          onChange={(e) => setReplay({ ...replay, speed: Number(e.target.value) }, currentVisible())}
        >
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
        </select>
        <button
          className="btn btn-ghost px-2"
          aria-label="Salir del replay"
          onClick={() => {
            setReplay(null)
            setTimeout(() => canvasActions.fitView(), 50)
          }}
        >
          <IconClose />
        </button>
      </div>
    </>
  )
}

function currentVisible() {
  const s = useEditorStore.getState()
  return s.replayVisible && s.replayRelations && s.replayMaxPos !== null
    ? { tables: s.replayVisible, relations: s.replayRelations, maxPos: s.replayMaxPos }
    : null
}
