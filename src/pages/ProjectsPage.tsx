import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import type { ProjectDto, ProjectSummaryDto } from '../core/api.ts'
import { STEP_PALETTE } from '../core/palette.ts'
import { AppShell } from '../components/AppShell.tsx'
import { ConfirmDialog } from '../components/ConfirmDialog.tsx'
import { api } from '../lib/api.ts'

function relativeDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ProjectsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api<ProjectSummaryDto[]>('GET', '/api/projects') })
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState<ProjectSummaryDto | null>(null)

  const create = useMutation({
    mutationFn: (n: string) => api<ProjectDto>('POST', '/api/projects', { name: n }),
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

  function onCreate(e: FormEvent) {
    e.preventDefault()
    if (name.trim()) create.mutate(name.trim())
  }

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
            <form onSubmit={onCreate} className="flex gap-2">
              <input
                className="input w-56"
                placeholder="Nombre del proyecto"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Nombre del proyecto"
              />
              <button className="btn btn-primary" disabled={!name.trim() || create.isPending}>
                Crear proyecto
              </button>
            </form>
            <button className="btn" onClick={() => example.mutate()} disabled={example.isPending}>
              <span aria-hidden>✨</span>
              {example.isPending ? 'Creando…' : 'Crear proyecto de ejemplo'}
            </button>
          </div>
        </div>

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
                      ✕
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
                <div className="relative z-10 mt-3 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => setRenaming({ id: p.id, name: p.name })}>
                    Renombrar
                  </button>
                  <button className="btn btn-ghost px-2 py-1 text-xs text-red-600" onClick={() => setDeleting(p)}>
                    Borrar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
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
