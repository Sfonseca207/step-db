# Decisiones de implementación

Registro de decisiones tomadas durante la implementación autónoma del MVP (SPEC §15.1). Formato: fecha · decisión · alternativa descartada · motivo.

| # | Fecha | Decisión | Alternativa descartada | Motivo |
|---|---|---|---|---|
| I1 | 2026-09-28 | Postgres 18 en Docker (`postgres:18`), volumen montado en `/var/lib/postgresql` y script `docker/initdb` que crea `stepdb_test`. | PGlite (plan B) | Docker respondió; no hizo falta el plan B. `DB_DRIVER` solo acepta `postgres` por ahora. |
| I2 | 2026-09-28 | El servidor corre con type stripping nativo de Node (v26) y carga `.env` con `--env-file-if-exists`. | `tsx`, `dotenv` | Node ≥ 24 lo soporta sin dependencias extra. |
| I3 | 2026-09-28 | `@dbml/core` 10.2 soporta propiedades personalizadas (`[step: "…"]`) y las expone en `field.metadata` / `table.metadata`. Se usa directamente. | Plan B con `note: '@step:…'` | Verificado empíricamente al empezar. |
| I4 | 2026-09-28 | Se añadió `tsconfig.server.json` (entorno Node, `moduleResolution: nodenext`) que incluye `server/` y `src/core/`. Los tests `*.test.ts` de `src/` se excluyen del proyecto de la app y se type-checkean en el del servidor. | Un solo tsconfig | `src/core` debe compilar en ambos entornos (DOM y Node). |
