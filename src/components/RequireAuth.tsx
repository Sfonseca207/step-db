import { useEffect, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useSession } from '../lib/auth-client.ts'

/**
 * Exige sesión. Un fallo de red al verificarla no es "sin sesión": se avisa y
 * se reintenta, en lugar de mandar al login a alguien que sí está autenticado.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession()
  const location = useLocation()
  const failed = !session.data && !session.isPending && session.error !== null && session.error !== undefined
  // Solo un 401 significa que no hay sesión; lo demás (red, 5xx) es transitorio.
  const unreachable = failed && session.error?.status !== 401

  useEffect(() => {
    if (!unreachable) return
    const timer = setInterval(() => void session.refetch(), 2500)
    return () => clearInterval(timer)
  }, [unreachable, session])

  if (session.isPending) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">Cargando…</div>
  }
  if (unreachable) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center" role="status">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-500" />
        <p className="text-sm font-medium text-slate-800">No se pudo conectar con el servidor</p>
        <p className="text-sm text-slate-500">Reintentando… Tu sesión y tus borradores siguen a salvo.</p>
        <button className="btn" onClick={() => void session.refetch()}>
          Reintentar ahora
        </button>
      </div>
    )
  }
  if (!session.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <>{children}</>
}
