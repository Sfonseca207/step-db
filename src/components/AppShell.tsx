import { useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router'
import { signOut, useSession } from '../lib/auth-client.ts'
import { Logo } from './Logo.tsx'

export function UserMenu() {
  const session = useSession()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = session.data?.user
  async function logout() {
    await signOut()
    qc.clear()
    navigate('/login', { replace: true })
  }
  return (
    <div className="flex items-center gap-2">
      <NavLink to="/tokens" className="btn btn-ghost text-slate-600">
        Tokens MCP
      </NavLink>
      <span
        title={user?.email}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white"
      >
        {(user?.name || user?.email || '?').slice(0, 1).toUpperCase()}
      </span>
      <button className="btn btn-ghost text-slate-600" onClick={logout}>
        Salir
      </button>
    </div>
  )
}

export function AppShell({ children, title }: { children: ReactNode; title?: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-white">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-5 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link to="/">
            <Logo />
          </Link>
          {title && <span className="text-slate-300">/</span>}
          {title}
        </div>
        <UserMenu />
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
