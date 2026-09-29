import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import type { ModelChangedEvent, ProjectDto, RealtimeEvent, StepDto, WriteFileOk } from '../src/core/api.ts'
import { sql } from './db/client.ts'
import { closeDb, createUser, request, resetDb, startServer, type TestUser } from './test/helpers.ts'

beforeEach(resetDb)
afterAll(closeDb)

async function exampleProject(user: TestUser): Promise<ProjectDto> {
  const res = await request('POST', '/api/projects/example', { cookie: user.cookie })
  expect(res.status).toBe(201)
  return (await res.json()) as ProjectDto
}

describe('proyectos y steps', () => {
  it('crea un proyecto con un primer step vacío y activo', async () => {
    const u = await createUser()
    const res = await request('POST', '/api/projects', { cookie: u.cookie, body: { name: 'GasApp' } })
    const p = (await res.json()) as ProjectDto
    expect(p.steps).toHaveLength(1)
    expect(p.steps[0]).toMatchObject({ slug: '01-inicio', position: 1, status: 'en_curso', color: '#E5484D' })
    expect(p.activeStepId).toBe(p.steps[0].id)
    expect(Object.keys(p.steps[0].files).sort()).toEqual(['model', 'mongo', 'notes', 'views'])
    const list = (await (await request('GET', '/api/projects', { cookie: u.cookie })).json()) as { stepCount: number }[]
    expect(list[0].stepCount).toBe(1)
  })

  it('crea el proyecto de ejemplo con 4 steps', async () => {
    const u = await createUser()
    const p = await exampleProject(u)
    expect(p.steps.map((s) => s.slug)).toEqual([
      '01-recepcion-ventas',
      '02-terceros-clientes',
      '03-facturacion',
      '04-log-integraciones',
    ])
    expect(p.activeStepId).toBe(p.steps[3].id)
    expect(p.steps[2].files.views.content).toMatch(/CREATE VIEW/)
  })

  it('crea steps con slug NN-nombre y color siguiente, y los edita', async () => {
    const u = await createUser()
    const p = await exampleProject(u)
    const res = await request('POST', `/api/projects/${p.id}/steps`, {
      cookie: u.cookie,
      body: { name: 'Inventario de tanques', description: 'Mediciones' },
    })
    expect(res.status).toBe(201)
    const s = (await res.json()) as StepDto
    expect(s.slug).toBe('05-inventario-de-tanques')
    expect(s.color).toBe('#8E4EC6')
    const again = (await (await request('GET', `/api/projects/${p.id}`, { cookie: u.cookie })).json()) as ProjectDto
    expect(again.activeStepId).toBe(s.id)

    const patched = await request('PATCH', `/api/steps/${s.id}`, {
      cookie: u.cookie,
      body: { name: 'Tanques', status: 'completado', color: '#12A594' },
    })
    expect(patched.status).toBe(200)
    expect(await patched.json()).toMatchObject({ name: 'Tanques', slug: '05-inventario-de-tanques', status: 'completado' })

    const bad = await request('PATCH', `/api/steps/${s.id}`, { cookie: u.cookie, body: { color: 'rojo' } })
    expect(bad.status).toBe(400)
  })

  it('reordena steps', async () => {
    const u = await createUser()
    const p = await exampleProject(u)
    const ids = p.steps.map((s) => s.id).reverse()
    const res = await request('PUT', `/api/projects/${p.id}/steps/order`, { cookie: u.cookie, body: { stepIds: ids } })
    expect(res.status).toBe(200)
    const steps = (await res.json()) as StepDto[]
    expect(steps.map((s) => s.id)).toEqual(ids)
    const partial = await request('PUT', `/api/projects/${p.id}/steps/order`, { cookie: u.cookie, body: { stepIds: ids.slice(1) } })
    expect(partial.status).toBe(400)
  })

  it('mezcla el layout', async () => {
    const u = await createUser()
    const p = await exampleProject(u)
    await request('PUT', `/api/projects/${p.id}/layout`, {
      cookie: u.cookie,
      body: { positions: { 'ventas.venta': { x: 1, y: 2 }, 'core.estacion': { x: 3, y: 4 } } },
    })
    const res = await request('PUT', `/api/projects/${p.id}/layout`, {
      cookie: u.cookie,
      body: { positions: { 'ventas.venta': { x: 10, y: 20 } }, removed: ['core.estacion'], viewport: { x: 0, y: 0, zoom: 0.9 } },
    })
    expect(await res.json()).toEqual({ positions: { 'ventas.venta': { x: 10, y: 20 } }, viewport: { x: 0, y: 0, zoom: 0.9 } })
  })
})

