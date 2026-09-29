# Resumen de la sesión nocturna — MVP de StepDB

> Fecha: 2026-09-28 · Rama: `development` · Todo en local (sin push, sin Railway).
> Estado final: **fases 0 a 8 implementadas**, `npm run build`, `npm run lint` y `npm test` en verde (8 archivos, **62 tests**).

## 1. Qué quedó hecho

### Por fase

| Fase | Commit | Resultado | CA verificados |
|---|---|---|---|
| 0 · Preparación | `5214b20` | Dependencias, `tsconfig.server.json`, scripts, `docker-compose.yml` (Postgres 18), `.env`/`.env.example`, `env.ts` con zod, Vitest, Tailwind v4, Hono con `/health` y `serveStatic`, proxy de Vite, `railway.json`. | `/health` → `{status:"ok",db:"ok"}`; `npm run build && npm start` sirve la UI. |
| 1 · Core | `ea031d1` | `src/core`: merge + parseo DBML con mapa de offsets, `stepId` por tabla y columna, `store`, refs `fk`/`logical`, diff semántico, validaciones estructurales. Seed GasApp (4 steps, 10 tablas/colecciones, 1 vista). | Tests de parseo multi-step, errores `step · archivo:línea`, `stepId` de columna, refs lógicas y diff. |
| 2 · Base y auth | `917cd0d` | Esquema Drizzle + migración, Better Auth con lista blanca, tokens (hash SHA-256), `requireUser`/`requireToken`, CSP/`secureHeaders`, CSRF, `bodyLimit`, `assertProjectAccess`. Pantallas de registro/login/logout. | Correo fuera de lista → rechazado; sin sesión → 401; proyecto ajeno → 404; token revocado → 401 en `/mcp`; el token en claro no está en la base. |
| 3 · API + tiempo real | `dd84fab` | Rutas de §7.1, versión optimista (409), validación (422), revisiones, hub en memoria, WebSocket `/ws`, proyecto de ejemplo. | 409 con contenido actual; 422 con `archivo:línea` sin cambios en la base; revisión + `model.changed` a un cliente WS real. |
| 4 · Canvas | `f7d5722` | React Flow: nodos de tabla y colección, handles por columna, aristas con gradiente entre steps, crow's foot (1, N, 0..1), refs lógicas punteadas, auto-organizar con ELK en worker, persistencia de posiciones, minimapa, fondos por step. | Ejemplo completo con colores y relaciones; mover una tabla persiste tras recargar (Playwright). |
| 5 · Steps, editor y vivo | `558ece5` | Línea de tiempo de steps, crear/editar/activar/reordenar, Monaco con gramática DBML y markers, autoguardado solo si el modelo parsea, banner con último modelo válido, diálogo de conflicto, diff animado y toasts. | Crear step desde la UI; dos pestañas: la tabla aparece animada en la otra con toast (< 1 s); DBML inválido → banner sin borrar el canvas. |
| 6 · Exportadores | `210b9b3` | T-SQL (completo, por step incremental, idempotente), mongosh con `$jsonSchema` anidado, DBML combinado para dbdiagram; panel y menú de exportación; `GET /api/projects/:id/export/:target`. | Snapshots de los tres; FKs después de las tablas, `GO`, schemas creados, sin objetos Mongo; `$jsonSchema` anidado para campos punteados. |
| 7 · MCP y tokens | `ccc8b5e` | `/mcp` Streamable HTTP stateless con 10 tools, página de tokens (muestra el token una vez y el comando `claude mcp add`), evento `ui.focus`, `scripts/mcp-smoke.ts`, README. | Cliente del SDK: sin token → 401; DBML inválido rechazado con `archivo:línea`; válido → guarda, devuelve diff y el WS recibe `model.changed` con `source: 'mcp'`. Prueba de punta a punta con la UI abierta. |
| 8 · Pulido P1/P2 | `3114d81` | Linter + badge ⚠, replay, `Cmd+K`, doble clic → definición, nueva tabla/colección, historial y restaurar, reordenar steps, importar DBML y DDL, actividad, celebración y fondos por step. | Todo marcado en `docs/PENDIENTES.md`. Prueba de rendimiento con 150 tablas / 298 relaciones: ~100 fps en pan/zoom. |

### Requerimientos funcionales

