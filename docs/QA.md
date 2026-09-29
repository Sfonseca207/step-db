# QA intensivo del MVP

> Fecha: 2026-09-29 · Rama: `development` · Entorno: local (Vite + Hono en desarrollo y build de producción servido por Hono).
> Método: recorrido de cada requerimiento de `SPEC-MVP.md` con Playwright (teclado y ratón reales, varias pestañas, cliente MCP), midiendo las animaciones cuadro a cuadro y revisando capturas. Todo lo que falló se corrigió y se volvió a probar.
> Estado final: `npm run lint`, `npm run build` y `npm test` en verde (**12 archivos, 81 tests**).

## 1. Resumen

Se corrigieron más de 30 defectos de funcionalidad, diseño y animación (detalle en las secciones 2 a 6) y la suite pasó de 62 a 81 tests automáticos.

Los tres hallazgos más importantes:

1. **El editor no dejaba escribir espacios.** Monaco usa `EditContext` (un `<div>`), que React Flow no reconoce como campo de texto: la tecla Espacio activaba el "pan" del canvas y Backspace podía borrar el nodo seleccionado. En la sesión anterior no se vio porque las pruebas pegaban el texto en lugar de teclearlo.
2. **El atenuado al 20 % (RF-15 y RF-24) no se aplicaba.** Motion fijaba la opacidad del nodo en línea y anulaba la clase; solo se veía la escala de grises.
3. **El bundle del editor pesaba 19 MB sin comprimir.** `@dbml/core` incluye los importadores de todos los motores SQL. Ahora el modelo se parsea con `@dbml/parse`, el importador de DDL se descarga solo al usarlo y el servidor comprime: el editor transfiere **0,9 MB**.

## 2. Animaciones (SPEC §9.5 y §10)

Cada animación se midió leyendo los estilos calculados mientras ocurría.

| Animación | Esperado | Resultado |
|---|---|---|
| Tabla nueva | Spring (escala + fade) y glow ~2 s | ✅ Escala 0,55 → 1,04 → 1 en ~450 ms; glow del color del step durante 2 s |
| Columna nueva o modificada | Parpadeo amarillo suave | ✅ `#FEF08A` → transparente en 1,8 s |
| Relación nueva | El trazo se dibuja | ✅ `stroke-dashoffset` 1 → 0 en 900 ms |
| Tabla eliminada | Fade-out antes de desaparecer | ✅ Opacidad 1 → 0 en ~320 ms; **corregido**: el nodo fantasma quedaba 2,4 s invisible |
| Columna eliminada | Fade-out | ✅ **Corregido**: desaparecía de golpe. Ahora se tacha y se desvanece en 380 ms en su posición |
| Relación eliminada | Fade-out | ✅ **Corregido**: desaparecía de golpe |
| Recolorear un step | Tablas y relaciones cambian con animación | ✅ Encabezado, cuerpo, borde, badge, relaciones y gradientes en 400 ms (**corregido** para relaciones) |
| Seleccionar tabla | "Hormiguitas" en sus relaciones y resto atenuado | ✅ Flujo continuo (0,8 s por ciclo); resto al 20 % y en gris (**corregido**) |
| Hover sobre relación | Se resalta ella y sus dos columnas | ✅ Además se dibuja por encima de las tablas |
| Auto-organizar | Transición animada | ✅ 480 ms con desaceleración; luego encuadra |
| Step activo | Pulso sutil | ✅ Ciclo de 2 s |
| Completar step | Ráfaga de partículas | ✅ **Corregido**: era casi invisible; ahora 22 partículas durante 900 ms, y se limpian |
| Toast de cambio externo | Entrada y salida animadas | ✅ Spring de entrada (~180 ms); clic centra lo que cambió |
| Replay | Tablas aparecen, relaciones se dibujan, cámara y rótulo | ✅ **Corregido**: el rótulo se desplazaba durante su entrada y tapaba las tablas del step |
| Diálogos y menús | Entrada de 150–400 ms | ✅ **Agregado**: antes aparecían sin transición |
| Tarjetas de proyecto y de step | Entrada escalonada | ✅ **Agregado** |
| Fondos por step | Aparición suave | ✅ **Agregado** |
| `prefers-reduced-motion` | Sin flujo ni partículas; transiciones instantáneas | ✅ Verificado emulando la preferencia: sin glow, pulso, hormiguitas, trazo ni fade-out |

## 3. Funcionalidad por requerimiento

