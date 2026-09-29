import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import type { ModelChangedEvent, ProjectDto, RealtimeEvent } from '../src/core/api.ts'
import { closeDb, createUser, request, resetDb, startServer, type TestUser } from './test/helpers.ts'

let server: Awaited<ReturnType<typeof startServer>> | null = null

beforeEach(async () => {
  await resetDb()
  server = await startServer()
})
afterEach(async () => {
  await server?.close()
  server = null
})
afterAll(closeDb)

async function setup(): Promise<{ user: TestUser; project: ProjectDto; token: string }> {
  const user = await createUser()
  const project = (await (await request('POST', '/api/projects/example', { cookie: user.cookie })).json()) as ProjectDto
  const t = (await (await request('POST', '/api/tokens', { cookie: user.cookie, body: { name: 'Test' } })).json()) as { token: string }
  return { user, project, token: t.token }
}

async function connect(token?: string): Promise<Client> {
  const client = new Client({ name: 'stepdb-test', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(`${server!.url}/mcp`), {
    requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  })
  await client.connect(transport)
  return client
}

function textOf(result: unknown): string {
  const content = (result as { content: { type: string; text: string }[] }).content
  return content.map((c) => c.text).join('\n')
}

describe('MCP', () => {
  it('sin token → 401', async () => {
    const res = await fetch(`${server!.url}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(res.status).toBe(401)
    await expect(connect()).rejects.toThrow()
  })

  it('lista las tools y lee la guía y el resumen', async () => {
    const { token } = await setup()
    const client = await connect(token)
    const tools = await client.listTools()
    expect(tools.tools.map((t) => t.name).sort()).toEqual([
      'create_step',
      'export',
      'focus',
      'get_guide',
      'get_project_overview',
      'get_step',
      'list_projects',
      'update_step',
      'validate_project',
      'write_step_file',
    ])
    expect(textOf(await client.callTool({ name: 'get_guide', arguments: {} }))).toMatch(/step: "03-facturacion"/)
    const overview = JSON.parse(textOf(await client.callTool({ name: 'get_project_overview', arguments: {} })))
    expect(overview.activeStep).toBe('04-log-integraciones')
    expect(overview.steps[0].tables[0].table).toBe('core.estacion')
    expect(overview.steps[2].columnsAddedToOtherSteps).toEqual(['ventas.venta.facturada'])
    await client.close()
  })

  it('write_step_file: rechaza DBML inválido con archivo:línea; con DBML válido guarda y emite model.changed (mcp)', async () => {
    const { user, project, token } = await setup()
    const client = await connect(token)

    const step = JSON.parse(textOf(await client.callTool({ name: 'get_step', arguments: { step: '03-facturacion' } })))
    const invalid = await client.callTool({
      name: 'write_step_file',
      arguments: { step: '03-facturacion', kind: 'model', content: 'Table x {\n  id int [pk]\n  y int [ref: > nada.id]\n}', version: step.files.model.version },
    })
    expect(invalid.isError).toBe(true)
    expect(textOf(invalid)).toMatch(/03-facturacion · model:3 — /)

    const ws = new WebSocket(`${server!.url.replace('http', 'ws')}/ws?project=${project.id}`, { headers: { cookie: user.cookie } })
    const events: RealtimeEvent[] = []
    await new Promise<void>((resolve, reject) => {
      ws.on('message', (d) => {
        const m = JSON.parse(String(d)) as { type: string }
        if (m.type === 'hello') resolve()
        else events.push(m as RealtimeEvent)
      })
      ws.on('error', reject)
    })

    const content = `${step.files.model.content}\nTable facturacion.nota_credito {\n  id bigint [pk, increment]\n  factura_id bigint [not null, ref: > facturacion.factura.id]\n  valor decimal(18,2) [not null]\n\n  indexes {\n    factura_id\n  }\n}\n`
    const ok = await client.callTool({
      name: 'write_step_file',
      arguments: { step: '03-facturacion', kind: 'model', content, version: step.files.model.version },
    })
    expect(ok.isError).toBeFalsy()
    const body = JSON.parse(textOf(ok))
    expect(body).toMatchObject({ ok: true, version: step.files.model.version + 1, summary: '+1 tabla, +1 relación' })
    expect(body.diff.tables.added).toEqual(['facturacion.nota_credito'])

    const deadline = Date.now() + 2000
    while (!events.some((e) => e.type === 'model.changed') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20))
    const ev = events.find((e) => e.type === 'model.changed') as ModelChangedEvent
    expect(ev).toMatchObject({ source: 'mcp', kind: 'model', author: 'Claude', summary: '+1 tabla, +1 relación' })

    // Con la versión vieja → conflicto
    const stale = await client.callTool({
      name: 'write_step_file',
      arguments: { step: '03-facturacion', kind: 'model', content, version: step.files.model.version },
    })
    expect(stale.isError).toBe(true)
    expect(textOf(stale)).toMatch(/Conflicto/)

    ws.close()
    await client.close()
  })

  it('crea y edita steps, valida candidatos, exporta y enfoca', async () => {
    const { token } = await setup()
    const client = await connect(token)
    const created = JSON.parse(textOf(await client.callTool({ name: 'create_step', arguments: { name: 'Fidelización' } })))
    expect(created.slug).toBe('05-fidelizacion')
    const updated = JSON.parse(
      textOf(await client.callTool({ name: 'update_step', arguments: { step: '05-fidelizacion', status: 'completado' } })),
    )
    expect(updated.status).toBe('completado')

    const candidate = JSON.parse(
      textOf(
        await client.callTool({
          name: 'validate_project',
          arguments: { step: '05-fidelizacion', kind: 'model', content: 'Table fidelizacion.log_puntos {\n  id int\n}' },
        }),
      ),
    )
    expect(candidate.valid).toBe(true)
    expect(candidate.warnings.join('\n')).toMatch(/no tiene clave primaria/)
    expect(candidate.warnings.join('\n')).toMatch(/parece un log/)

    const sql = textOf(await client.callTool({ name: 'export', arguments: { target: 'mssql', step: '03-facturacion' } }))
    expect(sql).toMatch(/CREATE TABLE \[facturacion\]\.\[factura\]/)
    const focus = await client.callTool({ name: 'focus', arguments: { table: 'ventas.venta' } })
    expect(textOf(focus)).toMatch(/Foco enviado/)
    const missing = await client.callTool({ name: 'get_step', arguments: { step: '99-nada' } })
    expect(missing.isError).toBe(true)
    await client.close()
  })

  it('un token no ve proyectos de otro usuario', async () => {
    const { project } = await setup()
    const other = await createUser('otro@stepdb.local')
    const t = (await (await request('POST', '/api/tokens', { cookie: other.cookie, body: { name: 'Otro' } })).json()) as {
      token: string
    }
    const client = await connect(t.token)
    const res = await client.callTool({ name: 'get_step', arguments: { projectId: project.id } })
    expect(res.isError).toBe(true)
    expect(textOf(res)).toMatch(/no encontrado/)
    expect(JSON.parse(textOf(await client.callTool({ name: 'list_projects', arguments: {} })))).toEqual([])
    await client.close()
  })
})