describe('guardado de archivos', () => {
  it('guardar con versión vieja → 409 con el contenido actual', async () => {
    const u = await createUser()
    const p = await exampleProject(u)
    const step = p.steps[1]
    const v = step.files.model.version
    const first = await request('PUT', `/api/steps/${step.id}/files/model`, {
      cookie: u.cookie,
      body: { content: `${step.files.model.content}\n// cambio 1\n`, version: v },
    })
    expect(first.status).toBe(200)
    expect(((await first.json()) as WriteFileOk).version).toBe(v + 1)

    const stale = await request('PUT', `/api/steps/${step.id}/files/model`, {
      cookie: u.cookie,
      body: { content: `${step.files.model.content}\n// cambio 2\n`, version: v },
    })
    expect(stale.status).toBe(409)
    const body = (await stale.json()) as { error: string; current: { content: string; version: number } }
    expect(body.error).toBe('conflict')
    expect(body.current.version).toBe(v + 1)
    expect(body.current.content).toMatch(/cambio 1/)
  })

  it('guardar DBML inválido → 422 con archivo:línea y sin cambios en la base', async () => {
    const u = await createUser()
    const p = await exampleProject(u)
    const step = p.steps[2]
    const before = await sql`select content, version from step_file where step_id = ${step.id} and kind = 'model'`
    const revsBefore = await sql`select count(*)::int as n from revision`
    const res = await request('PUT', `/api/steps/${step.id}/files/model`, {
      cookie: u.cookie,
      body: { content: 'Table x {\n  id int [pk]\n  y int [ref: > no_existe.id]\n}', version: step.files.model.version },
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: string; errors: { stepSlug: string; kind: string; line: number }[] }
    expect(body.error).toBe('invalid')
    expect(body.errors[0]).toMatchObject({ stepSlug: '03-facturacion', kind: 'model', line: 3 })
    const after = await sql`select content, version from step_file where step_id = ${step.id} and kind = 'model'`
    expect(after).toEqual(before)
    const revsAfter = await sql`select count(*)::int as n from revision`
    expect(revsAfter[0].n).toBe(revsBefore[0].n)
  })

  it('rechaza un archivo que rompe referencias de otro step', async () => {
    const u = await createUser()
    const p = await exampleProject(u)
    // Borrar el step 01 dejaría refs colgando en los steps 02-04.
    const res = await request('PUT', `/api/steps/${p.steps[0].id}/files/model`, {
      cookie: u.cookie,
      body: { content: '', version: p.steps[0].files.model.version },
    })
    expect(res.status).toBe(422)
  })

  it('un guardado crea una revisión y emite model.changed por WebSocket', async () => {
    const u = await createUser()
    const p = await exampleProject(u)
    const server = await startServer()
    try {
      const ws = new WebSocket(`${server.url.replace('http', 'ws')}/ws?project=${p.id}`, {
        headers: { cookie: u.cookie, origin: 'http://localhost:5173' },
      })
      const events: RealtimeEvent[] = []
      await new Promise<void>((resolve, reject) => {
        ws.on('message', (data) => {
          const msg = JSON.parse(String(data)) as { type: string }
          if (msg.type === 'hello') resolve()
          else events.push(msg as RealtimeEvent)
        })
        ws.on('error', reject)
      })

      const step = p.steps[1]
      const content = `${step.files.model.content}\nTable terceros.contacto {\n  id bigint [pk, increment]\n  tercero_id bigint [not null, ref: > terceros.tercero.id]\n  telefono varchar(20)\n}\n`
      const res = await fetch(`${server.url}/api/steps/${step.id}/files/model`, {
        method: 'PUT',
        headers: {
          cookie: u.cookie,
          origin: 'http://localhost:5173',
          'content-type': 'application/json',
          'x-client-id': 'pestana-1',
        },
        body: JSON.stringify({ content, version: step.files.model.version }),
      })
      expect(res.status).toBe(200)
      const ok = (await res.json()) as WriteFileOk
      expect(ok.diff?.tables.added).toEqual(['terceros.contacto'])
      expect(ok.summary).toBe('+1 tabla, +1 relación')
      expect(ok.warnings.some((w) => w.code === 'fk-without-index' && w.table === 'terceros.contacto')).toBe(true)

      const deadline = Date.now() + 2000
      while (events.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20))
      const ev = events[0] as ModelChangedEvent
      expect(ev).toMatchObject({
        type: 'model.changed',
        projectId: p.id,
        stepId: step.id,
        kind: 'model',
        source: 'ui',
        clientId: 'pestana-1',
        version: step.files.model.version + 1,
      })
      expect(ev.diff?.tables.added).toEqual(['terceros.contacto'])

      const revs = await request('GET', `/api/steps/${step.id}/files/model/revisions`, { cookie: u.cookie })
      const list = (await revs.json()) as { version: number; source: string; summary: string; content: string }[]
      expect(list[0]).toMatchObject({ version: step.files.model.version + 1, source: 'ui', summary: '+1 tabla, +1 relación' })
      expect(list[0].content).toBe(content)
      ws.close()
    } finally {
      await server.close()
    }
  })

  it('el WebSocket sin sesión o de otro usuario no conecta', async () => {
    const a = await createUser('qa@stepdb.local')
    const b = await createUser('otro@stepdb.local')
    const p = await exampleProject(a)
    const server = await startServer()
    try {
      const statusOf = (cookie?: string) =>
        new Promise<number>((resolve) => {
          const ws = new WebSocket(`${server.url.replace('http', 'ws')}/ws?project=${p.id}`, {
            headers: cookie ? { cookie } : {},
          })
          ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0))
          ws.on('open', () => {
            ws.close()
            resolve(101)
          })
          ws.on('error', () => resolve(-1))
        })
      expect(await statusOf()).toBe(401)
      expect(await statusOf(b.cookie)).toBe(404)
      expect(await statusOf(a.cookie)).toBe(101)
    } finally {
      await server.close()
    }
  })
})
