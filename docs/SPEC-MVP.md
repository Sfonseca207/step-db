# StepDB — Especificación del MVP

> Documento de requerimientos para construir el MVP de forma autónoma (sesión nocturna de Claude Code).
> Fecha: 2026-09-28 · Autor: Samuel Fonseca · Estado: listo para implementar.

---

## 1. Visión

StepDB es una herramienta **local** para modelar bases de datos **por steps** (etapas de trabajo), inspirada en [dbdiagram.io](https://dbdiagram.io). Se diferencia en tres cosas:

1. **Steps como ciudadanos de primera clase.** El modelo no se diseña de una sentada: se construye por etapas ("01 Recepción de ventas", "02 Terceros", "03 Facturación"…). Cada step tiene fecha, color, descripción y notas de decisiones. Las tablas creadas en un step llevan su color, y las relaciones entre steps se ven como la "mezcla" de los dos colores.
2. **Pensado para trabajar con un agente.** La fuente de verdad son **archivos de texto en disco** (DBML). Claude Code (o cualquier agente) puede editarlos directamente o usar un **servidor MCP por HTTP** que expone StepDB. La página se actualiza **al instante** y anima lo que cambió.
3. **Multi-almacenamiento.** Además de SQL Server, permite modelar **colecciones de MongoDB** (p. ej. logs de integración) y ver cómo se relacionan con las tablas SQL mediante referencias lógicas.

Todo esto con una experiencia visual **divertida y didáctica**: fondo blanco, colores por step, animaciones al crear o cambiar tablas, relaciones animadas y un modo "replay" que reconstruye el modelo step por step.

**Caso de uso principal:** rediseñar desde cero el modelo de datos de GasApp (plataforma de ventas de combustible), corrigiendo problemas del modelo actual: falta de normalización y uso de tablas SQL como logs, incluso para recuperar ventas o verificar envíos a servicios externos.

### 1.1 Flujo de trabajo objetivo

```
Samuel conversa con Claude sobre el step (convenciones, nombres, normalización)
        │
        ▼
Claude escribe/edita  steps/02-facturacion/model.dbml  (vía MCP o editando el archivo)
        │
        ▼
StepDB detecta el cambio → valida → anima en el canvas lo nuevo/cambiado
        │
        ▼
Samuel revisa visualmente, ajusta posiciones o pide cambios → repite
        │
        ▼
Exporta scripts SQL Server (por step o completo) y scripts MongoDB
```

### 1.2 Objetivos del MVP

- Modelar tablas, columnas, relaciones, índices y enums en DBML, organizados por steps.
- Ver el diagrama en un canvas interactivo, con colores por step y relaciones columna a columna.
- Sincronización en vivo archivo ↔ UI (edición externa por agente o editor).
- Servidor MCP HTTP embebido para que Claude Code opere sobre el proyecto con validación.
- Exportar a SQL Server (tablas, FKs, índices, vistas) y a MongoDB (colecciones con validador e índices).
- Proyecto de ejemplo funcional (demo GasApp reducida).

### 1.3 No objetivos del MVP

- Multiusuario, autenticación, nube o despliegue. Es una app local de un solo usuario.
- Conectarse a una base de datos real para aplicar scripts o hacer ingeniería inversa en vivo.
- Migraciones incrementales (`ALTER TABLE` entre versiones). Solo se generan scripts de creación.
- Edición visual completa por formularios. El MVP es **code-first**, como dbdiagram; el canvas sirve para visualizar, posicionar y navegar.

---

## 2. Conceptos del dominio

| Concepto | Definición |
|---|---|
| **Proyecto** | Carpeta en disco con `stepdb.json`, una subcarpeta por step y `layout.json`. Un proyecto = un modelo de datos (p. ej. GasApp). |
| **Step** | Etapa de trabajo con `id`, nombre, fecha, color, estado (`en_curso` \| `completado`), descripción y notas. Contiene archivos DBML y SQL propios. Se ordenan cronológicamente. |
| **Step activo** | Step "en curso" seleccionado en la UI. Las tablas nuevas creadas desde la UI van a él, y el MCP lo usa por defecto. |
| **Tabla** | Tabla SQL Server definida en `model.dbml` de un step. Pertenece al step donde está definida. |
| **Colección** | Colección MongoDB definida en `mongo.dbml` de un step, siempre en el schema `mongo` (`Table mongo.log_integracion {…}`). |
| **Columna** | Pertenece al step de su tabla, salvo que tenga la propiedad `[step: "<id>"]`, que indica que se agregó en un step posterior. |
| **Relación (Ref)** | Relación DBML entre columnas. Si cruza SQL↔Mongo es una **referencia lógica**: no se genera FK y se dibuja punteada. |
| **Vista** | Vista SQL Server en `views.sql` del step, como SQL crudo, porque DBML no soporta vistas. |
| **Convenciones** | Reglas del proyecto (idioma, casing, singular/plural, patrón de PK/FK) en `stepdb.json` + `CONVENCIONES.md`. Las lee el agente y las aplica el linter. |

---

## 3. Decisiones técnicas

No reinventar la rueda: cada pieza pesada la resuelve una librería madura.

| Necesidad | Decisión | Por qué |
|---|---|---|
| Lenguaje del modelo | **DBML** (`@dbml/core`) | Lo usa dbdiagram, Claude lo conoce muy bien, trae parser y exportador a `mssql` y el formato es legible en diffs. Soporta `headercolor`, `TableGroup [color]`, `TablePartial` y **propiedades personalizadas inline** (`[step: "02"]`). |
| Canvas / diagrama | **React Flow** (`@xyflow/react`) | Nodos custom, handles por columna, edges custom (gradientes, marcadores), minimapa, zoom/pan, `fitView`. Es el estándar. |
| Auto-layout | **elkjs** (algoritmo `layered`) | Buen layout para ERDs; se ejecuta en un web worker. |
| Animaciones | **Motion** (`motion`, antes framer-motion) + CSS/SVG | Springs para nodos y `layout` animations; SVG `stroke-dashoffset` para edges. |
| Editor de código | **Monaco** (`@monaco-editor/react`) con gramática Monarch para DBML | Markers de error nativos y experiencia tipo VS Code. |
| Estado UI | **Zustand** | Mínimo boilerplate. |
| Estilos | **Tailwind CSS v4** (`@tailwindcss/vite`) | Rápido de iterar. |
| Validación de esquemas | **zod** | Para `stepdb.json`, `layout.json` y los inputs de las tools MCP. |
| Backend local | **Plugin de Vite** (middleware en el dev server) | Un solo proceso (`npm run dev`) sirve UI + API REST + file watcher + push por WebSocket (canal HMR de Vite) + endpoint MCP. Sin servidores extra. |
| MCP | **`@modelcontextprotocol/sdk`**, transporte **Streamable HTTP** en `/mcp` | "MCP web": Claude Code se conecta con `claude mcp add --transport http stepdb http://localhost:5173/mcp`. Al vivir en el mismo proceso, puede enviar eventos a la UI (enfocar tabla, cambiar step). |
| Tests | **Vitest** (core, exportadores, MCP), con snapshots para SQL generado | Integración nativa con Vite. |

> **Antes de usar cada librería, consultar su documentación actual con context7.** Las versiones y APIs cambian; en particular hay que confirmar que la versión publicada de `@dbml/core` soporta las propiedades personalizadas inline y `TablePartial`. Si no las soporta, aplicar el plan B de la sección 4.4.

---

## 4. Formato en disco (fuente de verdad)

### 4.1 Estructura de un proyecto

```
<proyecto>/                          # p. ej. ~/Development/gasapp-model  o  examples/gasapp
├── stepdb.json                      # manifiesto: metadatos, convenciones, steps (orden)
├── CONVENCIONES.md                  # convenciones en prosa (para humanos y agentes)
├── layout.json                      # posiciones de nodos y viewport (lo escribe la UI)
└── steps/
    ├── 01-recepcion-ventas/
    │   ├── model.dbml               # tablas SQL Server del step
    │   ├── mongo.dbml               # (opcional) colecciones Mongo del step
    │   ├── views.sql                # (opcional) vistas SQL Server
    │   └── notes.md                 # (opcional) decisiones y contexto del step
    └── 02-facturacion/
        └── ...
```

La ruta del proyecto se configura con la variable de entorno `STEPDB_PROJECT`. Si no se define, se usa `examples/gasapp`.

### 4.2 `stepdb.json`

```json
{
  "name": "GasApp",
  "description": "Modelo de datos de GasApp rediseñado desde cero",
  "conventions": {
    "language": "es",
    "case": "snake_case",
    "tableNames": "singular",
    "primaryKey": "id",
    "foreignKeyPattern": "{tabla}_id",
    "defaultSqlSchema": "dbo"
  },
  "activeStep": "02-facturacion",
  "steps": [
    {
      "id": "01-recepcion-ventas",
      "name": "Recepción de ventas",
      "date": "2026-09-28",
      "color": "#E5484D",
      "status": "completado",
      "description": "Modelo para recibir y persistir ventas desde las estaciones"
    },
    {
      "id": "02-facturacion",
      "name": "Facturación",
      "date": "2026-09-29",
      "color": "#3E63DD",
      "status": "en_curso",
      "description": "Facturas, detalle e integración con el proveedor de facturación electrónica"
    }
  ]
}
```

- El `id` del step coincide con el nombre de su carpeta: prefijo numérico de 2 dígitos + slug.
- El orden del array es el orden cronológico y define el orden de concatenación y de exportación.
- Se valida con zod. Si un step no tiene `color`, se asigna el siguiente de la paleta (sección 7.1).

### 4.3 Cómo se construye el modelo combinado

1. Leer los `model.dbml` y `mongo.dbml` de cada step, en orden.
2. **Concatenarlos** en un solo texto DBML, porque las `Ref` cruzan archivos y el parser necesita verlo todo. Mientras tanto, construir un **mapa de offsets** (línea global → archivo + línea local) para traducir errores de parseo al archivo y línea correctos.
3. Parsear con `@dbml/core` y normalizar a un modelo interno (`ProjectModel`), en el que cada tabla y columna queda anotada con:
   - `stepId`: el de su archivo o, para columnas, el valor de la propiedad `step` si existe.
   - `store`: `"sqlserver"` \| `"mongo"`. Una tabla es Mongo si y solo si su schema es `mongo`, y el validador exige que todo lo de `mongo.dbml` esté en ese schema y nada de `model.dbml` lo esté.
   - `sourceFile` y rango de líneas, para "ir a la definición" desde el canvas.
4. Clasificar las relaciones en `fk` (SQL↔SQL) o `logical` (cruza stores o Mongo↔Mongo).

El módulo `src/core/` debe ser **TypeScript puro e isomórfico**: sin DOM ni APIs de Node en la lógica. Así corre en el navegador (feedback del editor) y en el servidor (validación de escrituras MCP). El acceso a disco vive en una capa aparte, `src/server/`.

### 4.4 Convenciones DBML propias

```dbml
// steps/02-facturacion/model.dbml
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

// Columna agregada en este step a una tabla de un step anterior:
// se edita en el archivo del step 01 con [step: "02-facturacion"]
```

```dbml
// steps/01-recepcion-ventas/model.dbml (fragmento)
Table ventas.venta {
  id bigint [pk, increment]
  // ...
  facturada bit [not null, default: 0, step: "02-facturacion"]
}
```

```dbml
// steps/03-log-integraciones/mongo.dbml
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

- **Campos embebidos en Mongo**: se escriben con notación punteada entre comillas (`"respuesta.codigo"`). La UI los muestra anidados e indentados bajo `respuesta`.
- **Tipos Mongo permitidos**: `objectId`, `string`, `int`, `long`, `double`, `decimal`, `bool`, `date`, `object`, `array`, `array<tipo>`.
- **Plan B** si `@dbml/core` no soporta propiedades personalizadas en columnas: usar la nota con prefijo `[note: '@step:02-facturacion …']` y extraerla en la normalización. Registrar la decisión en `docs/DECISIONES.md`.

### 4.5 `layout.json`

```json
{
  "positions": { "ventas.venta": { "x": 120, "y": 80 }, "mongo.log_envio_venta": { "x": 900, "y": 340 } },
  "viewport": { "x": 0, "y": 0, "zoom": 0.9 }
}
```

- La clave es `schema.tabla`.
- Lo escribe la UI con debounce al mover nodos.
- Si una tabla nueva no tiene posición, se ubica automáticamente cerca de las tablas de su step (ELK incremental o heurística a la derecha del cluster del step) **sin mover las demás**.

---

## 5. Arquitectura

```
┌──────────────────────────── Navegador (React) ─────────────────────────────┐
│  StepsPanel │ Canvas (React Flow) │ Panel derecho: DBML · Notas · SQL · Mongo │
│                     Zustand store  ←  ProjectModel (src/core)               │
└──────────────▲───────────────────────────────┬──────────────────────────────┘
      WS (HMR custom events:                    │ REST /api/*
      stepdb:changed, stepdb:ui)                ▼
┌────────────────────────── Vite dev server + plugin StepDB ──────────────────┐
│  /api/project  /api/steps/*  /api/layout  /api/export/*                     │
│  /mcp  (Streamable HTTP, @modelcontextprotocol/sdk)                          │
│  watcher (server.watcher.add(STEPDB_PROJECT)) → reparse → diff → push WS     │
│  src/server/ (fs)  ──usa──►  src/core/ (parse, merge, validate, lint, export)│
└──────────────────────────────────────▲──────────────────────────────────────┘
                                       │ lee/escribe
                          <proyecto>/ (stepdb.json, steps/**, layout.json)
                                       ▲
                    Claude Code: edita archivos directamente  o  usa MCP /mcp
```

### 5.1 Estructura de código sugerida

```
src/
  core/        # isomórfico: tipos ProjectModel, loader puro, merge+parse, diff, validate, lint, exporters
  server/      # plugin de Vite: fs, watcher, rutas REST, MCP
  ui/          # componentes React: canvas/, steps/, editor/, export/, common/
  store/       # zustand
  App.tsx, main.tsx
examples/gasapp/   # proyecto demo
docs/              # SPEC-MVP.md, DECISIONES.md, PENDIENTES.md
```

### 5.2 API REST (servida por el plugin)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/project` | Manifiesto + contenido de todos los archivos de steps + layout |
| PUT | `/api/manifest` | Actualiza `stepdb.json` (crear/editar/reordenar steps, step activo) |
| PUT | `/api/steps/:id/files/:file` | Escribe `model.dbml` \| `mongo.dbml` \| `views.sql` \| `notes.md` |
| POST | `/api/steps` | Crea un step (carpeta + entrada en manifiesto) |
| PUT | `/api/layout` | Guarda posiciones y viewport |
| GET | `/api/export/:target?step=` | `target` = `mssql` \| `mongo` \| `dbml`; devuelve el texto |

**Eventos WS** (servidor → cliente):

- `stepdb:changed` `{ files, source: 'external' | 'ui' | 'mcp' }`: dispara recarga y diff.
- `stepdb:ui` `{ action: 'focusTable' | 'focusStep' | 'setActiveStep', ... }`: lo emite el MCP.

Las escrituras hechas por la propia UI no deben provocar un "eco" de animación de cambio externo: se ignoran los eventos del watcher para los archivos que la UI acaba de escribir.

---

## 6. Requerimientos funcionales

Prioridad: **P0** = imprescindible para el MVP · **P1** = importante, hacerlo si alcanza · **P2** = deseable.

### 6.1 Proyecto y steps

- **RF-01 (P0)** Cargar el proyecto desde `STEPDB_PROJECT`. Si la carpeta no existe o está vacía, ofrecer crear un proyecto nuevo con `stepdb.json` y un primer step.
- **RF-02 (P0)** Panel de steps (izquierda) en forma de **línea de tiempo vertical**. Cada tarjeta muestra número, nombre, fecha, color, estado, cantidad de tablas y colecciones, y descripción corta.
- **RF-03 (P0)** Crear step desde la UI: nombre, fecha (hoy por defecto), color (siguiente de la paleta, editable) y descripción. Crea la carpeta con `model.dbml` vacío y `notes.md`.
- **RF-04 (P0)** Editar nombre, fecha, color, estado y descripción de un step. Cambiar el color recolorea tablas y relaciones con animación.
- **RF-05 (P0)** Marcar un step como **activo**, indicado con un pulso sutil en su tarjeta.
- **RF-06 (P1)** Reordenar steps con drag & drop. No se renombran carpetas: el orden vive en el manifiesto.
- **RF-07 (P0)** Modos de enfoque al hacer clic en un step:
  - **Todos**: todo a color.
  - **Solo step**: el step elegido a color y el resto atenuado al ~20 % de opacidad y en escala de grises.
  - **Step + dependencias**: el step, más las tablas de otros steps con las que se relaciona.
- **RF-08 (P1)** Mostrar en cada step las columnas que agregó a tablas de otros steps, ya que esa actividad también forma parte del trabajo del día.

### 6.2 Canvas

- **RF-10 (P0)** Nodo tabla:
  - Encabezado con el color del step, nombre `schema.tabla` y badge con el número del step.
  - Una fila por columna con nombre, tipo e íconos (PK 🔑, FK, `not null`, `unique`).
  - Nota de la tabla como tooltip.
  - Columnas agregadas en otro step con un punto del color de ese step.
- **RF-11 (P0)** Nodo colección Mongo con estilo distinto: ícono de hoja, borde punteado y esquinas más redondeadas. Los campos embebidos se muestran indentados.
- **RF-12 (P0)** Relaciones **columna a columna**: un handle por columna, a izquierda y derecha, eligiendo el lado más cercano. Marcadores de cardinalidad **crow's foot** (1, N, 0..1) según el tipo de `Ref` (`>`, `<`, `-`, `<>`).
- **RF-13 (P0)** Color de relaciones:
  - Entre tablas del mismo step: color del step.
  - Entre steps distintos: **gradiente lineal** del color de un step al del otro ("los colores se juntan").
  - Referencias lógicas SQL↔Mongo: línea punteada con la etiqueta "ref. lógica".
- **RF-14 (P0)** Hover sobre una relación: resaltarla y resaltar ambas columnas. Seleccionar una tabla: sus relaciones se animan con un flujo de "hormiguitas" y se atenúa el resto.
- **RF-15 (P0)** Arrastrar tablas y persistir posiciones en `layout.json`. Zoom, pan, `fitView`, minimapa coloreado por step y fondo blanco con cuadrícula de puntos sutil.
- **RF-16 (P0)** Botón **Auto-organizar** con elkjs `layered` y transición animada a las nuevas posiciones. Opción para agrupar por step.
- **RF-17 (P1)** Doble clic en una tabla abre su archivo en el editor y hace scroll a su definición.
- **RF-18 (P1)** Búsqueda rápida con `Ctrl/Cmd+K`: buscar tabla o columna, centrar el canvas y resaltarla.
- **RF-19 (P2)** Fondos por step: un "hull" suave del color del step detrás de sus tablas, activable desde la UI.

### 6.3 Editor

- **RF-20 (P0)** Panel derecho con pestañas **DBML** (`model.dbml`/`mongo.dbml` del step activo o seleccionado), **Vistas** (`views.sql`), **Notas** (`notes.md`), **SQL Server** y **Mongo**. Las dos últimas muestran lo exportado y son de solo lectura.
- **RF-21 (P0)** Resaltado de sintaxis DBML (gramática Monarch). Los errores de parseo aparecen como markers en la línea correcta del archivo correcto.
- **RF-22 (P0)** Autoguardado con debounce (~500 ms) y re-render del canvas en vivo. Si el DBML es inválido, el canvas **conserva el último modelo válido** y muestra un banner de error con `archivo:línea`. Nunca debe quedar en blanco.
- **RF-23 (P1)** Botón "Nueva tabla" que inserta una plantilla que respeta las convenciones en el archivo del step activo y la enfoca en el canvas.
- **RF-24 (P1)** Conflicto de edición: si el archivo cambia en disco mientras hay cambios sin guardar en el editor, ofrecer "Mantener lo mío" o "Tomar lo del disco".

### 6.4 Sincronización en vivo y feedback de cambios

- **RF-30 (P0)** Cualquier cambio en disco dentro del proyecto (agente, editor externo o git) se refleja en la UI en menos de 1 s sin recargar la página.
- **RF-31 (P0)** **Diff semántico** entre el modelo anterior y el nuevo (tablas, columnas y relaciones agregadas, eliminadas o modificadas; la identidad es `schema.tabla` + nombre de columna), con animaciones:
  - Tabla nueva: aparece con spring (escala + fade) y un "glow" del color del step por unos 2 s.
  - Columna nueva o modificada: la fila parpadea en amarillo suave.
  - Relación nueva: el trazo se "dibuja" (animación de `stroke-dashoffset`).
  - Eliminaciones: fade-out antes de desaparecer.
- **RF-32 (P0)** Toast resumen del cambio externo, p. ej. "02-facturacion: +2 tablas, +5 columnas, +3 relaciones". Clic en el toast centra el canvas en lo que cambió.
- **RF-33 (P1)** Registro de actividad (panel colapsable): últimos N cambios con hora, origen (UI / externo / MCP) y resumen.

### 6.5 Exportación SQL Server

- **RF-40 (P0)** Generar T-SQL de SQL Server a partir de las tablas (sin colecciones Mongo), usando el exportador `mssql` de `@dbml/core` sobre el modelo filtrado y post-procesando el resultado:
  - `CREATE SCHEMA` para cada schema distinto de `dbo`, en un bloque `IF NOT EXISTS`.
  - Tablas en orden de step; FKs **después** de todas las tablas; luego índices; al final las vistas de `views.sql` en orden de step.
  - Separadores `GO` entre lotes.
  - Encabezado por step, como comentario, con nombre, fecha y descripción.
  - Excluir las `Ref` que involucren colecciones Mongo.
- **RF-41 (P0)** Exportar **por step** (solo los objetos de ese step, más las FKs hacia steps anteriores) o **completo**. Copiar al portapapeles y descargar `.sql`.
- **RF-42 (P1)** Opción "idempotente": envolver cada `CREATE TABLE` en `IF OBJECT_ID(...) IS NULL`.
- **RF-43 (P0)** Tests con snapshots del SQL generado para el proyecto de ejemplo.

### 6.6 MongoDB

- **RF-50 (P0)** Exportar un script `mongosh` que incluya:
  - `db.createCollection(nombre, { validator: { $jsonSchema: … } })`, con `bsonType` mapeado desde los tipos y `required` desde `not null`. Los campos punteados se convierten en objetos anidados.
  - `createIndex` por cada índice (`unique` si aplica).
  - Comentarios con las referencias lógicas hacia SQL.
- **RF-51 (P0)** En el canvas y en el export, cada referencia lógica SQL↔Mongo lleva una nota explicativa: "No hay FK; la consistencia la garantiza la aplicación. Indexar `<campo>` en Mongo".
- **RF-52 (P1)** Advertencia del linter si el campo de una referencia lógica en Mongo no está indexado.

### 6.7 Integración con agentes (MCP)

- **RF-60 (P0)** Endpoint MCP en `/mcp` (Streamable HTTP, sin sesión o con sesión según recomiende el SDK) con las tools siguientes. Todas validan sus inputs con zod.

| Tool | Descripción |
|---|---|
| `get_project_overview` | Nombre, convenciones, steps (con step activo) y, por step, sus tablas y colecciones con sus columnas en formato compacto. Es el punto de partida del agente. |
| `get_step` | Contenido completo de los archivos de un step. |
| `create_step` | Crea un step (`name`, `description`, `date?`, `color?`) y lo deja activo. |
| `update_step` | Edita los metadatos de un step. |
| `write_step_file` | Escribe `model.dbml` \| `mongo.dbml` \| `views.sql` \| `notes.md`. **Antes de escribir, valida el proyecto completo con el contenido nuevo**; si hay errores de parseo **rechaza** y devuelve los errores con `archivo:línea`. También devuelve las advertencias del linter y el diff resultante. |
| `validate_project` | Errores y advertencias del linter. |
| `export` | `target` = `mssql` \| `mongo` \| `dbml`; `step?`. |
| `focus` | Envía a la UI la orden de centrar y resaltar una tabla o un step (evento `stepdb:ui`). |

- **RF-61 (P0)** Las escrituras MCP disparan la misma sincronización y las mismas animaciones que un cambio externo, con origen `mcp` en el toast.
- **RF-62 (P0)** Generar en la raíz del proyecto un `AGENTS.md` (y un `CLAUDE.md` que lo importe) que explique el formato de StepDB: estructura de carpetas, convenciones DBML propias (sección 4.4), cómo agregar columnas a tablas de otro step, cómo modelar Mongo y cómo validar. Así el agente trabaja bien **con o sin MCP**.
- **RF-63 (P1)** Script CLI `npm run stepdb -- validate|export mssql|export mongo [--step id]` que usa `src/core`. Sirve para que un agente sin MCP pueda validar desde la terminal.
- **RF-64 (P2)** Resources MCP: `stepdb://conventions` y `stepdb://steps/{id}`.

### 6.8 Linter de modelo (advertencias, no bloquean)

- **RF-70 (P1)** Reglas iniciales:
  1. Tabla sin PK.
  2. Nombre de tabla o columna que no cumple `conventions.case`.
  3. Columna que cumple `foreignKeyPattern` pero no tiene `Ref`.
  4. Columna FK sin índice (SQL).
  5. Referencia lógica sin índice en Mongo.
  6. Tabla SQL con nombre que sugiere log (`log`, `bitacora`, `auditoria`, `historial`): sugerir evaluar si va en Mongo. Es un guiño al problema actual de GasUp.
- **RF-71 (P1)** Las advertencias se muestran como badge ⚠ en el nodo y en una lista del panel derecho.

### 6.9 Importación

- **RF-80 (P1)** "Importar DBML": pegar DBML (p. ej. exportado de dbdiagram) y agregarlo al step activo.
- **RF-81 (P2)** "Importar SQL Server DDL" usando el importador `mssql` de `@dbml/core`, para traer tablas del modelo actual como referencia en un step "00-legado".
- **RF-82 (P1)** Exportar "DBML combinado" compatible con dbdiagram.io: un solo archivo con `TableGroup` por step (con `color`) y `headercolor` en cada tabla.

### 6.10 Modo replay

- **RF-90 (P1)** Botón ▶ **Replay**: reconstruye el diagrama step por step en orden cronológico. En cada step, sus tablas aparecen con animación, se dibujan sus relaciones, la cámara hace `fitView` sobre ese step y un rótulo muestra "Step 02 · Facturación · 29 sep". Controles: pausa, siguiente, velocidad.

---

## 7. Experiencia visual

El objetivo explícito es que modelar sea **entretenido**: nada gris ni uniforme, pero legible.

### 7.1 Paleta de steps

12 colores vivos y distinguibles entre sí, asignados en orden:

`#E5484D` rojo · `#3E63DD` azul · `#30A46C` verde · `#F76B15` naranja · `#8E4EC6` violeta · `#12A594` teal · `#D6409F` rosa · `#FFC53D` ámbar · `#0090FF` celeste · `#AD7F58` bronce · `#46A758` hierba · `#E54666` carmesí

- Encabezado de tabla: color sólido con texto de contraste automático (blanco o negro según luminancia).
- Cuerpo de la tabla: tinte muy suave (~6 %) del color del step.

### 7.2 Principios

- **Fondo blanco** con cuadrícula de puntos gris muy tenue. Tipografía sans para la UI y monoespaciada para tipos de columna.
- **Movimiento con propósito**: cada animación comunica algo (nuevo, cambiado, relacionado, enfocado). Duraciones de 150 a 400 ms y springs suaves. El glow de "nuevo" dura unos 2 s.
- **Micro-celebración** al marcar un step como completado: una ráfaga breve de partículas del color del step (P2).
- Respetar `prefers-reduced-motion`: sin animaciones de flujo ni partículas y transiciones instantáneas.
- Solo modo claro en el MVP.

### 7.3 Layout de pantalla

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ StepDB · GasApp        [Todos|Solo step|+deps]  [Auto-organizar] [▶ Replay] [Exportar] │
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

## 8. Requerimientos no funcionales

- **RNF-01** Rendimiento: 150 tablas y 300 relaciones con pan y zoom fluidos (≥ 50 fps en un Mac M-series). Usar `React.memo` en nodos, `onlyRenderVisibleElements` de React Flow si hace falta y el layout ELK en un web worker.
- **RNF-02** Cambio en disco → UI actualizada en menos de 1 s.
- **RNF-03** Robustez: un archivo inválido nunca rompe la UI ni borra datos. Las escrituras son **atómicas** (archivo temporal + rename).
- **RNF-04** Seguridad local: el servidor escucha solo en `localhost`. Toda ruta de archivo recibida por REST o MCP se valida contra la carpeta del proyecto (sin path traversal) y los nombres de archivo contra una lista blanca.
- **RNF-05** Calidad: `npm run build`, `npm run lint` y `npm test` en verde. TypeScript estricto según `tsconfig.app.json` (ver `CLAUDE.md`).
- **RNF-06** Ejecución: `STEPDB_PROJECT=/ruta npm run dev` levanta todo. Sin Docker ni servicios externos.

---

## 9. Plan de implementación por fases

Cada fase termina con build, lint y tests en verde, y un commit. Los criterios de aceptación (CA) son verificables.

### Fase 0: Preparación

- Instalar dependencias: `@xyflow/react`, `elkjs`, `motion`, `@monaco-editor/react`, `zustand`, `zod`, `@dbml/core`, `@modelcontextprotocol/sdk`, `tailwindcss`, `@tailwindcss/vite` y `vitest`.
- Crear la estructura de `src/` (sección 5.1), eliminar el contenido demo del template de Vite y agregar el script `test`.
- **CA**: `npm run build && npm run lint && npm test` pasa; la app muestra un layout vacío con los tres paneles.

### Fase 1: Core (sin UI)

- Tipos de `ProjectModel`, esquemas zod de `stepdb.json` y `layout.json`, merge + parse con mapa de offsets, anotación de `stepId` y `store`, clasificación de relaciones, diff semántico y validaciones estructurales (schema `mongo` ↔ `mongo.dbml`, ids de step que existan).
- Crear el proyecto de ejemplo `examples/gasapp/` con 3 o 4 steps:
  1. Recepción de ventas (SQL).
  2. Terceros y clientes (SQL).
  3. Facturación (SQL + una columna agregada a una tabla del step 1 + una vista).
  4. Log de integraciones (Mongo, con referencia lógica a venta).

  Es un ejemplo pequeño (5–12 tablas en total) y **solo demostrativo**.
- **CA**: tests que cubren parseo multiarchivo, errores traducidos a `archivo:línea`, `stepId` a nivel de columna, detección de refs lógicas y diff (agregar, quitar y modificar).

### Fase 2: Servidor (plugin de Vite)

- Rutas REST, escritura atómica, watcher sobre `STEPDB_PROJECT`, eventos WS, supresión del eco de escrituras propias y validación de rutas.
- **CA**: con `npm run dev` corriendo, editar a mano un `.dbml` del ejemplo emite `stepdb:changed`, lo que se verifica con un test de integración o un log.

### Fase 3: Canvas

- Nodos de tabla y colección, handles por columna, edges custom (gradiente, crow's foot, punteado lógico), persistencia de posiciones, ubicación automática de tablas nuevas, auto-organizar con elkjs y minimapa.
- **CA**: el proyecto de ejemplo se ve completo, con colores por step y relaciones correctas; mover una tabla persiste tras recargar.

### Fase 4: Steps, editor y sincronización en vivo

- Panel de steps (RF-02 a RF-07), editor Monaco con gramática DBML y markers, autoguardado, último modelo válido + banner de error, diff animado y toasts.
- **CA**:
  - Crear un step desde la UI crea su carpeta.
  - Editar un `.dbml` con `sed` desde la terminal hace aparecer la tabla nueva animada en menos de 1 s, con toast.
  - Un DBML inválido muestra el banner y no borra el canvas.

### Fase 5: Exportadores

- SQL Server (RF-40, RF-41), Mongo (RF-50, RF-51) y DBML combinado (RF-82), con su panel de exportación.
- **CA**: snapshots de los tres exportadores para el ejemplo. El SQL tiene FKs después de las tablas, `GO` y schemas creados, y no contiene objetos Mongo. El script Mongo tiene `$jsonSchema` anidado para los campos punteados.

### Fase 6: MCP

- Endpoint `/mcp` con las tools de RF-60, evento `focus` hacia la UI, `AGENTS.md` + `CLAUDE.md` generados en el proyecto y CLI (RF-63).
- **CA**:
  - Un test que usa el cliente del SDK contra el servidor en proceso: `write_step_file` con DBML inválido es rechazado con `archivo:línea`; con DBML válido escribe y devuelve el diff.
  - Documentar en `README.md` el comando `claude mcp add --transport http stepdb http://localhost:5173/mcp`.

### Fase 7: Pulido y P1

- En este orden, hasta donde alcance: linter (RF-70, RF-71), replay (RF-90), búsqueda `Cmd+K`, doble clic → definición, nueva tabla desde plantilla, reordenar steps, importar DBML, log de actividad y micro-animaciones P2.
- **CA**: cada ítem terminado queda marcado en `docs/PENDIENTES.md` como hecho; lo no alcanzado queda listado ahí.

---

## 10. Reglas para la ejecución autónoma (sesión nocturna)

1. **No hacer preguntas.** Ante una ambigüedad, tomar la opción más simple que cumpla la spec y registrarla en `docs/DECISIONES.md` (fecha, decisión, alternativa descartada y motivo).
2. Seguir las fases en orden. **Commit al final de cada fase** (y en puntos intermedios estables) con mensajes descriptivos. Solo commitear con build, lint y tests en verde. **Los commits no llevan ninguna atribución a Claude**: nada de `Co-Authored-By: Claude …`, ni "Generated with Claude Code", ni menciones similares en mensajes de commit o descripciones de PR.
3. Verificar APIs de librerías con **context7** antes de usarlas; no asumir APIs de memoria.
4. Verificar visualmente con **Playwright MCP**: levantar `npm run dev`, navegar a la app, tomar capturas de las fases 3, 4 y 7 y revisar que se vean bien (colores, relaciones, animaciones sin glitches). Guardar las capturas finales en `docs/screenshots/`.
5. Si una funcionalidad se atasca tras varios intentos razonables, dejarla detrás de un stub o flag, anotarla en `docs/PENDIENTES.md` con lo intentado y **continuar** con la siguiente.
6. **Prohibido** usar los servidores MCP de bases de datos configurados en el entorno (AUTOGAS, HO40, VANTI, gasdata40, sunset, etc.): son bases reales o productivas y no tienen relación con este proyecto. Tampoco se debe publicar, desplegar ni hacer push a remotos.
7. No modificar archivos fuera de este repositorio. El proyecto de ejemplo vive en `examples/gasapp/`.
8. Al terminar, escribir `docs/RESUMEN-NOCHE.md` con:
   - Qué quedó hecho, por fase y RF.
   - Qué quedó pendiente.
   - Cómo correrlo.
   - Cómo conectar Claude Code por MCP.
   - Capturas.
   - Decisiones relevantes.

---

## 11. Backlog posterior al MVP (fuera de alcance)

- Migraciones: generar `ALTER TABLE` a partir del diff entre steps o versiones.
- Snapshots por step: congelar el modelo al cerrar un step y comparar visualmente.
- Edición visual por formularios (agregar columnas y relaciones desde el canvas).
- Aplicar scripts contra un SQL Server o Mongo de desarrollo e ingeniería inversa en vivo.
- Modo oscuro, exportar a PNG/SVG y comentarios sobre tablas.
- Modelado Mongo avanzado (subdocumentos como nodos, arrays de objetos, patrones de embedding vs. referencing).

---

## 12. Decisiones asumidas (revisables)

| # | Decisión | Alternativa |
|---|---|---|
| D1 | La fuente de verdad es DBML en archivos por step | JSON propio (más fácil de anotar, peor para editar a mano y sin exportador gratis) |
| D2 | Backend como plugin de Vite; la app corre con `npm run dev` | Servidor Node separado (Hono) si luego se quiere empaquetar como app de escritorio |
| D3 | MCP por HTTP embebido en `/mcp` | MCP stdio separado; más procesos y sin canal directo a la UI |
| D4 | Una tabla pertenece al step donde se define; las columnas posteriores se marcan con `[step: "…"]` | Declarar extensiones de tabla en el archivo del step nuevo (requiere un preprocesador propio) |
| D5 | Mongo se modela como tablas DBML en el schema `mongo`, con campos embebidos punteados | Sintaxis propia para documentos anidados |
| D6 | Las vistas se escriben como SQL crudo en `views.sql` (DBML no tiene vistas SQL) | — |
| D7 | Code-first (editor) + canvas para visualizar y posicionar | Editor visual completo |
