import type { Point } from './graph.ts'

/** Acciones del canvas que registra `Canvas` para la barra de herramientas y otros paneles. */
export const canvasActions: {
  autoOrganize: (groupByStep: boolean) => Promise<void>
  fitView: (keys?: string[]) => void
  positions: () => Record<string, Point>
} = {
  autoOrganize: async () => {},
  fitView: () => {},
  positions: () => ({}),
}
