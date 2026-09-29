import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useSession } from '../lib/auth-client.ts'

export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession()
  const location = useLocation()
  if (session.isPending) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">Cargando…</div>
  }
  if (!session.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <>{children}</>
}
