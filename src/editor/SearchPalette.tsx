import { useEffect, useMemo, useRef, useState } from 'react'
import { IconSearch } from '../components/icons.tsx'
import { useEditorStore } from './store.ts'

interface Hit {
  table: string
  column?: string
  label: string
  detail: string
  color: string
  score: number
}

function score(text: string, q: string): number {
  const t = text.toLowerCase()
  if (t === q) return 100
  if (t.startsWith(q)) return 80
  const idx = t.indexOf(q)
  if (idx >= 0) return 60 - Math.min(idx, 40)
  // Subsecuencia (fuzzy simple)
  let i = 0
  for (const ch of t) if (ch === q[i]) i++
  return i === q.length ? 20 : 0
}

/** Búsqueda rápida Cmd/Ctrl+K de tablas y columnas (RF-28). */
export function SearchPalette() {
  const open = useEditorStore((s) => s.searchOpen)
  const setOpen = useEditorStore((s) => s.setSearchOpen)
  const model = useEditorStore((s) => s.model)
  const steps = useEditorStore((s) => s.steps)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!useEditorStore.getState().searchOpen)
      } else if (e.key === 'Escape' && useEditorStore.getState().searchOpen) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10)
  }, [open])

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase()
    if (!model) return []
    const out: Hit[] = []
    for (const t of model.tables) {
      const color = steps[t.stepId]?.color ?? '#94A3B8'
      const ts = q ? Math.max(score(t.key, q), score(t.name, q)) : 50
      if (ts > 0) out.push({ table: t.key, label: t.key, detail: t.store === 'mongo' ? 'colección' : 'tabla', color, score: ts + 5 })
      if (!q) continue
      for (const c of t.columns) {
        const cs = score(c.name, q)
        if (cs > 0) out.push({ table: t.key, column: c.name, label: `${t.key}.${c.name}`, detail: c.type, color, score: cs })
      }
    }
    return out.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, 40)
  }, [query, model, steps])

  if (!open) return null

  function choose(hit: Hit | undefined) {
    if (!hit) return
    const s = useEditorStore.getState()
    s.selectTable(hit.table)
    s.requestCenter([hit.table])
    if (hit.column) {
      s.applyDiff({
        tables: { added: [], removed: [], changed: [] },
        columns: { added: [], removed: [], changed: [`${hit.table}.${hit.column}`] },
        relations: { added: [], removed: [], changed: [] },
      })
    }
    setOpen(false)
    setQuery('')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/20 pt-[12vh] backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-label="Buscar">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4">
          <IconSearch className="text-slate-400" />
          <input
            ref={inputRef}
            className="h-12 flex-1 text-sm outline-none"
            placeholder="Buscar tabla o columna…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(hits.length - 1, a + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(0, a - 1))
              } else if (e.key === 'Enter') {
                choose(hits[active])
              }
            }}
          />
          <kbd className="rounded border border-slate-200 px-1.5 text-[10px] text-slate-400">esc</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-1" role="listbox">
          {hits.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-400">Sin resultados</li>}
          {hits.map((h, i) => (
            <li key={h.label} role="option" aria-selected={i === active}>
              <button
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm ${i === active ? 'bg-slate-100' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(h)}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: h.color }} />
                <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-slate-800">{h.label}</span>
                <span className="font-mono text-[11px] text-slate-400">{h.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
