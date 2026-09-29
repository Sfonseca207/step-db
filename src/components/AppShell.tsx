import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { signOut, useSession } from '../lib/auth-client.ts'
import { Logo } from './Logo.tsx'

/** Avatar con menú: proyectos, tokens MCP y cerrar sesión. */
export function UserMenu() {
  const session = useSession()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const user = session.data?.user

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

  async function logout() {
    await signOut()
    qc.clear()
    navigate('/login', { replace: true })
  }

  const item = 'block w-full rounded-lg px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100'
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white transition hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:outline-none"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menú de la cuenta"
        title={user?.email}
      >
        {(user?.name || user?.email || '?').slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div role="menu" className="sdb-pop absolute right-0 z-50 mt-1.5 w-60 origin-top-right rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="truncate text-sm font-medium text-slate-900">{user?.name}</p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>
          <Link role="menuitem" to="/" className={`${item} mt-1`} onClick={() => setOpen(false)}>
            Proyectos
          </Link>
          <Link role="menuitem" to="/tokens" className={item} onClick={() => setOpen(false)}>
            Tokens MCP
          </Link>
          <button role="menuitem" className={item} onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}

export function AppShell({ children, title }: { children: ReactNode; title?: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-white">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className="shrink-0">
            <Logo />
          </Link>
          {title && <span className="text-slate-300">/</span>}
          <span className="truncate">{title}</span>
        </div>
        <UserMenu />
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