- **Cuenta y proyectos:** RF-01 ✅ · RF-02 ✅ · RF-03 ✅
- **Steps:** RF-10 ✅ · RF-11 ✅ · RF-12 ✅ (ver pendiente del recolor de aristas) · RF-13 ✅ · RF-14 ✅ · RF-15 ✅ · RF-16 ✅
- **Canvas:** RF-20 ✅ · RF-21 ✅ · RF-22 ✅ · RF-23 ✅ · RF-24 ✅ · RF-25 ✅ · RF-26 ✅ · RF-27 ✅ · RF-28 ✅ · RF-29 ✅
- **Editor:** RF-30 ✅ · RF-31 ✅ · RF-32 ✅ · RF-33 ✅ · RF-34 ✅ · RF-35 ✅
- **Vivo:** RF-40 ✅ · RF-41 ✅ · RF-42 ✅ · RF-43 ✅
- **Export SQL Server:** RF-50 ✅ · RF-51 ✅ · RF-52 ✅ · RF-53 ✅
- **MongoDB:** RF-60 ✅ · RF-61 ✅
- **Linter:** RF-70 ✅ · RF-71 ✅
- **Import/export de proyecto:** RF-80 ✅ · RF-81 ✅ · RF-82 ✅ (parcial: sin crear `00-legado` automáticamente)
- **Replay:** RF-90 ✅
- **No funcionales:** RNF-01 ✅ (medido) · RNF-02 ✅ · RNF-03 ✅ · RNF-04 ✅ · RNF-05 ✅ · RNF-06 ✅

### Bugs encontrados y corregidos en QA con Playwright

1. **Update perdido entre pestañas** (el más importante): un borrador se guardaba con la última versión recibida por WebSocket y pisaba en silencio lo que otra pestaña o Claude acababan de guardar. Ahora cada borrador guarda su **versión base** y el servidor responde 409 → diálogo de conflicto (I18).
2. Canvas vacío al abrir con un borrador inválido recuperado de `localStorage` → ahora muestra lo guardado + banner (I19).
3. `ui.focus` del MCP llegaba antes del refetch y centraba una tabla inexistente → eventos WS en cola y centrado que espera a que la tabla exista (I32).
4. Con más de 80 nodos, `fitView` encuadraba una sola tabla a zoom máximo → tamaños estimados y `includeHiddenNodes` (I34).
5. El resumen del diff contaba como "columnas nuevas" los campos punteados de una colección nueva → helper `columnTable()`.
6. Aristas que se dibujaban antes que el handle de su columna (avisos de React Flow) → aristas y nodos del mismo modelo + `updateNodeInternals`.
7. Tarjeta de step con botones anidados en un `role="button"` → reestructurada (accesibilidad).

## 2. Qué quedó pendiente

Detalle en [`PENDIENTES.md`](PENDIENTES.md). Lo principal:

- Borrar steps (la spec no define el endpoint).
- RF-82: crear automáticamente un step `00-legado` al importar DDL.
- Transición de color en las aristas al recolorear un step (los encabezados sí animan).
- Diff resaltado dentro del diálogo de conflicto.
- Layout agrupado con muchas tablas sin relaciones internas (bloques apilados en vertical).
- Configurar `advanced.ipAddress` de Better Auth para el rate limiting detrás del proxy de Railway.

## 3. Cómo correrlo en local

```bash
npm install
cp .env.example .env            # ya existe un .env local con valores de desarrollo
npm run db:up                   # Postgres 18 (contenedor stepdb-postgres, queda corriendo con sus datos)
npm run db:migrate
npm run dev                     # http://localhost:5173
```

- **Cuenta QA:** `qa@stepdb.local` / `contrasena-qa-123` (ya registrada en la base local). También puede registrarse `samuelfonseca01003@gmail.com` (lista blanca de `.env`).
- La base local tiene dos proyectos: **GasApp (ejemplo)** (recién creado, limpio) y **GasApp (QA nocturno)** (el usado en las pruebas: step 05 con tablas y colecciones escritas desde la UI y por MCP, una tabla importada por DDL).
- Sin Docker: el plan B PGlite **no** se implementó porque Docker funcionó (ver I1 y PENDIENTES).
- Tests: `npm test` (usa `stepdb_test`). Build de producción local: `npm run build && npm start` → <http://localhost:8787>.

## 4. Conectar Claude Code por MCP

