# Pendientes

Estado de los ítems P1/P2 de la fase 8 y de lo que quedó fuera del MVP. Las decisiones están en `DECISIONES.md`.

## Fase 8 (P1/P2)

- [x] Linter de modelo (RF-70, RF-71): 6 reglas en `src/core/lint.ts`, badge ⚠ en el nodo, pestaña ⚠ con la lista (clic → línea y tabla), markers de advertencia en Monaco y `warnings` en cada guardado y en `validate_project`.
- [x] Replay (RF-90): ▶ Replay con pausa, siguiente, velocidad (0.5×/1×/2×), rótulo "Step NN · Nombre · fecha", columnas futuras ocultas y relaciones que se dibujan.
- [x] Búsqueda `Cmd/Ctrl+K` (RF-28): tablas y columnas; centra, selecciona y hace parpadear la columna. Funciona también con el foco en Monaco.
- [x] Doble clic → definición (RF-27): abre el archivo del step y salta a la línea de la tabla.
- [x] Nueva tabla desde plantilla (RF-34): respeta casing, singular/plural, PK y schema por defecto; también "Nueva colección".
- [x] Historial de revisiones (RF-35): lista (fecha, origen, resumen), vista previa y "Restaurar" (crea una revisión nueva).
- [x] Reordenar steps (RF-14): drag & drop con actualización optimista.
- [x] Importar DBML (RF-80) y DDL de SQL Server (RF-82, P2) al archivo `model` del step elegido.
- [x] Log de actividad (RF-43): panel flotante con los últimos 30 cambios.
- [x] Micro-animaciones P2: celebración al completar un step, fondos ("hulls") por step (RF-29), pulso del step activo.
- [x] Columnas agregadas a tablas de otros steps en la tarjeta del step (RF-16).

## Pendiente / fuera del MVP

- [ ] **Borrar un step** desde la UI o el MCP: la spec no define endpoint (solo crear, editar y reordenar).
- [ ] **RF-82 completo**: la importación de DDL agrega las tablas al step elegido; no crea automáticamente un step `00-legado` al inicio de la línea de tiempo (se puede crear un step y reordenarlo).
- [ ] **Ruteo de relaciones**: son curvas directas y pueden pasar por detrás de una tabla. Se mitiga dibujándolas por encima al pasar el cursor o al seleccionar la tabla; el ruteo ortogonal de ELK queda para después.
- [ ] **Modelar desde el móvil**: debajo de 1024 px los paneles flotan sobre el canvas; sirve para consultar, no para escribir DBML con comodidad.
- [ ] **El slug de un step conserva su número original al reordenar** (decisión I13): el selector de archivos puede mostrar `06-turnos` para el step que quedó en la posición 04.
- [ ] **Depuración de revisiones antiguas** (backlog de la spec).
- [ ] **PGlite** (plan B sin Docker) no se implementó porque Docker estuvo disponible; `DB_DRIVER` solo acepta `postgres`.

## Despliegue

- [x] **Entorno `development` en Railway** (2026-09-29): variables y ajustes del servicio configurados, migraciones en el pre-deploy y verificación con `scripts/deploy-smoke.ts`.
- [x] **Rate limiting por IP detrás del proxy de Railway**: Better Auth lee `x-real-ip` (decisión I61).
- [ ] **Entorno `production`**: mismas variables con `${{Postgres.DATABASE_URL}}`, secreto propio y su dominio, y los mismos ajustes del servicio que `development` (tabla del `README.md`); PR de `development` a `main`. Solo cuando se pida.
- [ ] **Infrastructure as Code** (`.railway/railway.ts`): versionar los ajustes del servicio, que hoy solo están en Railway (decisión I62).
- [ ] **Backups del volumen de Postgres** antes de guardar datos reales en `production`.
- [ ] **CI antes de desplegar**: hoy cada push a `development` despliega sin correr lint ni tests. Falta un workflow de GitHub Actions y activar "Wait for CI" en el servicio.
- [ ] **Más de una réplica**: el hub de tiempo real y el rate limiting viven en memoria; escalar exige un pub/sub (por ejemplo `LISTEN/NOTIFY` de Postgres).

## Resuelto en el QA del 2026-09-29

Detalle en `QA.md`.

- [x] Recolor animado de relaciones (RF-12).
- [x] Diff resaltado en el diálogo de conflicto.
- [x] Layout por step según la proporción del canvas; encuadre correcto con muchas tablas.
- [x] Paneles y barra adaptables a pantallas pequeñas.
