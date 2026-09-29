import type { ProjectDto } from '../../core/api.ts'

export function ExportPanel({ target }: { project: ProjectDto; target: 'mssql' | 'mongo' }) {
  return <div className="p-4 text-sm text-slate-400">Exportación {target} (fase 6).</div>
}
