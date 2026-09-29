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
- [ ] **Recolor animado de relaciones** (RF-12): los encabezados y badges cambian de color con transición; los gradientes de las aristas cambian sin transición.
- [ ] **Diff visual en el diálogo de conflicto**: muestra ambos contenidos lado a lado, sin resaltar las líneas distintas.
- [ ] **Layout por step con muchas tablas sin relaciones internas**: ELK las acomoda en rejilla y los bloques se apilan en vertical; con 150 tablas el encuadre queda muy alejado (el rendimiento sí cumple RNF-01: ~100 fps en pan/zoom).
- [ ] **Paneles laterales en pantallas pequeñas**: son redimensionables y colapsables, pero no hay layout específico para móvil.
- [ ] **Depuración de revisiones antiguas** (backlog de la spec).
- [ ] **Rate limiting por IP detrás del proxy de Railway**: Better Auth usa `x-forwarded-for`; conviene fijar `advanced.ipAddress` al desplegar.
- [ ] **PGlite** (plan B sin Docker) no se implementó porque Docker estuvo disponible; `DB_DRIVER` solo acepta `postgres`.
