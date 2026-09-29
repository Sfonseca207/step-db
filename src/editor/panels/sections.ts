import type { SidePanelTab } from '../store.ts'

/** Secciones de la barra lateral; «code» y «export» agrupan varias pestañas. */
export type SidebarSection = 'steps' | 'code' | 'warnings' | 'history' | 'import' | 'export'

export function sectionOf(tab: SidePanelTab): SidebarSection {
  if (tab === 'dbml' || tab === 'views' || tab === 'notes') return 'code'
  if (tab === 'mssql' || tab === 'mongo' || tab === 'combined') return 'export'
  return tab
}

/** Ancho de la barra de iconos, en px (el panel flotante se ancla a su derecha). */
export const RAIL_WIDTH = 60
