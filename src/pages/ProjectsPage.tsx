import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import type { ProjectDto, ProjectSummaryDto } from '../core/api.ts'
import { STEP_PALETTE } from '../core/palette.ts'
import { AppShell } from '../components/AppShell.tsx'
import { ConfirmDialog } from '../components/ConfirmDialog.tsx'
import { IconClose, IconPlus, IconSparkles } from '../components/icons.tsx'
import { NewProjectDialog, type NewProjectValues } from '../components/NewProjectDialog.tsx'
import { api, ApiError } from '../lib/api.ts'

/** Mensaje para mostrar cuando falla una petición: el del servidor o uno genérico si no hubo respuesta. */
function errorText(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : `${fallback}. Revisa tu conexión e inténtalo de nuevo.`
}

function relativeDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ProjectsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api<ProjectSummaryDto[]>('GET', '/api/projects') })
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState<ProjectSummaryDto | null>(null)
  const location = useLocation()
  const [notice, setNotice] = useState<string | null>((location.state as { notice?: string } | null)?.notice ?? null)

  const create = useMutation({
    mutationFn: (v: NewProjectValues) =>
      api<ProjectDto>('POST', '/api/projects', { name: v.name, description: v.description || null }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      navigate(`/p/${p.id}`)
    },
  })
  const example = useMutation({
    mutationFn: () => api<ProjectDto>('POST', '/api/projects/example'),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      navigate(`/p/${p.id}`)
    },
  })
  const rename = useMutation({
    mutationFn: (v: { id: string; name: string }) => api<ProjectDto>('PATCH', `/api/projects/${v.id}`, { name: v.name }),
    onSuccess: () => {
      setRenaming(null)
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/api/projects/${id}`),
    onSuccess: () => {
      setDeleting(null)
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  const list = projects.data ?? []

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Proyectos</h1>
            <p className="mt-1 text-sm text-slate-500">Cada proyecto es un modelo de datos construido por steps.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn btn-primary"
              onClick={() => {
                create.reset()
                setCreating(true)
              }}
            >
              <IconPlus /> Nuevo proyecto
            </button>
            <button className="btn" onClick={() => example.mutate()} disabled={example.isPending}>
              <IconSparkles />
              {example.isPending ? 'Creando…' : 'Crear proyecto de ejemplo'}
            </button>
          </div>
        </div>

        {notice && (
          <div className="sdb-rise mb-5 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900" role="status">
            {notice}
            <button className="text-xs font-medium underline" onClick={() => setNotice(null)}>
              Entendido
            </button>
          </div>
        )}
        {example.isError && (
          <p className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">
            {errorText(example.error, 'No se pudo crear el proyecto de ejemplo')}
          </p>
        )}
        {projects.isLoading && <p className="text-sm text-slate-400">Cargando…</p>}
        {projects.isError && <p className="text-sm text-red-600">No se pudieron cargar los proyectos.</p>}
        {!projects.isLoading && list.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center">
            <p className="text-slate-600">Todavía no tienes proyectos.</p>
            <p className="mt-1 text-sm text-slate-400">Crea uno vacío o empieza con la demo de GasApp.</p>
          </div>
        )}

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p, i) => (
            <li
              key={p.id}
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              className="sdb-rise group relative overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex h-1.5">
                {(p.stepColors.length > 0 ? p.stepColors.slice(0, 24) : [STEP_PALETTE[0]]).map((color, k) => (
                  <span key={k} className="flex-1" style={{ background: color }} />
                ))}
              </div>
              <div className="p-4">
                {renaming?.id === p.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (renaming.name.trim()) rename.mutate({ id: p.id, name: renaming.name.trim() })
                    }}
                    className="flex gap-2"
                  >
                    <input
                      className="input relative z-10"
                      autoFocus
                      maxLength={120}
                      value={renaming.name}
                      onChange={(e) => setRenaming({ id: p.id, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                      aria-label="Nuevo nombre"
                    />
                    <button className="btn btn-primary relative z-10">OK</button>
                    <button type="button" className="btn relative z-10" onClick={() => setRenaming(null)} aria-label="Cancelar">
                      <IconClose />
                    </button>
                  </form>
                ) : (
                  <Link to={`/p/${p.id}`} className="block text-base font-semibold text-slate-900 after:absolute after:inset-0">
                    {p.name}
                  </Link>
                )}
                {p.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{p.description}</p>}
                <p className="mt-3 text-xs text-slate-400">
                  {p.stepCount} {p.stepCount === 1 ? 'step' : 'steps'} · actualizado {relativeDate(p.updatedAt)}
                </p>
                <div className="relative z-10 mt-3 -ml-2 flex gap-1">
                  <button
                    className="btn btn-ghost px-2 py-1 text-xs text-slate-400 group-hover:text-slate-700 focus-visible:text-slate-700"
                    onClick={() => setRenaming({ id: p.id, name: p.name })}
                  >
                    Renombrar
                  </button>
                  <button
                    className="btn btn-ghost px-2 py-1 text-xs text-slate-400 group-hover:text-red-600 focus-visible:text-red-600"
                    onClick={() => setDeleting(p)}
                  >
                    Borrar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {creating && (
        <NewProjectDialog
          busy={create.isPending}
          error={create.isError ? errorText(create.error, 'No se pudo crear el proyecto') : null}
          onClose={() => setCreating(false)}
          onSubmit={(v) => create.mutate(v)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Borrar proyecto"
          message={
            <>
              Se borrará <b>{deleting.name}</b> con todos sus steps, archivos e historial. Esta acción no se puede deshacer.
            </>
          }
          confirmLabel="Borrar definitivamente"
          danger
          onConfirm={() => remove.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </AppShell>
  )
}
