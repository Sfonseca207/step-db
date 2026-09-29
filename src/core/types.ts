/** Tipos compartidos entre la UI y el servidor. Sin dependencias de DOM ni de Node. */

export const FILE_KINDS = ['model', 'mongo', 'views', 'notes'] as const
export type FileKind = (typeof FILE_KINDS)[number]

/** Archivos que contienen DBML y forman el modelo combinado. */
export const DBML_KINDS = ['model', 'mongo'] as const
export type DbmlKind = (typeof DBML_KINDS)[number]

export const STEP_STATUSES = ['en_curso', 'completado'] as const
export type StepStatus = (typeof STEP_STATUSES)[number]

export type Store = 'sqlserver' | 'mongo'

/** Lo mínimo de un step que necesita el core para construir el modelo. */
export interface StepSource {
  id: string
  slug: string
  position: number
  files: Record<DbmlKind, string>
}

/** Ubicación de un objeto en el archivo de su step (líneas 1-based, locales al archivo). */
export interface SourceLoc {
  stepId: string
  kind: DbmlKind
  startLine: number
  endLine: number
}

export interface ColumnDefault {
  type: 'number' | 'string' | 'boolean' | 'expression'
  value: string
}

export interface ColumnModel {
  name: string
  type: string
  pk: boolean
  notNull: boolean
  unique: boolean
  increment: boolean
  default?: ColumnDefault
  note?: string
  /** Step al que pertenece la columna: el de su tabla o el de `[step: "…"]`. */
  stepId: string
  /** Nombre de enum si el tipo es un enum del modelo (`schema.enum`). */
  enumRef?: string
  line: number
}

export interface IndexModel {
  name?: string
  columns: string[]
  unique: boolean
  pk: boolean
  type?: string
}

export interface TableModel {
  /** `schema.tabla`: identidad estable de la tabla (clave del layout y del diff). */
  key: string
  schema: string
  name: string
  store: Store
  stepId: string
  note?: string
  headerColor?: string
  columns: ColumnModel[]
  indexes: IndexModel[]
  loc: SourceLoc
}

/** Cardinalidad de un extremo de la relación. */
export type EndpointCardinality = '1' | 'N'

export interface RelationEndpoint {
  table: string
  columns: string[]
  cardinality: EndpointCardinality
}

export type RelationKind = 'fk' | 'logical'

export interface RelationModel {
  /** Identidad estable: `from(cols)>to(cols)`. */
  id: string
  name?: string
  kind: RelationKind
  /** Lado "hijo" (muchos) cuando la relación es N:1; si no, el primero declarado. */
  from: RelationEndpoint
  to: RelationEndpoint
  /** Operador DBML equivalente visto desde `from`: `>` N:1, `<` 1:N, `-` 1:1, `<>` N:M. */
  op: '>' | '<' | '-' | '<>'
  onDelete?: string
  onUpdate?: string
  /** Step donde se declaró la relación. */
  stepId: string
}

export interface EnumModel {
  key: string
  schema: string
  name: string
  values: { name: string; note?: string }[]
  stepId: string
}

export interface ProjectModel {
  tables: TableModel[]
  relations: RelationModel[]
  enums: EnumModel[]
}

export type Severity = 'error' | 'warning'

/** Error o advertencia traducido a la ubicación local `step · archivo:línea`. */
export interface Diagnostic {
  severity: Severity
  message: string
  stepId?: string
  stepSlug?: string
  kind?: DbmlKind
  line?: number
  column?: number
  /** Código de regla (linter) o de validación. */
  code?: string
  /** Tabla afectada (`schema.tabla`), si aplica. */
  table?: string
}

export interface BuildResult {
  model: ProjectModel | null
  errors: Diagnostic[]
}

export interface DiffEntry {
  added: string[]
  removed: string[]
  changed: string[]
}

/** Diff semántico entre dos modelos. Columnas como `schema.tabla.columna`. */
export interface ModelDiff {
  tables: DiffEntry
  columns: DiffEntry
  relations: DiffEntry
}
