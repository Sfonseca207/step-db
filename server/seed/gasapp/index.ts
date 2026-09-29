import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import type { FileKind, StepStatus } from '../../../src/core/types.ts'

export interface SeedStep {
  slug: string
  name: string
  workDate: string
  color: string
  status: StepStatus
  description: string
  files: Record<FileKind, string>
}

export interface SeedProject {
  name: string
  description: string
  conventionsMd: string
  steps: SeedStep[]
}

const here = dirname(fileURLToPath(import.meta.url))

const FILE_NAMES: Record<FileKind, string> = {
  model: 'model.dbml',
  mongo: 'mongo.dbml',
  views: 'views.sql',
  notes: 'notes.md',
}

function readStepFiles(slug: string): Record<FileKind, string> {
  const out = {} as Record<FileKind, string>
  for (const kind of Object.keys(FILE_NAMES) as FileKind[]) {
    const path = join(here, slug, FILE_NAMES[kind])
    out[kind] = existsSync(path) ? readFileSync(path, 'utf8') : ''
  }
  return out
}

const STEPS: Omit<SeedStep, 'files'>[] = [
  {
    slug: '01-recepcion-ventas',
    name: 'Recepción de ventas',
    workDate: '2026-09-28',
    color: '#E5484D',
    status: 'completado',
    description: 'Estaciones, productos y ventas recibidas desde los surtidores.',
  },
  {
    slug: '02-terceros-clientes',
    name: 'Terceros y clientes',
    workDate: '2026-09-29',
    color: '#3E63DD',
    status: 'completado',
    description: 'Maestro único de terceros y vehículos de flotas.',
  },
  {
    slug: '03-facturacion',
    name: 'Facturación',
    workDate: '2026-09-30',
    color: '#30A46C',
    status: 'completado',
    description: 'Facturación electrónica por venta, resoluciones DIAN y vista de ventas facturadas.',
  },
  {
    slug: '04-log-integraciones',
    name: 'Log de integraciones',
    workDate: '2026-10-01',
    color: '#F76B15',
    status: 'en_curso',
    description: 'Logs de envíos a servicios externos en MongoDB, fuera de SQL Server.',
  },
]

export function loadGasAppSeed(): SeedProject {
  return {
    name: 'GasApp (ejemplo)',
    description: 'Demo reducida del modelo de GasApp: ventas, terceros, facturación y logs en MongoDB.',
    conventionsMd:
      '- Nombres en español, snake_case y en singular.\n- PK `id`; FK `<tabla>_id`.\n- Los logs van en MongoDB, no en tablas SQL.',
    steps: STEPS.map((s) => ({ ...s, files: readStepFiles(s.slug) })),
  }
}
