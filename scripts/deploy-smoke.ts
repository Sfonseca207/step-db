/**
 * Prueba de humo de un entorno desplegado de StepDB (health, UI, auth, API, WebSocket y MCP).
 *
 *   STEPDB_EMAIL=… STEPDB_PASSWORD=… node scripts/deploy-smoke.ts https://<dominio> [--signup]
 *
 * Con `--signup` registra la cuenta si aún no existe (el correo debe estar en `ALLOWED_EMAILS`).
 * Crea el proyecto de ejemplo si la cuenta no tiene proyectos y un token MCP que revoca al terminar.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import WebSocket from 'ws'

const base = (process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:8787').replace(/\/$/, '')
const signup = process.argv.includes('--signup')
const email = process.env.STEPDB_EMAIL
const password = process.env.STEPDB_PASSWORD
if (!email || !password) {
  console.error('Faltan STEPDB_EMAIL y STEPDB_PASSWORD')
  process.exit(1)
}

const secure = base.startsWith('https://')
let failed = 0

function check(name: string, ok: boolean, detail = '') {
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` · ${detail}` : ''}`)
}

async function call(method: string, path: string, opts: { cookie?: string; body?: unknown } = {}): Promise<Response> {
  const headers: Record<string, string> = { origin: base }
  if (opts.cookie) headers.cookie = opts.cookie
  if (opts.body !== undefined) headers['content-type'] = 'application/json'
  return fetch(`${base}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
}

// 1. Health y UI
const health = await call('GET', '/health')
const healthBody = (await health.json().catch(() => null)) as { status?: string; db?: string } | null
check('/health responde 200 con la base arriba', health.status === 200 && healthBody?.db === 'ok', JSON.stringify(healthBody))

const home = await call('GET', '/')
const html = await home.text()
check('la UI se sirve desde dist/', home.status === 200 && html.includes('<div id="root">'))
check('fallback SPA en rutas de la app', (await call('GET', '/projects')).headers.get('content-type')?.includes('text/html') === true)
check('CSP presente', home.headers.has('content-security-policy'))
if (secure) check('HSTS presente', home.headers.has('strict-transport-security'))
check('/api desconocida → 404 JSON', (await call('GET', '/api/no-existe')).status !== 200)

// 2. Auth
const intruder = await call('POST', '/api/auth/sign-up/email', {
  body: { email: `intruso-${Date.now()}@example.com`, password: 'contrasena-segura-123', name: 'intruso' },
})
check('registro fuera de la lista blanca → 403', intruder.status === 403, String(intruder.status))
check('/api/projects sin sesión → 401', (await call('GET', '/api/projects')).status === 401)
check('/mcp sin token → 401', (await call('POST', '/mcp', { body: {} })).status === 401)

let session = await call('POST', '/api/auth/sign-in/email', { body: { email, password } })
if (session.status !== 200 && signup) {
  session = await call('POST', '/api/auth/sign-up/email', { body: { email, password, name: email.split('@')[0] } })
}
check('inicio de sesión', session.status === 200, String(session.status))
if (session.status !== 200) process.exit(1)

const setCookies = session.headers.getSetCookie()
const cookie = setCookies.map((c) => c.split(';')[0]).join('; ')
if (secure) {
  check(
    'cookie de sesión Secure y HttpOnly',
    setCookies.some((c) => /session_token/.test(c) && /;\s*secure/i.test(c) && /;\s*httponly/i.test(c)),
  )
}

const me = (await (await call('GET', '/api/me', { cookie })).json()) as { email?: string }
check('/api/me devuelve la cuenta', me.email === email.toLowerCase(), me.email)

// 3. Proyecto
let projects = (await (await call('GET', '/api/projects', { cookie })).json()) as { id: string; name: string }[]
if (projects.length === 0) {
  const created = await call('POST', '/api/projects/example', { cookie })
  check('crea el proyecto de ejemplo', created.status === 201, String(created.status))
  projects = (await (await call('GET', '/api/projects', { cookie })).json()) as { id: string; name: string }[]
}
const project = projects[0]
check('la cuenta tiene un proyecto', Boolean(project), project?.name)
if (!project) process.exit(1)

// 4. WebSocket + MCP: la tool `focus` debe llegar como evento a la conexión abierta
const created = await call('POST', '/api/tokens', { cookie, body: { name: `deploy-smoke ${new Date().toISOString()}` } })
const token = (await created.json()) as { id: string; token: string }
check('crea un token MCP', created.status === 201 && token.token.startsWith('sdb_'))

const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws?project=${project.id}`, { headers: { cookie, origin: base } })
const events: { type: string }[] = []
const waitFor = (type: string, ms = 10000) =>
  new Promise<boolean>((resolve) => {
    const started = Date.now()
    const timer = setInterval(() => {
      const found = events.some((e) => e.type === type)
      if (found || Date.now() - started > ms) {
        clearInterval(timer)
        resolve(found)
      }
    }, 100)
  })
ws.on('message', (data) => {
  try {
    events.push(JSON.parse(String(data)) as { type: string })
  } catch {
    // pong u otro mensaje de texto
  }
})
ws.on('error', (err) => console.log(`  websocket: ${err.message}`))
check(`WebSocket (${secure ? 'wss' : 'ws'}) conecta y saluda`, await waitFor('hello'))

const text = (r: unknown) => (r as { content: { text: string }[] }).content.map((c) => c.text).join('\n')
const client = new Client({ name: 'stepdb-deploy-smoke', version: '1.0.0' })
try {
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token.token}` } },
    }),
  )
  const { tools } = await client.listTools()
  check('MCP lista las tools', tools.length > 0, `${tools.length} tools`)
  const overview = JSON.parse(text(await client.callTool({ name: 'get_project_overview', arguments: { projectId: project.id } }))) as {
    name: string
    steps: { slug: string }[]
  }
  check('MCP lee el proyecto', overview.name === project.name, `${overview.name} · ${overview.steps.length} steps`)
  const step = overview.steps[0]?.slug
  if (step) {
    await client.callTool({ name: 'focus', arguments: { projectId: project.id, step } })
    check('el evento del MCP llega por WebSocket', await waitFor('ui.focus'))
  }
  await client.close()
} catch (err) {
  check('MCP responde', false, err instanceof Error ? err.message : String(err))
}
ws.close()

const revoked = await call('DELETE', `/api/tokens/${token.id}`, { cookie })
check('revoca el token MCP', revoked.status === 204, String(revoked.status))

console.log(failed === 0 ? '\nTodo en orden.' : `\n${failed} verificación(es) fallaron.`)
process.exit(failed === 0 ? 0 : 1)
