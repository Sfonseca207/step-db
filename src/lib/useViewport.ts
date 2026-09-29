import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

/** Ancho de la ventana, reactivo. */
export function useViewportWidth(): number {
  return useSyncExternalStore(subscribe, () => window.innerWidth)
}
