import type { FileKind } from '../../core/types.ts'
import type { CodeTab } from '../store.ts'

/** Valor del selector de step que muestra todos los steps a la vez. */
export const ALL_STEPS = '__all__'

export type EditorLanguage = 'dbml' | 'sql' | 'markdown'

export const fileLanguage = (kind: FileKind): EditorLanguage => (kind === 'views' ? 'sql' : kind === 'notes' ? 'markdown' : 'dbml')

/** Identidad del modelo de Monaco de un archivo: la misma en la vista por step y en la de todos. */
export const filePath = (stepId: string, kind: FileKind) =>
  `file:///${stepId}/${kind}.${kind === 'views' ? 'sql' : kind === 'notes' ? 'md' : 'dbml'}`

/** Archivos de un step que pertenecen a cada pestaña de código. */
export const kindsOfTab = (tab: CodeTab): FileKind[] => (tab === 'dbml' ? ['model', 'mongo'] : [tab])

export const KIND_LABELS: Record<FileKind, string> = {
  model: 'SQL Server',
  mongo: 'Mongo',
  views: 'Vistas',
  notes: 'Notas',
}