| RF | Verificación | Estado |
|---|---|---|
| RF-01 | Registro, login, logout, redirección a login y regreso a la ruta original; correo no permitido; contraseña incorrecta; cuenta duplicada | ✅ (corregido: el error quedaba visible al cambiar entre "Iniciar sesión" y "Crear cuenta") |
| RF-02 | Crear, abrir, renombrar, borrar con confirmación, proyecto de ejemplo | ✅ (corregido: no se podía cancelar el renombrado; las franjas de color no eran las de los steps) |
| RF-03 | Crear token, mostrarlo una vez, copiar token y comando, último uso, revocar, 401 tras revocar | ✅ |
| RF-10 a RF-13 | Línea de tiempo, crear y editar step, activar | ✅ (corregido: el nombre se cortaba y las acciones flotantes lo tapaban) |
| RF-14 | Reordenar con drag & drop, con indicador de destino | ✅ |
| RF-15 | Todos / Solo step / Step + dependencias | ✅ (corregido: "+ deps" incluía tablas sin relación con el step; selección y enfoque se cruzaban y atenuaban todo) |
| RF-16 | Columnas agregadas a tablas de otros steps | ✅ |
| RF-20 y RF-21 | Nodo tabla y colección; campos anidados de Mongo; nombres largos; enums | ✅ |
| RF-22 y RF-23 | Columna a columna, crow's foot (N:1, 1:1, N:M, 0..1), gradiente, referencia lógica, auto-referencia, FK compuesta | ✅ |
| RF-24 | Hover y selección | ✅ |
| RF-25 | Arrastrar y persistir, zoom, pan, encuadre, minimapa | ✅ |
| RF-26 | Auto-organizar, con y sin agrupar por step | ✅ (mejorado: los bloques se acomodan según la proporción del canvas; el zoom inicial pasó de 0,35 a 0,53) |
| RF-27 | Doble clic → definición | ✅ (corregido: en colecciones Mongo abría el archivo SQL; desde la pestaña de advertencias no saltaba a la línea) |
| RF-28 | `Cmd/Ctrl+K`, también con el foco en el editor | ✅ (mejorado: búsquedas de varias palabras, p. ej. "log envio") |
| RF-29 | Fondos por step | ✅ |
| RF-30 y RF-31 | Pestañas, resaltado DBML, markers en la línea correcta | ✅ (errores del parser ahora en español) |
| RF-32 | Autoguardado solo si parsea, último modelo válido, banner, respaldo en `localStorage` | ✅ con tecleo real |
| RF-33 | Conflicto: "Mantener lo mío" / "Tomar lo guardado" | ✅ (mejorado: resalta las líneas que difieren; Escape no lo cierra) |
| RF-34 | Nueva tabla y nueva colección desde plantilla | ✅ |
| RF-35 | Historial, vista previa, restaurar | ✅ (corregido: faltaba la versión inicial de cada archivo) |
| RF-40 a RF-42 | Sincronización entre pestañas y por MCP, toasts | ✅ (agregado: toasts para steps creados, editados o reordenados por otro) |
| RF-43 | Registro de actividad | ✅ (mejorado: clic centra lo que cambió) |
| RF-50 a RF-53 | T-SQL completo, por step e idempotente; copiar y descargar | ✅ (corregido: nombres de constraint de más de 128 caracteres; nombres de archivo como `GasApp_ejemplo_.sql`) |
| RF-60 y RF-61 | mongosh con `$jsonSchema` anidado, índices y referencias lógicas | ✅ |
| RF-70 y RF-71 | Linter, badge y lista | ✅ (agregado: regla de FK con tipo distinto; nombres de regla en español) |
| RF-80 a RF-82 | Importar DBML y DDL; DBML combinado | ✅ |
| RF-90 | Replay con pausa, siguiente y velocidad | ✅ |
| MCP | Las 10 tools, escritura válida e inválida, conflicto, foco, aislamiento entre usuarios, edición de steps en vivo | ✅ |

## 4. Robustez

| Escenario | Resultado |
|---|---|
| Servidor caído mientras se edita | Aviso "Sin conexión en vivo"; el borrador queda en `localStorage`; al volver el servidor se guarda solo (**agregado** el reintento) |
| Fallo de red al verificar la sesión | **Corregido**: enviaba al login a un usuario autenticado. Ahora muestra "No se pudo conectar" y reintenta |
| Reinicio del servidor | El WebSocket se reconecta y los cambios siguen llegando en ~200 ms |
| Proyecto borrado desde otra pestaña | Redirige a proyectos con un aviso (**agregado**) |
| Proyecto inexistente o ajeno | Mensaje claro; distingue 404 de error de red |
| Ruta desconocida | **Corregido**: mostraba proyectos sin cambiar la URL; ahora redirige |
| Borrador inválido recuperado al abrir | Canvas con lo guardado más el banner |
| Diálogos | Nativos (`<dialog>`): fondo inerte, foco atrapado, Escape |
| 150 tablas y 298 relaciones | 68 fps en pan y 81 fps en zoom con todas las tablas visibles (RNF-01 pide ≥ 50) |

## 5. Pantallas pequeñas

| Ancho | Antes | Ahora |
|---|---|---|
| 1440 | Correcto | Correcto |
| 1280 | La barra se partía en dos líneas | Botones con icono y título; menú de cuenta en el avatar |
| 1024 | Canvas de 284 px | Paneles limitados según el ancho: canvas de 438 px |
| 390 (móvil) | Inutilizable | Canvas completo; los paneles se abren por encima, de a uno |

## 6. Build de producción

Verificado con `npm run build && npm start`: sin errores ni avisos en consola con la CSP activa, Monaco y el worker de ELK locales, WebSocket y MCP operativos, `window.__stepdb` ausente.

| | Antes | Ahora |
|---|---|---|
| JavaScript del editor | 19,0 MB | 3,7 MB |
| Transferido al abrir el editor | 18,5 MB | 0,9 MB (gzip) |
| Importador de DDL | Incluido | 15 MB aparte, solo al importar DDL |
| Caché | Sin cabeceras | Assets `immutable`; HTML `no-cache` |

## 7. Lo que queda pendiente

Ver `PENDIENTES.md`. Nada bloquea el uso del MVP.

- Las relaciones son curvas directas y pueden pasar por detrás de una tabla. Se mitiga dibujándolas por encima al pasar el cursor o seleccionar la tabla.
- En móvil el editor es utilizable para consultar, no para modelar con comodidad.
- Borrar steps sigue sin definirse en la spec.

## 8. Capturas

En `docs/screenshots/`, actualizadas con la interfaz actual. Nuevas: `qa-conflicto-diff.png`, `qa-editor-1024.png` y `qa-editor-390.png`.
