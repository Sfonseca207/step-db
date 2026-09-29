import type { Point } from './graph.ts'

/** Acciones del canvas que registra `Canvas` para la barra de herramientas y otros paneles. */
export const canvasActions: {
  autoOrganize: (groupByStep: boolean) => Promise<void>
  /** `reserve`: deja libre la parte superior e inferior (rótulo y controles del replay). */
  fitView: (keys?: string[], reserve?: boolean) => void
  positions: () => Record<string, Point>
} = {
  autoOrganize: async () => {},
  fitView: () => {},
  positions: () => ({}),
}
