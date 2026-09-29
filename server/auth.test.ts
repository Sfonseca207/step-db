import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from './db/client.ts'
import { closeDb, createUser, request, resetDb, signUp } from './test/helpers.ts'

beforeEach(resetDb)
afterAll(closeDb)

describe('auth y seguridad', () => {
  it('rechaza el registro de un correo fuera de la lista blanca', async () => {
    const res = await signUp('intruso@example.com')
    expect(res.status).toBe(403)
    const body = (await res.json()) as { message?: string }
    expect(body.message).toMatch(/no está autorizado/)
    const rows = await sql`select count(*)::int as n from "user"`
    expect(rows[0].n).toBe(0)
  })

  it('permite registrar un correo de la lista blanca e iniciar sesión', async () => {
    const user = await createUser('qa@stepdb.local')
    expect(user.cookie).toMatch(/better-auth\.session_token=/)
    const me = await request('GET', '/api/me', { cookie: user.cookie })
    expect(me.status).toBe(200)
    expect(await me.json()).toMatchObject({ email: 'qa@stepdb.local' })

    const login = await request('POST', '/api/auth/sign-in/email', {
      body: { email: 'qa@stepdb.local', password: 'contrasena-segura-123' },
    })
    expect(login.status).toBe(200)
    const bad = await request('POST', '/api/auth/sign-in/email', {
      body: { email: 'qa@stepdb.local', password: 'otra-contrasena-mala' },
    })
    expect(bad.status).toBe(401)
  })

  it('/api/projects sin sesión → 401', async () => {
    const res = await request('GET', '/api/projects')
    expect(res.status).toBe(401)
  })

  it('el proyecto de otro usuario responde 404', async () => {
    const a = await createUser('qa@stepdb.local')
    const b = await createUser('otro@stepdb.local')
    const created = await request('POST', '/api/projects', { cookie: a.cookie, body: { name: 'Privado' } })
    expect(created.status).toBe(201)
    const { id } = (await created.json()) as { id: string }
    expect((await request('GET', `/api/projects/${id}`, { cookie: a.cookie })).status).toBe(200)
    expect((await request('GET', `/api/projects/${id}`, { cookie: b.cookie })).status).toBe(404)
    expect((await request('PATCH', `/api/projects/${id}`, { cookie: b.cookie, body: { name: 'x' } })).status).toBe(404)
    expect((await request('DELETE', `/api/projects/${id}`, { cookie: b.cookie })).status).toBe(404)
    expect((await request('GET', '/api/projects/no-es-uuid', { cookie: b.cookie })).status).toBe(404)
  })

  it('rechaza escrituras con Origin ajeno (CSRF)', async () => {
    const a = await createUser('qa@stepdb.local')
    const res = await request('POST', '/api/projects', {
      cookie: a.cookie,
      body: { name: 'x' },
      headers: { origin: 'https://evil.example' },
    })
    expect(res.status).toBe(403)
  })

  it('token revocado → 401 en /mcp y el token en claro no se guarda', async () => {
    const a = await createUser('qa@stepdb.local')
    const created = await request('POST', '/api/tokens', { cookie: a.cookie, body: { name: 'Claude Code' } })
    expect(created.status).toBe(201)
    const { token, id, prefix } = (await created.json()) as { token: string; id: string; prefix: string }
    expect(token).toMatch(/^sdb_/)
    expect(token.startsWith(prefix)).toBe(true)

    const rows = await sql`select token_hash, prefix from api_token`
    expect(rows).toHaveLength(1)
    expect(rows[0].token_hash).not.toBe(token)
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/)
    const dump = await sql`select row_to_json(t)::text as j from api_token t`
    expect(dump[0].j.includes(token)).toBe(false)

    const noToken = await request('POST', '/mcp', { body: {} })
    expect(noToken.status).toBe(401)
    const valid = await request('POST', '/mcp', { body: {}, headers: { authorization: `Bearer ${token}` } })
    expect(valid.status).not.toBe(401)

    const listed = (await (await request('GET', '/api/tokens', { cookie: a.cookie })).json()) as { lastUsedAt: string | null }[]
    expect(listed[0].lastUsedAt).not.toBeNull()

    expect((await request('DELETE', `/api/tokens/${id}`, { cookie: a.cookie })).status).toBe(204)
    const revoked = await request('POST', '/mcp', { body: {}, headers: { authorization: `Bearer ${token}` } })
    expect(revoked.status).toBe(401)
  })

  it('/health responde ok con la base', async () => {
    const res = await request('GET', '/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', db: 'ok' })
  })
})

describe('cabeceras', () => {
  it('las respuestas llevan cabeceras de seguridad y la API no se cachea como asset', async () => {
    const res = await request('GET', '/health')
    expect(res.headers.get('content-security-policy')).toMatch(/default-src 'self'/)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('cache-control')).toBeNull()
  })
})
