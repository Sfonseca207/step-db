import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { ProjectDto, RevisionDto, StepDto } from '../../core/api.ts'
import { FILE_KINDS, type FileKind } from '../../core/types.ts'
import { api } from '../../lib/api.ts'
import { setDraftContent } from '../drafts.ts'
import { useEditorStore } from '../store.ts'
import { CodeEditor } from './CodeEditor.tsx'

const SOURCE: Record<string, { label: string; cls: string }> = {
  ui: { label: 'UI', cls: 'bg-slate-100 text-slate-600' },
  mcp: { label: 'Claude', cls: 'bg-violet-100 text-violet-700' },
  api: { label: 'API', cls: 'bg-sky-100 text-sky-700' },
  seed: { label: 'Ejemplo', cls: 'bg-amber-100 text-amber-700' },
}

const KIND_LABEL: Record<FileKind, string> = { model: 'SQL Server', mongo: 'Mongo', views: 'Vistas', notes: 'Notas' }

const LANG: Record<FileKind, 'dbml' | 'sql' | 'markdown'> = { model: 'dbml', mongo: 'dbml', views: 'sql', notes: 'markdown' }

/** Historial del archivo (RF-35): vista previa y restaurar (crea una revisión nueva). */
export function HistoryPanel({ project, step }: { project: ProjectDto; step: StepDto }) {
  const [kind, setKind] = useState<FileKind>('model')
  const [preview, setPreview] = useState<RevisionDto | null>(null)
  const current = step.files[kind]
  const revisions = useQuery({
    queryKey: ['revisions', step.id, kind, current.version],
    queryFn: () => api<RevisionDto[]>('GET', `/api/steps/${step.id}/files/${kind}/revisions`),
  })

  function restore(r: RevisionDto) {
    if (r.content === undefined) return
    setDraftContent(project, step.id, kind, r.content)
    useEditorStore.getState().setSideTab(kind === 'model' || kind === 'mongo' ? 'dbml' : kind)
    useEditorStore.getState().pushToast({ title: 'Restaurando', body: `Versión ${r.version} de ${step.slug} · ${kind}` })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 gap-1 px-3 py-1.5">
        {FILE_KINDS.map((k) => (
          <button
            key={k}
            onClick={() => {
              setKind(k)
              setPreview(null)
            }}
            className={`rounded-md px-2 py-0.5 text-xs font-medium ${kind === k ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      {preview ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-y border-slate-100 px-3 py-1.5 text-xs">
            <button className="btn px-2 py-0.5 text-xs" onClick={() => setPreview(null)}>
              ← Volver
            </button>
            <span className="text-slate-500">v{preview.version}</span>
            <button className="btn btn-primary ml-auto px-2 py-0.5 text-xs" onClick={() => restore(preview)} disabled={preview.version === current.version}>
              Restaurar
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <CodeEditor path={`file:///rev/${preview.id}`} value={preview.content ?? ''} language={LANG[kind]} readOnly />
          </div>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
          {revisions.isLoading && <li className="text-xs text-slate-400">Cargando…</li>}
          {revisions.data?.length === 0 && <li className="p-4 text-center text-sm text-slate-400">Sin revisiones todavía.</li>}
          {revisions.data?.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setPreview(r)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-xs transition hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800">v{r.version}</span>
                  <span className={`rounded px-1.5 py-px text-[10px] font-semibold ${SOURCE[r.source]?.cls ?? ''}`}>
                    {SOURCE[r.source]?.label ?? r.source}
                  </span>
                  {r.version === current.version && <span className="text-[10px] font-semibold text-emerald-600">actual</span>}
                  <span className="ml-auto text-slate-400">
                    {new Date(r.createdAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
                <p className="mt-0.5 text-slate-500">{r.summary ?? '—'}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
