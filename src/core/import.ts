import { importer } from '@dbml/core'

/** Convierte DDL de SQL Server a DBML con el importador de @dbml/core (RF-82). */
export function ddlToDbml(sql: string): string {
  const dbml = importer.import(sql, 'mssql')
  // "bigint IDENTITY(1,1)" → bigint [increment]
  return dbml.replace(/^(\s*"[^"]+") "([^"]+?)\s+IDENTITY\([^)]*\)"(?: \[([^\]]*)\])?$/gm, (_m, name: string, type: string, settings?: string) => {
    const list = ['increment', ...(settings ? settings.split(',').map((x) => x.trim()) : [])]
    return `${name} ${/^[\w(),]+$/.test(type) ? type : `"${type}"`} [${list.join(', ')}]`
  })
}
