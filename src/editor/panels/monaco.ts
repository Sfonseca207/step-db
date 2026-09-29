import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/editor/editor.api'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import 'monaco-editor/languages/definitions/sql/register'
import 'monaco-editor/languages/definitions/markdown/register'
import 'monaco-editor/languages/definitions/javascript/register'
// `editor.api` trae solo la API: el popup de sugerencias y los snippets con tabulaciones son contribuciones aparte.
// (`monaco-editor/features/suggest/register` no sirve: no incluye el popup.)
import 'monaco-editor/editor/contrib/suggest/browser/suggestController'
import 'monaco-editor/editor/contrib/snippet/browser/snippetController2'
import { registerDbml } from './dbml-language.ts'

// Monaco local (sin CDN): compatible con la CSP `script-src 'self'`.
;(globalThis as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
}
registerDbml(monaco)
loader.config({ monaco })

export { monaco }
