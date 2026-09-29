import { useEffect, useRef, useState, type ReactNode } from 'react'
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

export function ExportMenu({ project, labelClassName = '', icon }: { project: ProjectDto; labelClassName?: string; icon?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<{ top: number; right: number }>({ top: 48, right: 8 })
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function download(target: ExportTarget) {
    const model = useEditorStore.getState().model
    if (!model) return
    const text = runExport(target, exportInputFrom(project.name, model, project.steps))
    downloadText(`${safeFileName(project.name)}.${EXPORT_EXTENSIONS[target]}`, text)
    setOpen(false)
  }

  return (
    <div className="shrink-0" ref={ref}>
      <button
        ref={buttonRef}
        className="btn"
        onClick={() => {
          const r = buttonRef.current?.getBoundingClientRect()
          if (r) setAnchor({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) })
          setOpen((v) => !v)
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Exportar"
        title="Exportar SQL Server, MongoDB o DBML"
      >
        {icon ?? <IconDownload />}
        <span className={labelClassName}>Exportar</span>
      </button>
      {open && (
        // `fixed`: la barra hace scroll horizontal en pantallas angostas y recortaría un menú absoluto.
        <div
          role="menu"
          className="sdb-pop fixed z-50 w-64 origin-top-right rounded-xl border border-slate-200 bg-white p-1 whitespace-normal shadow-lg"
          style={anchor}
        >
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
