// Punto de entrada: no participa en Fast Refresh.
/* eslint-disable react-refresh/only-export-components */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { RequireAuth } from './components/RequireAuth.tsx'
import AuthPage from './pages/AuthPage.tsx'
import ProjectsPage from './pages/ProjectsPage.tsx'
import './index.css'

const EditorPage = lazy(() => import('./editor/EditorPage.tsx'))
const TokensPage = lazy(() => import('./pages/TokensPage.tsx'))

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false, retry: 1 } },
})

const loading = <div className="flex h-full items-center justify-center text-sm text-slate-400">Cargando…</div>

const router = createBrowserRouter([
  { path: '/login', element: <AuthPage key="login" mode="login" /> },
  { path: '/register', element: <AuthPage key="register" mode="register" /> },
  { path: '/', element: <RequireAuth><ProjectsPage /></RequireAuth> },
  { path: '/tokens', element: <RequireAuth><Suspense fallback={loading}><TokensPage /></Suspense></RequireAuth> },
  { path: '/p/:projectId', element: <RequireAuth><Suspense fallback={loading}><EditorPage /></Suspense></RequireAuth> },
  { path: '*', element: <Navigate to="/" replace /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
