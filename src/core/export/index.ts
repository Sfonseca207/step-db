import { exportCombinedDbml } from './dbml.ts'
import { exportMongo } from './mongo.ts'
import { exportMssql } from './mssql.ts'
import type { ExportInput, ExportOptions, ExportTarget } from './types.ts'

export * from './types.ts'
export { exportCombinedDbml } from './dbml.ts'
export { collectionSchema, exportMongo } from './mongo.ts'
export { exportMssql, objectName, splitViewBatches } from './mssql.ts'

export function runExport(target: ExportTarget, input: ExportInput, opts: ExportOptions = {}): string {
  if (target === 'mssql') return exportMssql(input, opts)
  if (target === 'mongo') return exportMongo(input, opts)
  return exportCombinedDbml(input)
}

export const EXPORT_EXTENSIONS: Record<ExportTarget, string> = { mssql: 'sql', mongo: 'js', dbml: 'dbml' }
