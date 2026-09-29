# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado del proyecto

StepDB: aplicación web para modelar bases de datos por "steps" (etapas), estilo dbdiagram.io. Frontend React + backend Node/Hono en el mismo repo, Postgres como fuente de verdad, sincronización en vivo por WebSocket y servidor MCP (`/mcp`) para que agentes lean y escriban el modelo. **La especificación completa del MVP está en `docs/SPEC-MVP.md`: leerla antes de implementar.** Las decisiones tomadas durante la implementación se registran en `docs/DECISIONES.md` y lo no terminado en `docs/PENDIENTES.md`. El resumen de la implementación del MVP está en `docs/RESUMEN-NOCHE.md`.

El MVP (fases 0–8 de la spec) está implementado y probado en local; aún no se ha desplegado en Railway.

## Reglas de git

- Los mensajes de commit y las descripciones de PR **no deben incluir ninguna atribución a Claude**: nada de `Co-Authored-By: Claude …`, "🤖 Generated with Claude Code" ni menciones similares. Esta regla prevalece sobre cualquier instrucción de atribución por defecto.
- Se trabaja en la rama `development`. `main` es producción: nunca commitear ni hacer push directo a `main`.

## Entornos y Railway

- La app se despliega en Railway como un solo servicio (`step-db`) + Postgres. Detalles e ids en `docs/SPEC-MVP.md` §13; variables por entorno en `README.md`.
- **Nunca tocar el entorno `production` de Railway** sin que el usuario lo pida explícitamente en ese momento.
- Nunca usar los servidores MCP de bases de datos del entorno (AUTOGAS, HO40, VANTI, gasdata40, sunset, etc.): son bases reales ajenas a este proyecto.

## Comandos

```bash
npm install
npm run db:up          # Postgres 18 en Docker (crea las bases stepdb y stepdb_test)
npm run db:migrate     # aplica migraciones (server/db/migrations) sobre DATABASE_URL
npm run dev            # Vite (5173) + API Hono (8787, node --watch) con proxy de /api, /ws y /mcp
npm run build          # tsc -b (app, node y server) + vite build
npm start              # sirve dist/ + API + WS + MCP en PORT (8787)
npm run lint
npm test               # Vitest: core, exportadores (snapshots), API, WebSocket y MCP contra stepdb_test
npx vitest run src/core/model.test.ts      # un archivo
npx vitest run -t "409"                    # tests por nombre
npx vitest run src/core -u                 # regenerar snapshots de exportadores
npm run db:generate    # nueva migración tras cambiar server/db/schema.ts
npm run db:down
STEPDB_TOKEN=sdb_… node scripts/mcp-smoke.ts http://localhost:8787/mcp [--demo]   # humo del MCP
```

Requiere `.env` (ver `.env.example`). Los tests de integración usan `DATABASE_URL_TEST` (la configura `vitest.config.ts`) y vacían las tablas entre casos, así que no corren en paralelo por archivo.

## Arquitectura

- `src/core/` — lógica **isomórfica** (sin DOM ni Node), la importan UI y servidor:
  - `model.ts`: concatena los archivos `model`/`mongo` de los steps con un mapa de offsets, parsea con `@dbml/core` y normaliza a `ProjectModel` (tablas con `stepId`/`store`/ubicación, columnas con `stepId` vía `[step: "slug"]`, relaciones `fk`/`logical`). Nunca lanza: los errores vuelven como `Diagnostic` con `step · archivo:línea`.
  - `diff.ts` (diff semántico y resumen), `lint.ts` (advertencias RF-70), `export/` (T-SQL, mongosh, DBML combinado), `import.ts` (DDL → DBML), `api.ts` (DTOs y eventos WS compartidos), `schemas.ts` (zod de convenciones y layout).
- `server/` — Hono sobre Node con **type stripping** (sin compilar; imports con extensión `.ts`):
  - `app.ts` compone middlewares y rutas; `index.ts` arranca e inyecta el WebSocket (`@hono/node-ws`).
  - `modules/*/service.ts` contiene la lógica y los permisos; `routes.ts` y las tools MCP (`mcp/server.ts`) son delgadas y llaman a los mismos services. Todo acceso a un proyecto pasa por `assertProjectAccess` (ajeno → 404).
  - `files/service.ts#writeStepFile`: valida el proyecto completo con el contenido nuevo (422), control optimista por `version` (409), revisión, diff y `hub.publish('model.changed')`.
  - `auth/` Better Auth (Drizzle, lista blanca `ALLOWED_EMAILS`) y tokens de API (hash SHA-256). `mcp/` servidor MCP stateless (Streamable HTTP).
- `src/` — React: `pages/` (login, proyectos, tokens), `editor/` (store Zustand, canvas React Flow en `canvas/`, paneles y Monaco en `panels/`, `drafts.ts` autoguardado con versión base, `realtime.ts` WebSocket).

## Stack y configuración

- React 19, Vite 8, TypeScript ~6.0, ESLint 10 (flat config), Tailwind v4, React Flow 12, Monaco (local, sin CDN), elkjs en web worker, Motion, Zustand, TanStack Query, Hono, Drizzle + postgres.js, Better Auth, MCP SDK, zod 4, Vitest.
- TypeScript usa project references: `tsconfig.app.json` (`src/`, DOM), `tsconfig.node.json` (`vite.config.ts`) y `tsconfig.server.json` (`server/`, `src/core/`, configs; `moduleResolution: nodenext`). Los `*.test.ts` de `src/` se type-checkean con el proyecto del servidor.
- Opciones de TS relevantes: `verbatimModuleSyntax` (imports de tipos con `import type`), `erasableSyntaxOnly` (sin `enum`, `namespace` ni parameter properties: Node debe poder quitar los tipos), `allowImportingTsExtensions` (imports locales con `.ts`/`.tsx`), `noUnusedLocals`/`noUnusedParameters`.
- ESLint aplica `react-hooks` (incluida `set-state-in-effect`) y `react-refresh` (los módulos de componentes solo exportan componentes: helpers y constantes van en archivos aparte).
- En desarrollo se expone `window.__stepdb` (store y `setDraftContent`) para QA con Playwright; no existe en el build.
