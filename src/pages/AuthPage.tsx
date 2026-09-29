import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { Logo } from '../components/Logo.tsx'
import { signIn, signUp, useSession } from '../lib/auth-client.ts'

const STEP_COLORS = ['#E5484D', '#3E63DD', '#30A46C', '#F76B15', '#8E4EC6', '#12A594']

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const session = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session.data) return <Navigate to={from} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res =
        mode === 'login'
          ? await signIn.email({ email, password })
          : await signUp.email({ email, password, name: name.trim() || email.split('@')[0] })
      if (res.error) {
        const code = res.error.code ?? ''
        if (code === 'EMAIL_NOT_ALLOWED' || res.error.status === 403) {
          setError('Este correo no está autorizado para registrarse en StepDB.')
        } else if (mode === 'login') {
          setError('Correo o contraseña incorrectos.')
        } else if (code.includes('USER_ALREADY_EXISTS')) {
          setError('Ya existe una cuenta con ese correo.')
        } else if (code.includes('PASSWORD')) {
          setError('La contraseña debe tener entre 8 y 128 caracteres.')
        } else {
          setError(res.error.message ?? 'No se pudo completar la operación.')
        }
        return
      }
      await session.refetch()
      navigate(from, { replace: true })
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-white px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:18px_18px]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Logo size={34} />
          <div className="flex gap-1">
            {STEP_COLORS.map((c, i) => (
              <span key={c} className="h-1.5 w-6 rounded-full" style={{ background: c, opacity: 0.35 + i * 0.12 }} />
            ))}
          </div>
          <p className="text-center text-sm text-slate-500">Modela tu base de datos step por step.</p>
        </div>
        <form onSubmit={onSubmit} className="sdb-rise rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="mb-4 text-lg font-semibold text-slate-900">{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h1>
          {mode === 'register' && (
            <div className="mb-3">
              <label className="label" htmlFor="name">Nombre</label>
              <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
          )}
          <div className="mb-3">
            <label className="label" htmlFor="email">Correo</label>
            <input
              id="email"
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError(null)
              }}
              autoComplete="email"
            />
          </div>
          <div className="mb-4">
            <label className="label" htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              className="input"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError(null)
              }}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>
          {error && (
            <p role="alert" className="sdb-shake mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary w-full py-2" disabled={busy}>
            {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
          <p className="mt-4 text-center text-sm text-slate-500">
            {mode === 'login' ? (
              <>¿No tienes cuenta? <Link className="font-medium text-slate-900 underline-offset-2 hover:underline" to="/register" state={location.state}>Regístrate</Link></>
            ) : (
              <>¿Ya tienes cuenta? <Link className="font-medium text-slate-900 underline-offset-2 hover:underline" to="/login" state={location.state}>Inicia sesión</Link></>
            )}
          </p>
        </form>
      </div>
    </div>
  )
}
