/** Contratos de la API REST y del WebSocket, compartidos por la UI y el servidor. */
import type { Conventions, Layout } from './schemas.ts'
import type { Diagnostic, FileKind, ModelDiff, StepStatus } from './types.ts'

export interface StepFileDto {
  content: string
  version: number
  updatedAt: string
}

export interface StepDto {
  id: string
  slug: string
  position: number
  name: string
  workDate: string
  color: string
  status: StepStatus
  description: string | null
  files: Record<FileKind, StepFileDto>
}

export interface ProjectDto {
  id: string
  name: string
  description: string | null
  conventions: Conventions
  conventionsMd: string
  activeStepId: string | null
  layout: Layout
  createdAt: string
  updatedAt: string
  steps: StepDto[]
}

export interface ProjectSummaryDto {
  id: string
  name: string
  description: string | null
  stepCount: number
  /** Colores de los steps en orden cronológico. */
  stepColors: string[]
  createdAt: string
  updatedAt: string
}

export type WriteSource = 'ui' | 'mcp' | 'api' | 'seed'

export interface WriteFileOk {
  ok: true
  version: number
  diff: ModelDiff | null
  summary: string
  warnings: Diagnostic[]
}

export interface WriteFileConflict {
  ok: false
  error: 'conflict'
  current: { content: string; version: number }
}

export interface WriteFileInvalid {
  ok: false
  error: 'invalid'
  errors: Diagnostic[]
}

export interface RevisionDto {
  id: string
  stepId: string
  kind: FileKind
  version: number
  source: WriteSource
  authorName: string | null
  summary: string | null
  diff: ModelDiff | null
  createdAt: string
  content?: string
}

export interface ActivityDto extends RevisionDto {
  stepSlug: string
  stepName: string
  stepColor: string
}

export interface ApiTokenDto {
  id: string
  name: string
  prefix: string
  lastUsedAt: string | null
  createdAt: string
  revokedAt: string | null
}

/* ------------------------------------------------------------------ */
/* WebSocket (servidor → cliente)                                      */
/* ------------------------------------------------------------------ */

export interface ModelChangedEvent {
  type: 'model.changed'
  projectId: string
  stepId: string
  kind: FileKind
  version: number
  source: WriteSource
  diff: ModelDiff | null
  summary: string
  author: string | null
  clientId: string | null
}

export interface ProjectChangedEvent {
  type: 'project.changed'
  projectId: string
  reason: 'meta' | 'steps' | 'order' | 'active' | 'deleted'
  source: WriteSource
  clientId: string | null
}

export interface LayoutChangedEvent {
  type: 'layout.changed'
  projectId: string
  clientId: string | null
}

export interface UiFocusEvent {
  type: 'ui.focus'
  projectId: string
  table?: string
  stepId?: string
}

export type RealtimeEvent = ModelChangedEvent | ProjectChangedEvent | LayoutChangedEvent | UiFocusEvent

/** Header con el que la UI identifica sus propias escrituras (para ignorar el eco). */
export const CLIENT_ID_HEADER = 'x-client-id'
