import { Fragment, type ReactNode } from 'react'
import { IconCode, IconDownload, IconHistory, IconSteps, IconUpload, IconWarning } from '../../components/icons.tsx'
import { useEditorStore } from '../store.ts'
import { RAIL_WIDTH, sectionOf, type SidebarSection } from './sections.ts'

/** `divider` separa el modelado (arriba) de la entrada y salida de datos (abajo). */
const ITEMS: { id: SidebarSection; label: string; title: string; icon: ReactNode; divider?: boolean }[] = [
  { id: 'steps', label: 'Steps', title: 'Línea de tiempo de steps', icon: <IconSteps width={18} height={18} /> },
  { id: 'code', label: 'Código', title: 'DBML, vistas y notas del step', icon: <IconCode width={18} height={18} /> },
  { id: 'warnings', label: 'Avisos', title: 'Advertencias del linter', icon: <IconWarning width={18} height={18} /> },
  { id: 'history', label: 'Historial', title: 'Historial de revisiones', icon: <IconHistory width={18} height={18} /> },
  { id: 'import', label: 'Importar', title: 'Importar DBML o DDL de SQL Server', icon: <IconUpload width={18} height={18} />, divider: true },
  { id: 'export', label: 'Exportar', title: 'Exportar SQL Server, MongoDB o DBML', icon: <IconDownload width={18} height={18} /> },
]

/** Barra de iconos: elige qué muestra el panel lateral; el icono activo lo pliega. */
export function SidebarRail() {
  const tab = useEditorStore((s) => s.sideTab)
  const open = useEditorStore((s) => s.sidebarOpen)
  const lastCodeTab = useEditorStore((s) => s.lastCodeTab)
  const lastExportTab = useEditorStore((s) => s.lastExportTab)
  const warnings = useEditorStore((s) => s.warnings.length)
  const setTab = useEditorStore((s) => s.setSideTab)
  const setOpen = useEditorStore((s) => s.setSidebarOpen)
  const current = sectionOf(tab)

  return (
    <nav
      aria-label="Secciones del panel"
      className="relative z-40 flex shrink-0 flex-col items-center gap-1 border-r border-slate-200 bg-white py-2"
      style={{ width: RAIL_WIDTH }}
    >
      {ITEMS.map((item) => {
        const active = open && current === item.id
        return (
          <Fragment key={item.id}>
          {item.divider && <span className="my-1 h-px w-8 bg-slate-200" aria-hidden />}
          <button
            type="button"
            title={item.title}
            aria-pressed={active}
            data-section={item.id}
            onClick={() => {
              if (active) setOpen(false)
              else setTab(item.id === 'code' ? lastCodeTab : item.id === 'export' ? lastExportTab : item.id)
            }}
            className={`relative flex w-[52px] flex-col items-center gap-1 rounded-lg py-1.5 text-[10px] leading-none font-medium transition focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none ${
              active ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.id === 'warnings' && warnings > 0 && (
              <span
                className="absolute top-0.5 right-1.5 min-w-4 rounded-full bg-amber-400 px-1 text-center text-[9.5px] leading-4 font-bold text-amber-950 tabular-nums"
                aria-label={`${warnings} ${warnings === 1 ? 'advertencia' : 'advertencias'}`}
              >
                {warnings > 99 ? '99+' : warnings}
              </span>
            )}
          </button>
          </Fragment>
        )
      })}
    </nav>
  )
}
