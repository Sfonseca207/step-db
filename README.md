# StepDB

Modelado de bases de datos **por steps** (etapas de trabajo), al estilo de [dbdiagram.io](https://dbdiagram.io):

- Cada step tiene fecha, color, descripción y notas; sus tablas llevan su color y las relaciones entre steps se pintan con el gradiente de ambos.
- El modelo se escribe en **DBML** (SQL Server) y en DBML con schema `mongo` para **colecciones MongoDB**, con referencias lógicas entre ambos.
- **Servidor MCP** en `/mcp`: Claude Code (o cualquier agente) lee y escribe el modelo con validación, y la UI se actualiza al instante animando lo que cambió.
- Exporta **T-SQL de SQL Server** (completo, por step o idempotente), scripts **mongosh** con `$jsonSchema` y **DBML combinado** para dbdiagram.

Especificación completa: [`docs/SPEC-MVP.md`](docs/SPEC-MVP.md). Decisiones de implementación: [`docs/DECISIONES.md`](docs/DECISIONES.md). Pendientes: [`docs/PENDIENTES.md`](docs/PENDIENTES.md).

## Arquitectura

| Carpeta | Qué hay |
|---|---|
| `src/` | Frontend React 19 + Vite: React Flow (canvas), Monaco (editor), Zustand, TanStack Query, Tailwind v4 |
| `src/core/` | Lógica **compartida** front/back (TS puro): merge y parseo DBML con mapa de offsets, diff semántico, linter y exportadores |
| `server/` | Backend Hono sobre Node (type stripping, sin compilar): API REST, WebSocket, MCP, Better Auth y Drizzle |
| `server/db/migrations/` | Migraciones SQL generadas por drizzle-kit |
| `server/seed/gasapp/` | DBML del proyecto de ejemplo (GasApp) |

Un solo proceso sirve la UI compilada (`dist/`), la API (`/api`), el WebSocket (`/ws`) y el MCP (`/mcp`). Postgres es la fuente de verdad.

## Correr en local

Requisitos: Node ≥ 24 y Docker.

```bash
npm install
cp .env.example .env          # y ajusta BETTER_AUTH_SECRET y ALLOWED_EMAILS
npm run db:up                 # Postgres 18 en Docker (crea stepdb y stepdb_test)
npm run db:migrate            # aplica migraciones
npm run dev                   # Vite (5173) + API (8787) con proxy de /api, /ws y /mcp
```

Abre <http://localhost:5173>, regístrate con un correo de `ALLOWED_EMAILS` (en local: `qa@stepdb.local`) y pulsa **Crear proyecto de ejemplo**.

Otros comandos:

```bash
npm test                      # Vitest (core, exportadores, API, WebSocket y MCP contra stepdb_test)
npx vitest run server/mcp.test.ts          # un solo archivo
npx vitest run -t "409"                    # tests cuyo nombre coincide
npm run lint
npm run build && npm start    # build de producción servido por Hono en :8787
npm run db:generate           # nueva migración tras cambiar server/db/schema.ts
npm run db:down               # detiene Postgres (los datos quedan en el volumen)
```

## Conectar Claude Code por MCP

1. En la app, entra a **Tokens MCP** y crea un token. Se muestra **una sola vez** (en la base solo queda su hash SHA-256) junto con el comando listo para copiar.
2. Regístralo en Claude Code:

   ```bash
   claude mcp add --transport http stepdb http://localhost:8787/mcp --header "Authorization: Bearer sdb_…"
   ```

   (También funciona `http://localhost:5173/mcp` a través del proxy de Vite.)
3. Pídele a Claude que llame a `get_guide` y `get_project_overview`. Cada `write_step_file` valida el proyecto completo antes de guardar y la UI abierta anima el cambio y muestra un toast "Claude · step: +N tablas…".

Tools disponibles: `list_projects`, `get_guide`, `get_project_overview`, `get_step`, `create_step`, `update_step`, `write_step_file`, `validate_project`, `export`, `focus`.

Prueba de humo sin Claude Code:

```bash
STEPDB_TOKEN=sdb_… node scripts/mcp-smoke.ts http://localhost:8787/mcp          # lista tools y steps
STEPDB_TOKEN=sdb_… node scripts/mcp-smoke.ts http://localhost:8787/mcp --demo   # escribe una colección de ejemplo
```

Los tokens se pueden revocar desde la misma página; un token revocado recibe `401`.

## Variables de entorno

| Variable | Local | Descripción |
|---|---|---|
| `DATABASE_URL` | `postgres://stepdb:stepdb@localhost:5432/stepdb` | Conexión a Postgres |
| `DATABASE_URL_TEST` | `postgres://stepdb:stepdb@localhost:5432/stepdb_test` | Base de `npm test` |
| `DB_DRIVER` | `postgres` | Driver de base (solo `postgres` por ahora) |
| `PORT` | `8787` | Puerto del servidor |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` | Firma de sesiones |
| `BETTER_AUTH_URL` | `http://localhost:5173` | URL pública de la app |
| `ALLOWED_EMAILS` | `tu@correo.com,qa@stepdb.local` | Lista blanca de registro |

El servidor valida estas variables con zod al arrancar y no inicia si falta alguna.

## Despliegue en Railway

| Entorno | Rama | URL | Estado |
|---|---|---|---|
| development | `development` | <https://step-db-development-dd0b.up.railway.app> | desplegado |
| production | `main` | <https://step-db-production.up.railway.app> | pendiente |

Cada push a la rama del entorno despliega solo. La configuración de build y despliegue vive en **los ajustes del servicio en Railway**, por entorno (Railway ya no lee `railway.json` en servicios nuevos):

| Ajuste | Valor |
|---|---|
| Builder | Railpack; toma la versión de Node de `engines.node` |
| Build command | `npm run build` |
| Pre-deploy command | `npm run db:migrate` (límite de 300 s). Si falla, Railway cancela el despliegue y la versión anterior sigue arriba |
| Start command | `npm start` |
| Healthcheck | `/health`, 60 s (responde 503 si la base no contesta) |
| Restart policy | `ON_FAILURE` |
| Watch patterns | `src/**`, `server/**`, `public/**`, `index.html`, `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig*.json`. Un commit que solo toca documentación o `scripts/` no despliega |
| Réplicas | 1, sin modo serverless |

Variables por entorno del servicio `step-db`:

| Variable | development | production |
|---|---|---|
| `DATABASE_URL` | `${{Postgres-4iHR.DATABASE_URL}}` | `${{Postgres.DATABASE_URL}}` |
| `PORT` | `8080` | `8080` |
| `NODE_ENV` | `production` | `production` |
| `BETTER_AUTH_URL` | `https://step-db-development-dd0b.up.railway.app` | `https://step-db-production.up.railway.app` |
| `BETTER_AUTH_SECRET` | secreto propio | secreto propio (distinto) |
| `ALLOWED_EMAILS` | correos permitidos | correos permitidos |

Con `NODE_ENV=production` las cookies son `Secure` y se activa HSTS. La IP del cliente para el rate limiting se lee de `x-real-ip`, que pone el proxy de Railway.

La réplica única es obligatoria: el hub de tiempo real y el rate limiting viven en la memoria del proceso.

Verificar un entorno desplegado (health, UI, auth, API, WebSocket y MCP):

```bash
STEPDB_EMAIL=… STEPDB_PASSWORD=… node scripts/deploy-smoke.ts https://<dominio> [--signup]
```

Conexión MCP remota:

```bash
claude mcp add --transport http stepdb https://<dominio>/mcp --header "Authorization: Bearer sdb_…"
```