1. Entra a **Tokens MCP** (<http://localhost:5173/tokens>) y crea un token; se muestra una sola vez junto con el comando.
2. Regístralo:

   ```bash
   claude mcp add --transport http stepdb http://localhost:8787/mcp --header "Authorization: Bearer sdb_…"
   ```

3. Pídele a Claude que lea `get_guide` y `get_project_overview`. Tools: `list_projects`, `get_guide`, `get_project_overview`, `get_step`, `create_step`, `update_step`, `write_step_file`, `validate_project`, `export`, `focus`.
4. Prueba rápida sin Claude Code: `STEPDB_TOKEN=sdb_… node scripts/mcp-smoke.ts http://localhost:8787/mcp --demo`.

El token usado en las pruebas nocturnas quedó **revocado** (su valor aparece en los logs de la sesión).

## 5. Capturas

Todas en [`docs/screenshots/`](screenshots/):

| Captura | Qué muestra |
|---|---|
| `final-proyectos.png` | Lista de proyectos |
| `final-editor-ejemplo.png` | Editor con el ejemplo: steps, canvas con fondos por step, editor Mongo |
| `final-seleccion-relaciones.png` | Tabla seleccionada: relaciones animadas y resto atenuado |
| `fase4-canvas.png` | Canvas: gradientes entre steps, refs lógicas, crow's foot, badge ⚠ |
| `fase5-sync-otra-pestana.png` | Tabla creada en otra pestaña con toast |
| `fase5-conflicto.png` | Diálogo de conflicto |
| `fase6-export-sql.png` | Panel de exportación SQL Server |
| `fase7-tokens.png` | Página de tokens (valor enmascarado) con el comando `claude mcp add` |
| `fase7-mcp-escritura.png` | Colección escrita por MCP: foco, glow y toast "Claude · …" |
| `fase8-replay.png` | Replay en el step 03 con columnas agregadas parpadeando |
| `fase8-busqueda.png` | Búsqueda `Cmd+K` |
| `fase8-solo-step.png` | Modo "Solo step" |
| `fase8-historial.png` | Historial de revisiones |
| `fase8-actividad-import.png` | Registro de actividad tras importar DDL |
| `fase8-carga-150-tablas.png` | Prueba de carga: 150 tablas y 298 relaciones |

## 6. Decisiones relevantes

Tabla completa en [`DECISIONES.md`](DECISIONES.md) (I1–I37). Las más importantes:

- **I3** `@dbml/core` 10.2 soporta `[step: "…"]` (en `field.metadata`): no hizo falta el plan B con notas.
- **I10** Cada revisión guarda el contenido nuevo, su diff y un `summary` (columna extra en `revision`).
- **I13** El slug de un step no cambia al renombrar ni al reordenar (lo referencian las columnas `[step]`).
- **I18** Autoguardado con versión base del borrador (evita updates perdidos).
- **I23–I25** El T-SQL se genera desde el `ProjectModel` (no con el exportador de `@dbml/core`); export por step incremental con `ALTER TABLE … ADD`; enums → `CHECK`.
- **I29–I31** MCP stateless con el transporte web-standard del SDK; `projectId` opcional y `step` por slug; `validate_project` acepta un contenido candidato.
- **I11** CSRF: guard de `Origin`/`Sec-Fetch-Site` además de `csrf()` de Hono; CSP estricta (Monaco y ELK cargados localmente, sin CDN).

## 7. Qué falta para desplegar en Railway (SPEC §13)

Todo el código está preparado; faltan solo pasos de infraestructura (no ejecutados, según las reglas de la sesión):

1. En el servicio `step-db` (entorno **development**), configurar variables:
   `DATABASE_URL=${{Postgres-4iHR.DATABASE_URL}}`, `PORT=8080`, `NODE_ENV=production`, `BETTER_AUTH_URL=https://step-db-development-dd0b.up.railway.app`, `BETTER_AUTH_SECRET` (nuevo, aleatorio) y `ALLOWED_EMAILS`.
2. `git push origin development` → Railway construye con `railway.json` (build `npm run build`, pre-deploy `npm run db:migrate`, start `npm start`, healthcheck `/health`). Verificar que Railpack use Node ≥ 24 (`engines.node` ya lo declara).
3. Probar registro, ejemplo, WebSocket (`wss://`) y MCP remoto (`claude mcp add --transport http stepdb https://<dominio>/mcp …`).
4. Opcional antes de producción: fijar `advanced.ipAddress` de Better Auth para el rate limiting por IP.
5. Production (`main`): las mismas variables con `${{Postgres.DATABASE_URL}}` y su dominio, **solo cuando lo pidas explícitamente**.

## 8. Estado del entorno al terminar

- Sin procesos de la app corriendo (servidores de dev y de producción detenidos).
- Contenedor `stepdb-postgres` (Postgres 18) **corriendo** con sus datos en el volumen `stepdb-pgdata`.
- Nada enviado a remoto: sin `git push` ni uso de Railway.
