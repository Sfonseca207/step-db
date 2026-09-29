import { useEffect, useRef, useState } from 'react'
import type { ProjectDto } from '../core/api.ts'
import { EXPORT_EXTENSIONS, exportInputFrom, runExport, type ExportTarget } from '../core/export/index.ts'
import { IconDownload } from '../components/icons.tsx'
import { downloadText, safeFileName } from '../lib/download.ts'
import { useEditorStore } from './store.ts'

const ITEMS: { target: ExportTarget; label: string; hint: string }[] = [
  { target: 'mssql', label: 'SQL Server', hint: 'Script T-SQL completo (.sql)' },
  { target: 'mongo', label: 'MongoDB', hint: 'Script mongosh con validadores (.js)' },
  { target: 'dbml', label: 'DBML combinado', hint: 'Para dbdiagram.io, con grupos por step (.dbml)' },
]

export function ExportMenu({ project }: { project: ProjectDto }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function download(target: ExportTarget) {
    const model = useEditorStore.getState().model
    if (!model) return
    const text = runExport(target, exportInputFrom(project.name, model, project.steps))
    downloadText(`${safeFileName(project.name)}.${EXPORT_EXTENSIONS[target]}`, text)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button className="btn" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
        <IconDownload /> Exportar
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {ITEMS.map((i) => (
            <button
              key={i.target}
              role="menuitem"
              className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50"
              onClick={() => download(i.target)}
            >
              <span className="block text-sm font-medium text-slate-800">{i.label}</span>
              <span className="block text-xs text-slate-500">{i.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
