import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import type { ApiTokenDto } from '../core/api.ts'
import { AppShell } from '../components/AppShell.tsx'
import { ConfirmDialog } from '../components/ConfirmDialog.tsx'
import { IconCopy } from '../components/icons.tsx'
import { api } from '../lib/api.ts'
import { copyText } from '../lib/download.ts'

function when(iso: string | null): string {
  if (!iso) return 'nunca'
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}

function CopyButton({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="btn shrink-0 px-2 py-1 text-xs"
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        }
      }}
    >
      <IconCopy width={13} height={13} /> {done ? '¡Copiado!' : label}
    </button>
  )
}

export default function TokensPage() {
  const qc = useQueryClient()
  const tokens = useQuery({ queryKey: ['tokens'], queryFn: () => api<ApiTokenDto[]>('GET', '/api/tokens') })
  const [name, setName] = useState('Claude Code')
  const [created, setCreated] = useState<{ token: string; name: string } | null>(null)
  const [revoking, setRevoking] = useState<ApiTokenDto | null>(null)

  const create = useMutation({
    mutationFn: (n: string) => api<ApiTokenDto & { token: string }>('POST', '/api/tokens', { name: n }),
    onSuccess: (t) => {
      setCreated({ token: t.token, name: t.name })
      qc.invalidateQueries({ queryKey: ['tokens'] })
    },
  })
  const revoke = useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/api/tokens/${id}`),
    onSuccess: () => {
      setRevoking(null)
      qc.invalidateQueries({ queryKey: ['tokens'] })
    },
  })

  const mcpUrl = `${window.location.origin}/mcp`
  const command = created
    ? `claude mcp add --transport http stepdb ${mcpUrl} --header "Authorization: Bearer ${created.token}"`
    : ''

  function onCreate(e: FormEvent) {
    e.preventDefault()
    if (name.trim()) create.mutate(name.trim())
  }

  return (
    <AppShell title={<span className="font-medium text-slate-700">Tokens MCP</span>}>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Tokens de API</h1>
        <p className="mt-1 text-sm text-slate-500">
          Un token permite que un agente (p. ej. Claude Code) lea y escriba tus proyectos por MCP. Se guarda solo su hash:
          el valor completo se muestra una única vez.
        </p>

        <form onSubmit={onCreate} className="mt-6 flex gap-2">
          <input
            className="input max-w-xs"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            aria-label="Nombre del token"
            placeholder="Claude Code MacBook"
          />
          <button className="btn btn-primary" disabled={!name.trim() || create.isPending}>
            Crear token
          </button>
        </form>

        {created && (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4" role="status">
            <p className="text-sm font-semibold text-emerald-900">Token «{created.name}» creado</p>
            <p className="mt-0.5 text-xs text-emerald-800">Cópialo ahora: no se volverá a mostrar.</p>
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-slate-800">
                {created.token}
              </code>
              <CopyButton text={created.token} />
            </div>
            <p className="mt-4 mb-1 text-xs font-medium text-emerald-900">Conectar Claude Code:</p>
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-[11px] break-all text-slate-700">
                {command}
              </code>
              <CopyButton text={command} label="Copiar comando" />
            </div>
            <button className="mt-3 text-xs font-medium text-emerald-800 underline" onClick={() => setCreated(null)}>
              Ya lo guardé
            </button>
          </div>
        )}

        <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Prefijo</th>
                <th className="px-4 py-2 font-medium">Último uso</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tokens.isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Cargando…
                  </td>
                </tr>
              )}
              {tokens.data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Todavía no hay tokens.
                  </td>
                </tr>
              )}
              {tokens.data?.map((t) => (
                <tr key={t.id} className={t.revokedAt ? 'text-slate-400' : ''}>
                  <td className="px-4 py-2.5 font-medium">{t.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{t.prefix}…</td>
                  <td className="px-4 py-2.5 text-xs">{when(t.lastUsedAt)}</td>
                  <td className="px-4 py-2.5 text-xs">
                    {t.revokedAt ? (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5">revocado</span>
                    ) : (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">activo</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!t.revokedAt && (
                      <button className="btn btn-danger px-2 py-1 text-xs" onClick={() => setRevoking(t)}>
                        Revocar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {revoking && (
        <ConfirmDialog
          title="Revocar token"
          message={
            <>
              Los agentes que usen <b>{revoking.name}</b> ({revoking.prefix}…) dejarán de tener acceso de inmediato.
            </>
          }
          confirmLabel="Revocar"
          danger
          onConfirm={() => revoke.mutate(revoking.id)}
          onCancel={() => setRevoking(null)}
        />
      )}
    </AppShell>
  )
}
