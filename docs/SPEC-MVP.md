# StepDB — Especificación del MVP

> Documento de requerimientos para construir el MVP de forma autónoma (sesión nocturna de Claude Code).
> Fecha: 2026-09-28 · Autor: Samuel Fonseca · Estado: listo para implementar.
>
> **Alcance de la sesión nocturna: 100 % local.** La arquitectura queda preparada para Railway (sección 13), pero esta noche **no se despliega, no se hace push y no se usa el MCP de Railway**. Ver reglas en la sección 15.

---

## 1. Visión

StepDB es una aplicación web para modelar bases de datos **por steps** (etapas de trabajo), inspirada en [dbdiagram.io](https://dbdiagram.io). Se diferencia en tres cosas:

1. **Steps como ciudadanos de primera clase.** El modelo no se diseña de una sentada: se construye por etapas ("01 Recepción de ventas", "02 Terceros", "03 Facturación"…). Cada step tiene fecha, color, descripción y notas de decisiones. Las tablas creadas en un step llevan su color, y las relaciones entre steps se ven como la "mezcla" de los dos colores.
2. **Pensado para trabajar con un agente.** StepDB expone un **servidor MCP**. Claude Code (o cualquier agente) lee y escribe el modelo por MCP con validación, y la página **se actualiza al instante** animando lo que cambió.
3. **Multi-almacenamiento.** Además de SQL Server, permite modelar **colecciones de MongoDB** (p. ej. logs de integración) y ver cómo se relacionan con las tablas SQL mediante referencias lógicas.

Todo esto con una experiencia visual **divertida y didáctica**: fondo blanco, colores por step, animaciones al crear o cambiar tablas, relaciones animadas y un modo "replay" que reconstruye el modelo step por step.

**Caso de uso principal:** rediseñar desde cero el modelo de datos de GasApp (plataforma de ventas de combustible), corrigiendo problemas del modelo actual: falta de normalización y uso de tablas SQL como logs, incluso para recuperar ventas o verificar envíos a servicios externos.

### 1.1 Flujo de trabajo objetivo

```
Samuel conversa con Claude sobre el step (convenciones, nombres, normalización)
        │
        ▼
Claude llama a la tool MCP write_step_file (DBML del step 02-facturacion)
        │
        ▼
Backend valida (parseo completo) → guarda en Postgres → publica el diff por WebSocket
        │
        ▼
La UI anima en el canvas lo nuevo o cambiado y muestra un toast
        │
        ▼
Samuel revisa, ajusta posiciones o pide cambios → repite
        │
        ▼
Exporta scripts SQL Server (por step o completo) y scripts MongoDB
```

### 1.2 Objetivos del MVP

- Modelar tablas, columnas, relaciones, índices y enums en DBML, organizados por steps y persistidos en **PostgreSQL**.
- Ver el diagrama en un canvas interactivo, con colores por step y relaciones columna a columna.
- Sincronización en vivo: cualquier cambio (UI, otra pestaña o MCP) se refleja y se anima en la UI.
- Login seguro (un dueño por proyecto) y tokens personales para el MCP.
- Exportar a SQL Server (tablas, FKs, índices, vistas) y a MongoDB (colecciones con validador e índices).
- Proyecto de ejemplo (demo GasApp reducida) creable desde la UI.
- Arquitectura lista para desplegarse en Railway como **un solo servicio** + Postgres.

### 1.3 No objetivos del MVP

- Colaboración en tiempo real de varias personas sobre el mismo proyecto. Cada proyecto tiene un dueño; el modelo de datos no impide agregar miembros después.
- Conectarse a la base de datos **modelada** (SQL Server o Mongo reales) para aplicar scripts o hacer ingeniería inversa en vivo.
- Migraciones incrementales del modelo (`ALTER TABLE` entre versiones). Solo se generan scripts de creación.
- Edición visual completa por formularios. El MVP es **code-first**, como dbdiagram; el canvas sirve para visualizar, posicionar y navegar.
- OAuth para el MCP (se usan tokens personales).

---

## 2. Conceptos del dominio

| Concepto | Definición |
|---|---|
| **Usuario** | Persona con cuenta. Solo pueden registrarse los correos de la lista blanca `ALLOWED_EMAILS`. |
| **Proyecto** | Un modelo de datos (p. ej. GasApp). Tiene dueño, convenciones, steps y layout del canvas. |
| **Step** | Etapa de trabajo con slug (`02-facturacion`), nombre, fecha, color, estado (`en_curso` \| `completado`), descripción y posición. Se ordenan cronológicamente. |
| **Archivo de step** | Contenido de texto de un step, por tipo: `model` (DBML SQL Server), `mongo` (DBML Mongo), `views` (SQL de vistas), `notes` (markdown). Se guarda en Postgres con número de versión. |
| **Step activo** | Step "en curso" seleccionado. Las tablas nuevas creadas desde la UI van a él, y el MCP lo usa por defecto. |
| **Tabla** | Tabla SQL Server definida en el archivo `model` de un step. Pertenece al step donde está definida. |
| **Colección** | Colección MongoDB definida en el archivo `mongo` de un step, siempre en el schema `mongo` (`Table mongo.log_integracion {…}`). |
| **Columna** | Pertenece al step de su tabla, salvo que tenga la propiedad `[step: "<slug>"]`, que indica que se agregó en un step posterior. |
| **Relación (Ref)** | Relación DBML entre columnas. Si cruza SQL↔Mongo es una **referencia lógica**: no se genera FK y se dibuja punteada. |
| **Vista** | Vista SQL Server en el archivo `views` del step, como SQL crudo, porque DBML no soporta vistas. |
| **Revisión** | Versión anterior de un archivo de step, guardada automáticamente en cada escritura. Es el historial. |
| **Token de API** | Credencial personal para que un agente use el MCP. Se guarda solo su hash; se puede revocar. |
| **Convenciones** | Reglas del proyecto (idioma, casing, singular/plural, patrón de PK/FK) en JSON + texto libre. Las lee el agente y las aplica el linter. |

---

## 3. Stack y decisiones técnicas

No reinventar la rueda: cada pieza pesada la resuelve una librería madura.

| Necesidad | Decisión | Por qué |
|---|---|---|
| Lenguaje del modelo | **DBML** (`@dbml/core`) | Lo usa dbdiagram, Claude lo conoce muy bien, trae parser y exportador a `mssql`. Soporta `headercolor`, `TableGroup [color]`, `TablePartial` y **propiedades personalizadas inline** (`[step: "02"]`). |
| Servidor | **Hono** sobre Node (`@hono/node-server`) | Liviano; trae `secureHeaders`, `csrf`, `bodyLimit` y `serveStatic`. Un solo proceso sirve UI, API, WebSocket y MCP. |
| TypeScript en el servidor | **Node ≥ 24 ejecuta `.ts` directamente** (type stripping), sin paso de compilación | El `tsconfig` ya usa `erasableSyntaxOnly` y `allowImportingTsExtensions`, que es lo que exige Node. Plan B: `tsx`. |
| Base de datos | **PostgreSQL 18** | Igual que el Postgres de Railway. |
| Acceso a datos | **Drizzle ORM** + **drizzle-kit** (migraciones SQL versionadas) con el driver `postgres` (postgres.js) | Liviano, tipado, migraciones legibles. |
| Auth web | **Better Auth** (email + contraseña) con adaptador de Drizzle y lista blanca `ALLOWED_EMAILS` | Sesiones en cookies seguras, rate limiting incluido, listo para crecer a más usuarios. |
| Auth MCP | **Tokens personales** (Bearer), guardados como hash SHA-256 | Simple, seguro y revocable. `claude mcp add ... --header "Authorization: Bearer ..."`. |
| MCP | **`@modelcontextprotocol/sdk`**, transporte **Streamable HTTP** en `/mcp` | Claude Code se conecta por HTTP. Al vivir en el mismo proceso, las tools usan los mismos servicios que la API. |
| Tiempo real | **WebSocket** en el mismo servidor (`@hono/node-ws` o `ws`), pub/sub en memoria | Una sola instancia; no hace falta Redis. |
| Canvas / diagrama | **React Flow** (`@xyflow/react`) | Nodos custom, handles por columna, edges custom, minimapa, zoom/pan. |
| Auto-layout | **elkjs** (algoritmo `layered`) en web worker | Buen layout para ERDs. |
| Animaciones | **Motion** (`motion`) + CSS/SVG | Springs y `layout` animations; `stroke-dashoffset` para edges. |
| Editor de código | **Monaco** (`@monaco-editor/react`) con gramática Monarch para DBML | Markers de error nativos. |
| Estado UI | **Zustand** | Mínimo boilerplate. |
| Datos del servidor en la UI | **TanStack Query** | Cache, refetch e invalidación al recibir eventos WS. |
| Estilos | **Tailwind CSS v4** (`@tailwindcss/vite`) | Rápido de iterar. |
| Validación | **zod** | Variables de entorno, cuerpos de la API e inputs de las tools MCP. |
| Tests | **Vitest** | Core, exportadores, API y MCP. |
| Desarrollo | `concurrently`: Vite (5173) + Hono (8787); Vite hace proxy de `/api`, `/ws` y `/mcp` | Un solo `npm run dev`. |

> **Antes de usar cada librería, consultar su documentación actual con context7.** Las versiones y APIs cambian. En particular hay que confirmar: que la versión publicada de `@dbml/core` soporta propiedades personalizadas inline y `TablePartial`; la integración de Better Auth con Hono y Drizzle; y el transporte Streamable HTTP del SDK de MCP.

---

## 4. Backend

### 4.1 Estructura

```
step-db/
├── src/                      ← frontend React
├── src/core/                 ← lógica COMPARTIDA front/back (TS puro, isomórfico):
│                               merge + parseo DBML, validación, linter, diff, exportadores
├── server/
│   ├── index.ts              ← arranque: crea la app, monta el WebSocket y escucha en PORT
│   ├── app.ts                ← compone middlewares y rutas (exportada para los tests)
│   ├── env.ts                ← valida variables de entorno con zod; si falta una, no arranca
│   ├── db/
│   │   ├── client.ts         ← conexión Postgres + instancia Drizzle
│   │   ├── schema.ts         ← tablas (sección 5)
│   │   └── migrations/       ← SQL generado por drizzle-kit (versionado en git)
│   ├── auth/
│   │   ├── better-auth.ts    ← configuración Better Auth + lista blanca
│   │   └── tokens.ts         ← crear, hashear, verificar y revocar tokens de API
│   ├── middleware/           ← requireUser (cookie), requireToken (Bearer), seguridad
│   ├── modules/
│   │   ├── projects/         ← routes.ts (HTTP) + service.ts (lógica)
│   │   ├── steps/
│   │   ├── files/            ← archivos de step, revisiones, control de concurrencia
│   │   └── export/
│   ├── realtime/hub.ts       ← suscripciones por proyecto y difusión de eventos
│   ├── mcp/server.ts         ← tools MCP (usan los mismos services)
│   └── seed/gasapp/          ← DBML del proyecto de ejemplo
├── drizzle.config.ts
├── docker-compose.yml        ← Postgres 18 local
├── railway.json              ← configuración de despliegue (sección 13)
└── .env.example
```

`tsconfig` necesita un proyecto para `server/` (entorno Node, sin DOM) y otro para `src/` (DOM). `src/core/` no puede usar APIs de DOM ni de Node, porque lo importan ambos.

### 4.2 Principios

1. **Rutas HTTP y tools MCP son delgadas.** Validan el input con zod, identifican al usuario y llaman a un `service.ts`. La lógica, los permisos y el guardado viven solo en los services, así que la UI y Claude se comportan igual.
2. **Todo acceso a un proyecto pasa por `assertProjectAccess(userId, projectId)`**. Si el proyecto no existe o no es del usuario, responde **404** (no 403, para no revelar que existe).
3. **Nunca se guarda un modelo que no parsea.** Antes de escribir un archivo `model` o `mongo`, el service arma el modelo completo del proyecto con el contenido nuevo y lo parsea con `src/core`. Si hay errores, responde con `archivo:línea` y no guarda. Excepción: el autoguardado de la UI (ver RF-22).
4. **Control de concurrencia optimista.** Cada archivo tiene `version`. Toda escritura envía la versión que leyó; si en la base hay otra, responde **409** con el contenido actual.
5. **Cada escritura exitosa** inserta una revisión, calcula el diff semántico y publica un evento en el hub.

### 4.3 Qué pasa cuando Claude guarda un cambio

```
Claude Code ──(MCP: write_step_file, Authorization: Bearer <token>)──► POST /mcp
  1. requireToken: hashea el token, lo busca en api_token (no revocado) → userId; actualiza last_used_at
  2. assertProjectAccess(userId, projectId)
  3. zod valida el input (contenido ≤ 1 MB)
  4. arma el modelo completo con el contenido nuevo y lo parsea con src/core
       └─ errores → responde { ok: false, errors: [{ file, line, message }] } y NO guarda
  5. transacción:
       UPDATE step_file SET content, version = version + 1 WHERE step_id AND kind AND version = <leída>
         └─ 0 filas → conflicto: responde el contenido y la versión actuales
       INSERT revision (contenido anterior, source = 'mcp', autor)
  6. diff entre modelo anterior y nuevo → hub.publish(projectId, { type: 'model.changed', source: 'mcp', diff })
  7. responde { ok: true, version, diff, warnings } (warnings = linter)
```

Si guardas desde el editor de la UI, el flujo es idéntico. Solo cambian el paso 1, porque te identifica la cookie de sesión, y el origen, que queda como `ui`.

---

## 5. Modelo de datos (Postgres)

Tablas de Better Auth (`user`, `session`, `account`, `verification`): las genera su CLI o se escriben en `schema.ts` según su documentación.

```
api_token
  id            uuid pk
  user_id       text fk → user.id (on delete cascade)
  name          text not null                 -- "Claude Code MacBook"
  token_hash    text not null unique          -- sha256 hex; el token en claro solo se muestra al crearlo
  prefix        text not null                 -- primeros 8 caracteres, para reconocerlo en la UI
  last_used_at  timestamptz
  created_at    timestamptz not null default now()
  revoked_at    timestamptz

project
  id              uuid pk
  owner_id        text not null fk → user.id (on delete cascade)
  name            text not null
  description     text
  conventions     jsonb not null default '{}'  -- ver 6.1
  conventions_md  text not null default ''     -- convenciones en prosa
  active_step_id  uuid null fk → step.id (on delete set null)
  layout          jsonb not null default '{"positions":{},"viewport":null}'
  created_at, updated_at  timestamptz

step
  id           uuid pk
  project_id   uuid not null fk → project.id (on delete cascade)
  slug         text not null                   -- "02-facturacion"
  position     int  not null                   -- orden cronológico
  name         text not null
  work_date    date not null
  color        text not null                   -- "#3E63DD"
  status       text not null check (status in ('en_curso','completado'))
  description  text
  created_at, updated_at  timestamptz
  unique (project_id, slug)
  index  (project_id, position)

step_file
  step_id     uuid not null fk → step.id (on delete cascade)
  kind        text not null check (kind in ('model','mongo','views','notes'))
  content     text not null default ''
  version     int  not null default 1
  updated_by  text fk → user.id
  updated_at  timestamptz not null default now()
  primary key (step_id, kind)

revision
  id          uuid pk
  step_id     uuid not null fk → step.id (on delete cascade)
  kind        text not null
  version     int  not null                    -- versión que tenía el contenido guardado aquí
  content     text not null
  source      text not null check (source in ('ui','mcp','api','seed'))
  author_id   text fk → user.id
  diff        jsonb                            -- resumen: tablas/columnas/relaciones +/-/~
  created_at  timestamptz not null default now()
  index (step_id, kind, created_at desc)
```

- Al crear un step se crean sus cuatro filas de `step_file` vacías.
- Las revisiones se conservan todas en el MVP. La depuración (p. ej. dejar las últimas 200 por archivo) va al backlog.

---

## 6. Contenido DBML

### 6.1 Convenciones del proyecto (`project.conventions`)

```json
{
  "language": "es",
  "case": "snake_case",
  "tableNames": "singular",
  "primaryKey": "id",
  "foreignKeyPattern": "{tabla}_id",
  "defaultSqlSchema": "dbo"
}
```

Se validan con zod. Si un step no tiene color, se asigna el siguiente de la paleta (sección 10.1).

### 6.2 Cómo se construye el modelo combinado (`src/core`)

1. Tomar los archivos `model` y `mongo` de cada step, en orden de `position`.
2. **Concatenarlos** en un solo texto DBML, porque las `Ref` cruzan steps y el parser necesita verlo todo. Mientras tanto, construir un **mapa de offsets** (línea global → step + tipo de archivo + línea local) para traducir errores de parseo a la ubicación correcta.
3. Parsear con `@dbml/core` y normalizar a un modelo interno (`ProjectModel`), en el que cada tabla y columna queda anotada con:
   - `stepId`: el de su archivo o, para columnas, el valor de la propiedad `step` si existe.
   - `store`: `"sqlserver"` \| `"mongo"`. Una tabla es Mongo si y solo si su schema es `mongo`. El validador exige que todo lo del archivo `mongo` esté en ese schema y que nada del archivo `model` lo esté.
   - Ubicación de origen (step, tipo de archivo, rango de líneas), para "ir a la definición" desde el canvas.
4. Clasificar las relaciones en `fk` (SQL↔SQL) o `logical` (cruza stores o Mongo↔Mongo).

El mismo código corre en el navegador (feedback del editor mientras se escribe) y en el servidor (validación antes de guardar).

### 6.3 Convenciones DBML propias

```dbml
// step 02-facturacion · archivo model
Table facturacion.factura [note: 'Factura electrónica emitida por venta'] {
  id bigint [pk, increment]
  venta_id bigint [not null, ref: > ventas.venta.id]
  numero varchar(30) [not null, unique]
  fecha_emision datetime2 [not null]
  total decimal(18,2) [not null]

  indexes {
    (venta_id) [name: 'ix_factura_venta']
  }
}
```

```dbml
// step 01-recepcion-ventas · archivo model (fragmento)
// Columna agregada en el step 02 a una tabla del step 01:
Table ventas.venta {
  id bigint [pk, increment]
  // ...
  facturada bit [not null, default: 0, step: "02-facturacion"]
}
```

```dbml
// step 04-log-integraciones · archivo mongo
Table mongo.log_envio_venta [note: 'Trazabilidad de envíos de ventas a servicios externos'] {
  _id objectId [pk]
  venta_id long [not null]
  servicio string [not null]
  estado string [not null, note: 'pendiente | enviado | error']
  "respuesta.codigo" int
  "respuesta.mensaje" string
  intentos int [not null, default: 0]
  creado_en date [not null]

  indexes {
    (venta_id, servicio)
  }
}

Ref: mongo.log_envio_venta.venta_id > ventas.venta.id   // referencia lógica SQL↔Mongo
```

- **Campos embebidos en Mongo**: notación punteada entre comillas (`"respuesta.codigo"`). La UI los muestra anidados e indentados bajo `respuesta`.
- **Tipos Mongo permitidos**: `objectId`, `string`, `int`, `long`, `double`, `decimal`, `bool`, `date`, `object`, `array`, `array<tipo>`.
- **Plan B** si `@dbml/core` no soporta propiedades personalizadas en columnas: usar la nota con prefijo `[note: '@step:02-facturacion …']` y extraerla en la normalización. Registrar la decisión en `docs/DECISIONES.md`.

### 6.4 Layout (`project.layout`)

```json
{
  "positions": { "ventas.venta": { "x": 120, "y": 80 }, "mongo.log_envio_venta": { "x": 900, "y": 340 } },
  "viewport": { "x": 0, "y": 0, "zoom": 0.9 }
}
```

- La clave es `schema.tabla`. La UI lo guarda con debounce al mover nodos.
- Si una tabla nueva no tiene posición, se ubica automáticamente cerca de las tablas de su step **sin mover las demás**.

---

## 7. API, tiempo real y MCP

### 7.1 API REST

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| * | `/api/auth/*` | Registro, login, logout, sesión (Better Auth) | — |
| GET | `/api/projects` | Proyectos del usuario | cookie |
| POST | `/api/projects` | Crear proyecto (con un primer step vacío) | cookie |
| POST | `/api/projects/example` | Crear el proyecto demo GasApp para el usuario | cookie |
| GET | `/api/projects/:id` | Proyecto completo: metadatos, steps, archivos con versión, layout | cookie |
| PATCH | `/api/projects/:id` | Nombre, descripción, convenciones, step activo | cookie |
| DELETE | `/api/projects/:id` | Borrar proyecto (pide confirmación en la UI) | cookie |
| POST | `/api/projects/:id/steps` | Crear step | cookie |
| PATCH | `/api/steps/:id` | Editar metadatos del step | cookie |
| PUT | `/api/projects/:id/steps/order` | Reordenar steps | cookie |
| PUT | `/api/steps/:id/files/:kind` | Guardar archivo; body `{ content, version }` → 200 \| 409 \| 422 | cookie |
| GET | `/api/steps/:id/files/:kind/revisions` | Historial del archivo | cookie |
| PUT | `/api/projects/:id/layout` | Posiciones y viewport | cookie |
| GET | `/api/projects/:id/export/:target` | `mssql` \| `mongo` \| `dbml`; query `step?`, `idempotent?` | cookie |
| GET / POST / DELETE | `/api/tokens` | Listar, crear (devuelve el token en claro una sola vez) y revocar | cookie |
| GET | `/health` | `{ status, db }`; 200 si la base responde, 503 si no | pública |

### 7.2 WebSocket (`/ws?project=:id`)

- Requiere sesión (cookie) y acceso al proyecto; si no, cierra la conexión.
- Eventos servidor → cliente:
  - `model.changed` `{ stepId, kind, version, source, diff, author }`
  - `project.changed` (metadatos, steps, orden, step activo)
  - `layout.changed`
  - `ui.focus` `{ table? , stepId? }`, emitido por la tool MCP `focus`
- La UI ignora el eco de sus propias escrituras (cada escritura lleva un `clientId` que viaja en el evento) para no animar dos veces.
- Reconexión automática con backoff; al reconectar, refetch del proyecto.

### 7.3 MCP (`/mcp`)

Streamable HTTP. Autenticación con `Authorization: Bearer <token>`; sin token válido responde 401. Todas las tools validan inputs con zod y operan solo sobre proyectos del dueño del token.

| Tool | Descripción |
|---|---|
| `list_projects` | Proyectos del usuario. |
| `get_guide` | Guía de uso para el agente: formato de StepDB, convenciones DBML propias (6.3), cómo agregar columnas a tablas de otro step, cómo modelar Mongo y el flujo recomendado. Es lo primero que debe leer un agente. |
| `get_project_overview` | Nombre, convenciones, steps (con step activo) y, por step, sus tablas y colecciones con columnas en formato compacto. |
| `get_step` | Contenido y versión de los cuatro archivos de un step. |
| `create_step` | Crea un step (`name`, `description`, `date?`, `color?`) y lo deja activo. |
| `update_step` | Edita metadatos de un step. |
| `write_step_file` | Escribe `model` \| `mongo` \| `views` \| `notes` con la `version` leída. Valida el proyecto completo antes de guardar; si hay errores **rechaza** con `archivo:línea`. Devuelve versión nueva, diff y advertencias del linter. |
| `validate_project` | Errores y advertencias del linter, sin guardar nada. |
| `export` | `target` = `mssql` \| `mongo` \| `dbml`; `step?`. |
| `focus` | Pide a la UI centrar y resaltar una tabla o un step. |

Conexión desde Claude Code (local):

```bash
claude mcp add --transport http stepdb http://localhost:8787/mcp --header "Authorization: Bearer <token>"
```

---

## 8. Seguridad

"Liviano pero seguro": todo esto va en el MVP.

- **Contraseñas y sesiones:** Better Auth, con cookies `HttpOnly`, `SameSite=Lax` y `Secure` en producción. Rate limiting de login activo.
- **Registro restringido:** solo pueden registrarse correos de `ALLOWED_EMAILS` (hook de creación de usuario que rechaza el resto). La UI de registro muestra un error claro si el correo no está permitido.
- **Tokens de API:** 32 bytes aleatorios (`crypto.randomBytes`), prefijo `sdb_`. En la base solo va el hash SHA-256. El token en claro se muestra una única vez. Revocables. Se actualiza `last_used_at`.
- **Autorización:** toda consulta filtra por dueño (`assertProjectAccess`); los ids ajenos responden 404.
- **Entrada:** zod en todos los endpoints y tools; `bodyLimit` global (2 MB) y límite de 1 MB por archivo de step.
- **Headers y CSRF:** `secureHeaders` de Hono (CSP compatible con Monaco y React Flow), `csrf` en rutas con cookie que modifican datos, CORS solo para el mismo origen.
- **Secretos:** solo en variables de entorno (`.env` local, ignorado por git). Se incluye `.env.example` sin valores reales. Nunca se registran tokens, contraseñas ni `DATABASE_URL` en logs.
- **Errores:** respuestas genéricas al cliente (sin stack traces); el detalle va al log del servidor.
- **SQL:** solo a través de Drizzle (consultas parametrizadas); nada de SQL armado con strings.

---

## 9. Requerimientos funcionales

Prioridad: **P0** = imprescindible para el MVP · **P1** = importante, hacerlo si alcanza · **P2** = deseable.

### 9.1 Cuenta y proyectos

- **RF-01 (P0)** Pantallas de registro e inicio de sesión (correo + contraseña), cierre de sesión y redirección a login si no hay sesión.
- **RF-02 (P0)** Lista de proyectos del usuario: crear proyecto, abrir, renombrar y borrar (con confirmación). Botón "Crear proyecto de ejemplo" que crea la demo GasApp.
- **RF-03 (P0)** Página de tokens de API: crear (con nombre; muestra el token una sola vez con botón copiar y el comando `claude mcp add` ya armado), listar (nombre, prefijo, último uso) y revocar.

### 9.2 Steps

- **RF-10 (P0)** Panel de steps (izquierda) en forma de **línea de tiempo vertical**. Cada tarjeta muestra número, nombre, fecha, color, estado, cantidad de tablas y colecciones, y descripción corta.
- **RF-11 (P0)** Crear step desde la UI: nombre, fecha (hoy por defecto), color (siguiente de la paleta, editable) y descripción. El slug se genera como `NN-slug-del-nombre`.
- **RF-12 (P0)** Editar nombre, fecha, color, estado y descripción de un step. Cambiar el color recolorea tablas y relaciones con animación.
- **RF-13 (P0)** Marcar un step como **activo**, indicado con un pulso sutil en su tarjeta.
- **RF-14 (P1)** Reordenar steps con drag & drop.
- **RF-15 (P0)** Modos de enfoque al hacer clic en un step:
  - **Todos**: todo a color.
  - **Solo step**: el step elegido a color y el resto atenuado al ~20 % de opacidad y en escala de grises.
  - **Step + dependencias**: el step, más las tablas de otros steps con las que se relaciona.
- **RF-16 (P1)** Mostrar en cada step las columnas que agregó a tablas de otros steps.

### 9.3 Canvas

- **RF-20 (P0)** Nodo tabla:
  - Encabezado con el color del step, nombre `schema.tabla` y badge con el número del step.
  - Una fila por columna con nombre, tipo e íconos (PK 🔑, FK, `not null`, `unique`).
  - Nota de la tabla como tooltip.
  - Columnas agregadas en otro step con un punto del color de ese step.
- **RF-21 (P0)** Nodo colección Mongo con estilo distinto: ícono de hoja, borde punteado y esquinas más redondeadas. Los campos embebidos se muestran indentados.
- **RF-22 (P0)** Relaciones **columna a columna**: un handle por columna, a izquierda y derecha, eligiendo el lado más cercano. Marcadores de cardinalidad **crow's foot** (1, N, 0..1) según el tipo de `Ref` (`>`, `<`, `-`, `<>`).
- **RF-23 (P0)** Color de relaciones:
  - Entre tablas del mismo step: color del step.
  - Entre steps distintos: **gradiente lineal** del color de un step al del otro ("los colores se juntan").
  - Referencias lógicas SQL↔Mongo: línea punteada con la etiqueta "ref. lógica".
- **RF-24 (P0)** Hover sobre una relación: resaltarla y resaltar ambas columnas. Seleccionar una tabla: sus relaciones se animan con un flujo de "hormiguitas" y se atenúa el resto.
- **RF-25 (P0)** Arrastrar tablas y persistir posiciones. Zoom, pan, `fitView`, minimapa coloreado por step y fondo blanco con cuadrícula de puntos sutil.
- **RF-26 (P0)** Botón **Auto-organizar** con elkjs `layered` y transición animada a las nuevas posiciones. Opción para agrupar por step.
- **RF-27 (P1)** Doble clic en una tabla abre su archivo en el editor y hace scroll a su definición.
- **RF-28 (P1)** Búsqueda rápida con `Ctrl/Cmd+K`: buscar tabla o columna, centrar el canvas y resaltarla.
- **RF-29 (P2)** Fondos por step: un "hull" suave del color del step detrás de sus tablas, activable desde la UI.

### 9.4 Editor

- **RF-30 (P0)** Panel derecho con pestañas **DBML** (`model`/`mongo` del step activo o seleccionado), **Vistas**, **Notas**, **SQL Server** y **Mongo**. Las dos últimas muestran lo exportado y son de solo lectura.
- **RF-31 (P0)** Resaltado de sintaxis DBML (gramática Monarch). Los errores de parseo aparecen como markers en la línea correcta del archivo correcto, calculados en el navegador mientras se escribe.
- **RF-32 (P0)** Autoguardado con debounce (~800 ms) **solo cuando el modelo completo parsea**. Mientras haya errores, el canvas **conserva el último modelo válido**, se muestra un banner con `step · archivo:línea` y el borrador queda en el editor (y en `localStorage` como respaldo). Nunca se pierde lo escrito ni queda el canvas en blanco.
- **RF-33 (P0)** Conflicto: si el guardado responde 409 (Claude u otra pestaña guardó antes), mostrar un diálogo "Mantener lo mío" (reintenta con la versión nueva) o "Tomar lo guardado".
- **RF-34 (P1)** Botón "Nueva tabla" que inserta una plantilla que respeta las convenciones en el archivo del step activo y la enfoca en el canvas.
- **RF-35 (P1)** Historial del archivo: lista de revisiones (fecha, origen, resumen del diff) con vista previa y "restaurar" (que crea una revisión nueva, no borra).

### 9.5 Sincronización en vivo y feedback de cambios

- **RF-40 (P0)** Cualquier cambio guardado (UI en otra pestaña, MCP) se refleja en la UI en menos de 1 s sin recargar la página.
- **RF-41 (P0)** **Diff semántico** entre el modelo anterior y el nuevo (tablas, columnas y relaciones agregadas, eliminadas o modificadas; la identidad es `schema.tabla` + nombre de columna), con animaciones:
  - Tabla nueva: aparece con spring (escala + fade) y un "glow" del color del step por unos 2 s.
  - Columna nueva o modificada: la fila parpadea en amarillo suave.
  - Relación nueva: el trazo se "dibuja" (animación de `stroke-dashoffset`).
  - Eliminaciones: fade-out antes de desaparecer.
- **RF-42 (P0)** Toast resumen del cambio externo, p. ej. "Claude · 02-facturacion: +2 tablas, +5 columnas, +3 relaciones". Clic en el toast centra el canvas en lo que cambió.
- **RF-43 (P1)** Registro de actividad (panel colapsable): últimos N cambios con hora, origen y resumen, a partir de la tabla `revision`.

### 9.6 Exportación SQL Server

- **RF-50 (P0)** Generar T-SQL de SQL Server a partir de las tablas (sin colecciones Mongo), usando el exportador `mssql` de `@dbml/core` sobre el modelo filtrado y post-procesando el resultado:
  - `CREATE SCHEMA` para cada schema distinto de `dbo`, en un bloque `IF NOT EXISTS`.
  - Tablas en orden de step; FKs **después** de todas las tablas; luego índices; al final las vistas en orden de step.
  - Separadores `GO` entre lotes.
  - Encabezado por step, como comentario, con nombre, fecha y descripción.
  - Excluir las `Ref` que involucren colecciones Mongo.
- **RF-51 (P0)** Exportar **por step** (solo los objetos de ese step, más las FKs hacia steps anteriores) o **completo**. Copiar al portapapeles y descargar `.sql`.
- **RF-52 (P1)** Opción "idempotente": envolver cada `CREATE TABLE` en `IF OBJECT_ID(...) IS NULL`.
- **RF-53 (P0)** Tests con snapshots del SQL generado para el proyecto de ejemplo.

### 9.7 MongoDB

- **RF-60 (P0)** Exportar un script `mongosh` que incluya:
  - `db.createCollection(nombre, { validator: { $jsonSchema: … } })`, con `bsonType` mapeado desde los tipos y `required` desde `not null`. Los campos punteados se convierten en objetos anidados.
  - `createIndex` por cada índice (`unique` si aplica).
  - Comentarios con las referencias lógicas hacia SQL.
- **RF-61 (P0)** En el canvas y en el export, cada referencia lógica SQL↔Mongo lleva una nota explicativa: "No hay FK; la consistencia la garantiza la aplicación. Indexar `<campo>` en Mongo".

### 9.8 Linter de modelo (advertencias, no bloquean)

- **RF-70 (P1)** Reglas iniciales:
  1. Tabla sin PK.
  2. Nombre de tabla o columna que no cumple `conventions.case`.
  3. Columna que cumple `foreignKeyPattern` pero no tiene `Ref`.
  4. Columna FK sin índice (SQL).
  5. Referencia lógica sin índice en Mongo.
  6. Tabla SQL con nombre que sugiere log (`log`, `bitacora`, `auditoria`, `historial`): sugerir evaluar si va en Mongo. Es un guiño al problema actual de GasUp.
- **RF-71 (P1)** Las advertencias se muestran como badge ⚠ en el nodo y en una lista del panel derecho.

### 9.9 Importación y exportación de proyecto

- **RF-80 (P1)** "Importar DBML": pegar DBML (p. ej. exportado de dbdiagram) y agregarlo al archivo `model` del step activo.
- **RF-81 (P1)** Exportar "DBML combinado" compatible con dbdiagram.io: un solo archivo con `TableGroup` por step (con `color`) y `headercolor` en cada tabla.
- **RF-82 (P2)** "Importar SQL Server DDL" usando el importador `mssql` de `@dbml/core`, para traer tablas del modelo actual como referencia en un step "00-legado".

### 9.10 Modo replay

- **RF-90 (P1)** Botón ▶ **Replay**: reconstruye el diagrama step por step en orden cronológico. En cada step, sus tablas aparecen con animación, se dibujan sus relaciones, la cámara hace `fitView` sobre ese step y un rótulo muestra "Step 02 · Facturación · 29 sep". Controles: pausa, siguiente, velocidad.

---

## 10. Experiencia visual

El objetivo explícito es que modelar sea **entretenido**: nada gris ni uniforme, pero legible.

### 10.1 Paleta de steps

12 colores vivos y distinguibles entre sí, asignados en orden:

`#E5484D` rojo · `#3E63DD` azul · `#30A46C` verde · `#F76B15` naranja · `#8E4EC6` violeta · `#12A594` teal · `#D6409F` rosa · `#FFC53D` ámbar · `#0090FF` celeste · `#AD7F58` bronce · `#46A758` hierba · `#E54666` carmesí

- Encabezado de tabla: color sólido con texto de contraste automático (blanco o negro según luminancia).
- Cuerpo de la tabla: tinte muy suave (~6 %) del color del step.

### 10.2 Principios

- **Fondo blanco** con cuadrícula de puntos gris muy tenue. Tipografía sans para la UI y monoespaciada para tipos de columna.
- **Movimiento con propósito**: cada animación comunica algo (nuevo, cambiado, relacionado, enfocado). Duraciones de 150 a 400 ms y springs suaves. El glow de "nuevo" dura unos 2 s.
- **Micro-celebración** al marcar un step como completado: una ráfaga breve de partículas del color del step (P2).
- Respetar `prefers-reduced-motion`: sin animaciones de flujo ni partículas y transiciones instantáneas.
- Solo modo claro en el MVP. Las pantallas de login, proyectos y tokens siguen el mismo estilo, simples y limpias.

### 10.3 Layout del editor

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ StepDB · GasApp   [Todos|Solo step|+deps]  [Auto-organizar] [▶ Replay] [Exportar] [👤] │
├─────────────┬──────────────────────────────────────────────┬─────────────────┤
│ ● 01 Recep. │                                              │ DBML│Vistas│Notas│
│   28 sep ✓  │        canvas (React Flow, fondo blanco)     │ SQL │Mongo      │
│ ● 02 Factu. │                                              │                 │
│   29 sep ◉  │                                              │  Monaco editor  │
│ + Nuevo step│                                    [minimap] │  ⚠ advertencias │
└─────────────┴──────────────────────────────────────────────┴─────────────────┘
```

Los paneles laterales son colapsables y redimensionables.

---

## 11. Requerimientos no funcionales

- **RNF-01** Rendimiento: 150 tablas y 300 relaciones con pan y zoom fluidos (≥ 50 fps en un Mac M-series). `React.memo` en nodos, `onlyRenderVisibleElements` de React Flow si hace falta y layout ELK en un web worker.
- **RNF-02** Cambio guardado → UI de otra pestaña actualizada en menos de 1 s.
- **RNF-03** Robustez: un DBML inválido nunca rompe la UI ni se guarda sobre uno válido por error; lo escrito nunca se pierde.
- **RNF-04** Seguridad según la sección 8.
- **RNF-05** Calidad: `npm run build`, `npm run lint` y `npm test` en verde. TypeScript estricto según los `tsconfig` (ver `CLAUDE.md`).
- **RNF-06** Configuración por variables de entorno validadas al arrancar (sección 12.2).

---

## 12. Entorno local (el de la sesión nocturna)

### 12.1 Base de datos local

`docker-compose.yml` con **Postgres 18** (`postgres:18`), usuario/contraseña de desarrollo, puerto `5432` y volumen nombrado.

- `npm run db:up` levanta el contenedor; `npm run db:migrate` aplica migraciones.
- Base `stepdb` para desarrollo y base `stepdb_test` para tests (los tests la limpian con `TRUNCATE` entre casos o usan transacciones con rollback).
- **Si Docker no está disponible** (ver árbol de decisiones en 15.2): usar **PGlite** (`@electric-sql/pglite`, Postgres embebido) con el driver de Drizzle para PGlite, detrás de la misma fábrica de conexión (`DB_DRIVER=pglite`, datos en `.data/pglite`). Better Auth usa el mismo `db` de Drizzle, así que funciona igual.

### 12.2 Variables de entorno

| Variable | Local (`.env`) | Descripción |
|---|---|---|
| `DATABASE_URL` | `postgres://stepdb:stepdb@localhost:5432/stepdb` | Conexión a Postgres |
| `DATABASE_URL_TEST` | `postgres://stepdb:stepdb@localhost:5432/stepdb_test` | Base de tests |
| `DB_DRIVER` | `postgres` (o `pglite`) | Plan B sin Docker |
| `PORT` | `8787` | Puerto del servidor (en Railway: `8080`) |
| `BETTER_AUTH_SECRET` | aleatorio (`openssl rand -base64 32`) | Firma de sesiones |
| `BETTER_AUTH_URL` | `http://localhost:5173` | URL pública de la app |
| `ALLOWED_EMAILS` | `samuelfonseca01003@gmail.com,qa@stepdb.local` | Lista blanca separada por comas |

El agente crea `.env` local con valores de desarrollo (no es un secreto real) y `.env.example` con los nombres y ejemplos. `.env` ya está en `.gitignore`.

### 12.3 Scripts de `package.json`

| Script | Qué hace |
|---|---|
| `dev` | `concurrently` Vite (5173) + servidor con `node --watch server/index.ts` (8787) |
| `build` | `tsc -b` (front y server) + `vite build` |
| `start` | `node server/index.ts` (sirve `dist/` + API + WS + MCP) |
| `lint` | ESLint |
| `test` | Vitest |
| `db:up` / `db:down` | Docker Compose |
| `db:generate` | `drizzle-kit generate` |
| `db:migrate` | aplica migraciones |

---

## 13. Despliegue en Railway (preparado, **no se ejecuta esta noche**)

### 13.1 Infraestructura existente

| Recurso | development | production |
|---|---|---|
| Proyecto Railway | `delightful-blessing` (`e9522fea-a211-413d-a447-df13f32ceaa1`) | mismo |
| Environment id | `db62de60-dc6d-4e00-b745-7a128e27e265` | `3dab7039-e797-434b-be9b-09434c3e819a` |
| Servicio app | `step-db` (`a1b9e70a-5a20-46fb-af3c-b8045da83723`), rama `development` | mismo servicio, rama `main` |
| Postgres | `Postgres-4iHR` | `Postgres` |
| Dominio | `step-db-development-dd0b.up.railway.app` → puerto 8080 | `step-db-production.up.railway.app` → puerto 8080 |

### 13.2 Qué debe dejar listo la implementación

> **Nota (2026-09-29):** Railway dejó de leer `railway.json` en servicios nuevos. Esta configuración se aplicó en los ajustes del servicio y el archivo se eliminó (decisión I62 de `DECISIONES.md`).

- **`railway.json`** en el repo:
  - build: `npm run build`
  - pre-deploy: `npm run db:migrate` (si falla, Railway cancela el despliegue y la versión anterior sigue arriba)
  - start: `npm start`
  - healthcheck: `/health`
- `engines.node >= 24` en `package.json`.
- El servidor escucha en `process.env.PORT`, sirve `dist/` con fallback SPA a `index.html` y confía en el proxy de Railway para HTTPS (cookies `Secure` cuando `NODE_ENV=production`).
- Documentar en `README.md` las variables por entorno:
  - `DATABASE_URL=${{Postgres-4iHR.DATABASE_URL}}` en development y `${{Postgres.DATABASE_URL}}` en production (red privada).
  - `PORT=8080`, `NODE_ENV=production`, `BETTER_AUTH_URL=https://<dominio>`, `BETTER_AUTH_SECRET`, `ALLOWED_EMAILS`.
- Conexión MCP remota: `claude mcp add --transport http stepdb https://<dominio>/mcp --header "Authorization: Bearer <token>"`.

---

## 14. Plan de implementación por fases

Cada fase termina con build, lint y tests en verde, y un commit. Los criterios de aceptación (CA) son verificables.

### Fase 0: Preparación
- Dependencias, estructura de carpetas (4.1), `tsconfig` para `server/`, scripts (12.3), `docker-compose.yml`, `.env` / `.env.example`, `env.ts`, Vitest y Tailwind.
- Servidor Hono mínimo con `/health` y `serveStatic` de `dist/`; proxy de Vite configurado; `railway.json`.
- Eliminar el contenido demo del template de Vite.
- **CA**: `npm run dev` muestra un layout vacío y `curl localhost:8787/health` responde `{ status: "ok", db: "ok" }`; `npm run build && npm start` sirve la UI compilada.

### Fase 1: Core (sin UI ni base)
- Tipos de `ProjectModel`, esquemas zod de convenciones y layout, merge + parseo con mapa de offsets, anotación de `stepId` y `store`, clasificación de relaciones, diff semántico y validaciones estructurales.
- DBML del proyecto demo en `server/seed/gasapp/`, con 4 steps:
  1. Recepción de ventas (SQL).
  2. Terceros y clientes (SQL).
  3. Facturación (SQL + una columna agregada a una tabla del step 1 + una vista).
  4. Log de integraciones (Mongo, con referencia lógica a venta).

  Es pequeño (5–12 tablas en total) y **solo demostrativo**.
- **CA**: tests de parseo multi-step, errores traducidos a `step · archivo:línea`, `stepId` a nivel de columna, detección de refs lógicas y diff (agregar, quitar y modificar).

### Fase 2: Base de datos y autenticación
- `schema.ts` completo (sección 5), migraciones, Better Auth con lista blanca, tokens de API, middlewares de seguridad (sección 8), `assertProjectAccess`.
- Pantallas de registro, login y logout.
- **CA**: tests de integración contra `stepdb_test`:
  - Registro con correo fuera de la lista → rechazado.
  - `/api/projects` sin sesión → 401.
  - Proyecto de otro usuario → 404.
  - Token revocado → 401 en `/mcp`.
  - El token en claro no aparece en la base.

### Fase 3: API de proyectos, steps y archivos + tiempo real
- Services y rutas de la sección 7.1, control de versiones (409), revisiones, validación antes de guardar (422 con errores), hub y WebSocket (7.2), endpoint del proyecto de ejemplo.
- **CA**:
  - Guardar con versión vieja → 409 con el contenido actual.
  - Guardar DBML inválido → 422 con `archivo:línea` y sin cambios en la base.
  - Un guardado crea una revisión y emite `model.changed` a un cliente WS suscrito (test con cliente WS real).

### Fase 4: Canvas
- Nodos de tabla y colección, handles por columna, edges custom (gradiente, crow's foot, punteado lógico), persistencia de posiciones, ubicación automática de tablas nuevas, auto-organizar con elkjs y minimapa.
- **CA**: el proyecto de ejemplo se ve completo, con colores por step y relaciones correctas; mover una tabla persiste tras recargar.

### Fase 5: Steps, editor y sincronización en vivo
- Lista de proyectos, panel de steps (RF-10 a RF-15), editor Monaco con gramática DBML y markers, autoguardado, último modelo válido + banner, diálogo de conflicto, diff animado y toasts.
- **CA**:
  - Crear un step desde la UI lo muestra en la línea de tiempo.
  - Con dos pestañas abiertas, guardar en una hace aparecer la tabla nueva animada en la otra en menos de 1 s, con toast.
  - Un DBML inválido muestra el banner y no borra el canvas.

### Fase 6: Exportadores
- SQL Server (RF-50, RF-51), Mongo (RF-60, RF-61) y DBML combinado (RF-81), con su panel de exportación.
- **CA**: snapshots de los tres exportadores para el ejemplo. El SQL tiene FKs después de las tablas, `GO` y schemas creados, y no contiene objetos Mongo. El script Mongo tiene `$jsonSchema` anidado para los campos punteados.

### Fase 7: MCP y tokens
- Endpoint `/mcp` con las tools de 7.3 (incluida `get_guide`), página de tokens (RF-03) y evento `ui.focus`.
- **CA**:
  - Test con el cliente del SDK contra el servidor en proceso: sin token → 401; `write_step_file` con DBML inválido es rechazado con `archivo:línea`; con DBML válido guarda, devuelve el diff y un cliente WS recibe `model.changed` con `source: 'mcp'`.
  - `README.md` explica cómo crear un token y conectar Claude Code.

### Fase 8: Pulido y P1
- En este orden, hasta donde alcance: linter (RF-70, RF-71), replay (RF-90), búsqueda `Cmd+K`, doble clic → definición, nueva tabla desde plantilla, historial de revisiones, reordenar steps, importar DBML, log de actividad y micro-animaciones P2.
- **CA**: cada ítem terminado queda marcado en `docs/PENDIENTES.md` como hecho; lo no alcanzado queda listado ahí.

---

## 15. Reglas para la ejecución autónoma (sesión nocturna)

### 15.1 Reglas generales

1. **No hacer preguntas.** Ante una ambigüedad, tomar la opción más simple que cumpla la spec y registrarla en `docs/DECISIONES.md` (fecha, decisión, alternativa descartada y motivo).
2. **Todo es local.**
   - No hacer `git push`.
   - No usar el MCP de Railway ni ningún otro servicio en la nube.
   - No conectarse a bases remotas.
3. **Prohibido** usar los servidores MCP de bases de datos configurados en el entorno (AUTOGAS, HO40, VANTI, gasdata40, sunset, etc.): son bases reales o productivas y no tienen relación con este proyecto.
4. Seguir las fases en orden. **Commit al final de cada fase** (y en puntos intermedios estables) en la rama `development`, con mensajes descriptivos. Solo commitear con build, lint y tests en verde.
5. **Los commits no llevan ninguna atribución a Claude**: nada de `Co-Authored-By: Claude …`, ni "Generated with Claude Code", ni menciones similares.
6. Verificar APIs de librerías con **context7** antes de usarlas; no asumir APIs de memoria.
7. Verificar visualmente con **Playwright MCP** contra `http://localhost:5173`:
   - Registrar e iniciar sesión con `qa@stepdb.local` (está en `ALLOWED_EMAILS` local).
   - Crear el proyecto de ejemplo.
   - Tomar capturas en las fases 4, 5 y 8 y revisar que se vean bien (colores, relaciones, animaciones sin glitches).
   - Guardar las capturas finales en `docs/screenshots/`.
8. Probar el MCP de punta a punta al final de la fase 7: crear un token, registrar el servidor en un cliente del SDK (o con `claude mcp add` si es posible) y escribir un step por MCP viendo la animación en la UI.
9. No modificar archivos fuera de este repositorio. No dejar procesos (servidor de dev, contenedores) corriendo al terminar, salvo el contenedor de Postgres con sus datos.

### 15.2 Si algo bloquea: árbol de decisiones

El objetivo es **no detenerse**. Ante un bloqueo, intentar en este orden, registrar lo que se hizo en `docs/DECISIONES.md` y continuar:

| Bloqueo | Qué hacer |
|---|---|
| Docker no responde | `open -a Docker` y esperar hasta ~2 min. Si sigue sin responder: `DB_DRIVER=pglite` (12.1) para desarrollo y tests. |
| Postgres 18 no disponible como imagen | Usar `postgres:17`. |
| Node no ejecuta `.ts` directamente (type stripping) | Usar `tsx` para `dev` y `start`. |
| Better Auth no integra bien con Hono/Drizzle tras varios intentos razonables | Implementar auth propia mínima: hash con `node:crypto` `scrypt`, tabla de sesiones con token aleatorio en cookie `HttpOnly`, misma lista blanca. Mantener la interfaz `requireUser` para que el resto no cambie. |
| El SDK de MCP no funciona con Streamable HTTP dentro de Hono | Montar el transporte sobre el `req`/`res` crudos de Node en esa ruta, o usar el modo sin sesión (stateless) del SDK. |
| `@dbml/core` no soporta propiedades personalizadas | Plan B de la sección 6.3. |
| El exportador `mssql` genera algo inválido | Post-procesar el resultado o generar el T-SQL de ese objeto a mano desde el `ProjectModel`. Cubrir con snapshot. |
| Una funcionalidad P1/P2 se atasca | Dejarla detrás de un stub o flag, anotarla en `docs/PENDIENTES.md` con lo intentado y seguir con la siguiente. |
| Un test de la fase actual no pasa tras varios intentos | No desactivarlo en silencio: marcarlo `skip` con comentario `TODO(noche)`, anotarlo en `PENDIENTES.md` y seguir. |

### 15.3 Al terminar

Escribir `docs/RESUMEN-NOCHE.md` con:
- Qué quedó hecho, por fase y RF.
- Qué quedó pendiente.
- Cómo correrlo localmente (Docker o PGlite, migraciones, `npm run dev`, cuenta QA).
- Cómo conectar Claude Code por MCP.
- Capturas.
- Decisiones relevantes (resumen de `DECISIONES.md`).
- Qué falta para desplegar en Railway (sección 13).

Actualizar `CLAUDE.md` con los comandos nuevos (`db:*`, `test`, cómo correr un solo test) y la arquitectura resumida (front, `src/core`, `server/`).

---

## 16. Backlog posterior al MVP (fuera de alcance)

- **Publicación en Railway:** configurar variables, push a `development`, verificar, y luego merge a `main` para production. Respaldos del Postgres de production.
- OAuth para el MCP (que Claude Code inicie sesión en el navegador en lugar de usar tokens).
- Miembros por proyecto (roles lector/editor) y colaboración en tiempo real (Yjs).
- Migraciones del modelo: generar `ALTER TABLE` a partir del diff entre steps o revisiones.
- Snapshots por step: congelar el modelo al cerrar un step y comparar visualmente.
- Edición visual por formularios (agregar columnas y relaciones desde el canvas).
- Aplicar scripts contra un SQL Server o Mongo de desarrollo e ingeniería inversa en vivo.
- Modo oscuro, exportar a PNG/SVG, comentarios sobre tablas.
- Depuración de revisiones antiguas.
- Modelado Mongo avanzado (subdocumentos como nodos, arrays de objetos, patrones de embedding vs. referencing).

---

## 17. Decisiones tomadas

| # | Decisión | Alternativa descartada |
|---|---|---|
| D1 | El contenido del modelo es DBML (texto por step y tipo), guardado en Postgres | Desarmar el modelo en tablas relacionales (tabla, columna, relación): más complejo y sin exportador gratis |
| D2 | Postgres como fuente de verdad desde el MVP | Archivos en disco: habría que reescribir la persistencia al publicar |
| D3 | Backend Node + Hono en el mismo repo y el mismo servicio de Railway | Backend .NET separado: segundo servicio y segundo lenguaje, sin compartir `src/core` |
| D4 | Node ejecuta TypeScript directamente, sin compilar el servidor | Bundle con tsup/esbuild |
| D5 | Drizzle ORM + drizzle-kit | Prisma (más pesado), Kysely (sin migraciones integradas) |
| D6 | Better Auth con lista blanca `ALLOWED_EMAILS` | Contraseña única en variable; Clerk (servicio externo) |
| D7 | Tokens personales para el MCP | OAuth (backlog) |
| D8 | MCP por HTTP en `/mcp`, mismo proceso | MCP stdio separado |
| D9 | WebSocket con pub/sub en memoria (una instancia) | Redis o `LISTEN/NOTIFY` (solo si se escala a varias instancias) |
| D10 | Control de concurrencia optimista con `version` + historial en `revision` | Último que guarda gana |
| D11 | Una tabla pertenece al step donde se define; las columnas posteriores se marcan con `[step: "…"]` | Declarar extensiones de tabla en el step nuevo (requiere un preprocesador propio) |
| D12 | Mongo se modela como tablas DBML en el schema `mongo`, con campos embebidos punteados | Sintaxis propia para documentos anidados |
| D13 | Las vistas se escriben como SQL crudo (DBML no tiene vistas SQL) | — |
| D14 | Code-first (editor) + canvas para visualizar y posicionar | Editor visual completo |
| D15 | Sesión nocturna 100 % local: Postgres en Docker (plan B PGlite), sin push ni Railway | Desarrollar contra la base de dev de Railway |
