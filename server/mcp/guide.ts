/** Guía que devuelve la tool `get_guide`: lo primero que debe leer un agente. */
export const AGENT_GUIDE = `# StepDB · guía para agentes

StepDB modela bases de datos **por steps** (etapas de trabajo). Cada step tiene un slug
(\`02-facturacion\`), nombre, fecha, color, estado y cuatro archivos de texto:

| Archivo | Contenido |
|---|---|
| \`model\` | DBML de las tablas SQL Server creadas en el step |
| \`mongo\` | DBML de las colecciones MongoDB del step (siempre en el schema \`mongo\`) |
| \`views\` | SQL crudo de las vistas (\`CREATE VIEW …\`), porque DBML no tiene vistas |
| \`notes\` | Markdown con decisiones del step |

El modelo del proyecto es la **concatenación** de los archivos \`model\` y \`mongo\` de todos
los steps en orden. Las \`Ref\` pueden cruzar steps. Nunca se guarda un modelo que no parsea:
\`write_step_file\` valida el proyecto completo y, si hay errores, responde
\`step · archivo:línea — mensaje\` y no guarda.

## Flujo recomendado

1. \`get_project_overview\`: convenciones, steps (y el activo) y tablas por step.
2. \`get_step\`: contenido **y versión** de los archivos del step que vas a cambiar.
3. (Opcional) \`validate_project\` con \`step\`, \`kind\` y \`content\` para probar el cambio sin guardar.
4. \`write_step_file\` con el contenido completo del archivo y la \`version\` que leíste.
   - Si otra persona guardó antes, responde **conflicto** con la versión actual: vuelve a leer y reintenta.
   - La respuesta incluye el diff (+/− tablas, columnas, relaciones) y advertencias del linter.
5. \`focus\` para centrar en la UI la tabla o el step que acabas de cambiar.

La UI del usuario se actualiza al instante y anima lo que cambió.

## Convenciones DBML de StepDB

- Tablas SQL Server con schema explícito: \`Table facturacion.factura { … }\`.
  Sin schema se asume \`defaultSqlSchema\` (normalmente \`dbo\`).
- Respeta \`conventions\` del proyecto (idioma, casing, singular/plural, PK y patrón de FK).
- Una tabla **pertenece al step donde se define**. Para agregar una columna a una tabla de un
  step anterior, edita el archivo de **ese** step y marca la columna con la propiedad
  \`step\` del step actual:

\`\`\`dbml
// step 01-recepcion-ventas · archivo model
Table ventas.venta {
  id bigint [pk, increment]
  facturada bit [not null, default: 0, step: "03-facturacion"]
}
\`\`\`

  La relación de esa columna puede declararse en el step nuevo:
  \`Ref: ventas.venta.tercero_id > terceros.tercero.id\`.

- Relaciones: \`>\` muchos a uno, \`<\` uno a muchos, \`-\` uno a uno, \`<>\` muchos a muchos.
  Inline: \`venta_id bigint [not null, ref: > ventas.venta.id]\`.
- Índices dentro de la tabla: \`indexes { (venta_id, fecha) [name: 'ix_…'] }\`.
- Enums: \`Enum ventas.estado_venta { registrada\\n anulada }\` (en SQL Server se exportan como CHECK).
- Notas: \`[note: '…']\` en tablas y columnas.

## MongoDB

- Van en el archivo \`mongo\` del step y siempre en el schema \`mongo\`: \`Table mongo.log_envio_venta { … }\`.
- Tipos permitidos: \`objectId\`, \`string\`, \`int\`, \`long\`, \`double\`, \`decimal\`, \`bool\`, \`date\`,
  \`object\`, \`array\`, \`"array<tipo>"\` (entre comillas) o \`tipo[]\`.
- Campos embebidos con notación punteada entre comillas: \`"respuesta.codigo" int\`.
- Una \`Ref\` entre Mongo y SQL es una **referencia lógica** (no genera FK). Indexa el campo en Mongo.
- Usa Mongo para logs, trazabilidad y documentos flexibles; no uses tablas SQL como logs.

## Exportar

\`export\` con \`target\` = \`mssql\` | \`mongo\` | \`dbml\` y \`step\` opcional (script incremental del step).
`
