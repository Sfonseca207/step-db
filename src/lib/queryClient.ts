import { QueryClient } from '@tanstack/react-query'

/** Caché de TanStack Query. Fuera de React la lee el autocompletado del editor. */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false, retry: 1 } },
})
