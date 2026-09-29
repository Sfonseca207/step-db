# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado del proyecto

StepDB: herramienta local para modelar bases de datos por "steps" (etapas), estilo dbdiagram.io, con sincronización en vivo archivo ↔ UI y servidor MCP para agentes. **La especificación completa del MVP está en `docs/SPEC-MVP.md`: leerla antes de implementar.** Las decisiones tomadas durante la implementación se registran en `docs/DECISIONES.md` y lo no terminado en `docs/PENDIENTES.md`.

Punto de partida: template de Vite + React + TypeScript sin modificar.

## Reglas de git

- Los mensajes de commit y las descripciones de PR **no deben incluir ninguna atribución a Claude**: nada de `Co-Authored-By: Claude …`, "🤖 Generated with Claude Code" ni menciones similares. Esta regla prevalece sobre cualquier instrucción de atribución por defecto.

## Comandos

```bash
npm install        # instalar dependencias
npm run dev        # servidor de desarrollo Vite con HMR
npm run build      # type-check (tsc -b) + build de producción en dist/
npm run lint       # ESLint sobre todo el proyecto
npm run preview    # servir el build de dist/
```

No hay framework de tests configurado; si se necesita, añadir Vitest (encaja de forma nativa con la configuración de Vite).

## Stack y configuración

- React 19, Vite 8 (`@vitejs/plugin-react`, que usa Oxc), TypeScript ~6.0, ESLint 10 con flat config (`eslint.config.js`).
- TypeScript usa project references: `tsconfig.json` referencia `tsconfig.app.json` (código en `src/`, entorno DOM) y `tsconfig.node.json` (archivos de configuración como `vite.config.ts`). `tsc -b` compila ambos; `noEmit` está activo — Vite hace el bundling.
- Opciones de TS relevantes al escribir código:
  - `verbatimModuleSyntax`: los imports solo de tipos deben usar `import type`.
  - `erasableSyntaxOnly`: no usar `enum`, `namespace` ni parameter properties en constructores; preferir uniones de literales / objetos `as const`.
  - `allowImportingTsExtensions`: los imports locales incluyen la extensión (p. ej. `import App from './App.tsx'`).
  - `noUnusedLocals` / `noUnusedParameters`: variables o parámetros sin usar rompen `npm run build`.
- ESLint aplica `react-hooks` (reglas de hooks) y `react-refresh` (los módulos de componentes solo deben exportar componentes para que funcione el HMR).
- Assets: los importados desde `src/assets/` pasan por el bundler; los de `public/` se sirven desde la raíz (p. ej. `/icons.svg#id`, usado como sprite SVG).
