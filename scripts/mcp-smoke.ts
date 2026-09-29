/**
 * Prueba de humo del servidor MCP de StepDB con el cliente oficial del SDK.
 *
 *   STEPDB_TOKEN=sdb_… node scripts/mcp-smoke.ts [url] [--demo]
 *
 * Sin `--demo` solo lista tools y el resumen del proyecto. Con `--demo` agrega una
 * colección de ejemplo al archivo `mongo` del step activo y enfoca la UI en ella.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const token = process.env.STEPDB_TOKEN
const url = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:8787/mcp'
const demo = process.argv.includes('--demo')
const collection = process.env.DEMO_COLLECTION ?? 'log_sincronizacion_erp'
if (!token) {
  console.error('Falta STEPDB_TOKEN')
  process.exit(1)
}

const text = (r: unknown) => (r as { content: { text: string }[] }).content.map((c) => c.text).join('\n')

const client = new Client({ name: 'stepdb-smoke', version: '1.0.0' })
await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }))
const { tools } = await client.listTools()
console.log('tools:', tools.map((t) => t.name).join(', '))
const overview = JSON.parse(text(await client.callTool({ name: 'get_project_overview', arguments: {} }))) as {
  name: string
  activeStep: string
  steps: { slug: string; tables: unknown[] }[]
}
console.log(`proyecto: ${overview.name} · step activo: ${overview.activeStep}`)
for (const s of overview.steps) console.log(`  ${s.slug}: ${s.tables.length} tablas/colecciones`)

if (demo) {
  const step = JSON.parse(text(await client.callTool({ name: 'get_step', arguments: {} }))) as {
    slug: string
    files: { mongo: { content: string; version: number } }
  }
  const content = `${step.files.mongo.content.trimEnd()}

Table mongo.${collection} [note: 'Envíos de ventas al ERP (creado por MCP)'] {
  _id objectId [pk]
  venta_id long [not null]
  "erp.documento" string
  "erp.estado" string [not null]
  intentos int [not null, default: 0]
  enviado_en date

  indexes {
    venta_id
  }
}

Ref: mongo.${collection}.venta_id > ventas.venta.id
`
  const res = await client.callTool({
    name: 'write_step_file',
    arguments: { step: step.slug, kind: 'mongo', content, version: step.files.mongo.version },
  })
  console.log(res.isError ? `ERROR: ${text(res)}` : text(res))
  console.log(text(await client.callTool({ name: 'focus', arguments: { table: `mongo.${collection}` } })))
}
await client.close()
