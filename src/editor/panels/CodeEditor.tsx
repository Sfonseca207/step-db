import Editor, { type OnMount } from '@monaco-editor/react'
import { useEffect, useRef, useState } from 'react'
import type { Diagnostic } from '../../core/types.ts'
import { useEditorStore } from '../store.ts'
import { monaco } from './monaco.ts'

interface Props {
  /** Identidad del modelo de Monaco (conserva undo por archivo). */
  path: string
  value: string
  language: 'dbml' | 'sql' | 'markdown' | 'javascript'
  readOnly?: boolean
  diagnostics?: Diagnostic[]
  reveal?: { line: number; token: number } | null
  onChange?: (value: string) => void
}

/** Último "ir a la línea" atendido: al volver a abrir una pestaña no se repite uno viejo. */
let handledRevealToken = 0

export function CodeEditor({ path, value, language, readOnly, diagnostics, reveal, onChange }: Props) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const [mounted, setMounted] = useState(false)

  const onMount: OnMount = (editor) => {
    editorRef.current = editor
    setMounted(true)
    // Cmd/Ctrl+K abre la búsqueda de StepDB también con el foco en el editor.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => useEditorStore.getState().setSearchOpen(true))
  }

  // Markers de error/advertencia en la línea correcta del archivo.
  useEffect(() => {
    const model = monaco.editor.getModel(monaco.Uri.parse(path))
    if (!model) return
    const markers = (diagnostics ?? [])
      .filter((d) => d.line)
      .map((d) => {
        const line = Math.min(d.line!, model.getLineCount())
        return {
          severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
          message: d.message,
          startLineNumber: line,
          endLineNumber: line,
          startColumn: d.column ?? model.getLineFirstNonWhitespaceColumn(line) ?? 1,
          endColumn: model.getLineMaxColumn(line),
        }
      })
    monaco.editor.setModelMarkers(model, 'stepdb', markers)
  }, [diagnostics, path, value])

  // Ir a una línea: espera a que el editor esté montado y muestre el archivo pedido
  // (la petición puede llegar antes, p. ej. al cambiar de pestaña o de step).
  useEffect(() => {
    const editor = editorRef.current
    if (!mounted || !editor || !reveal || reveal.token <= handledRevealToken) return
    let tries = 0
    let clear: ReturnType<typeof setTimeout> | null = null
    const attempt = () => {
      const model = editor.getModel()
      if (model?.uri.toString() !== monaco.Uri.parse(path).toString() || model.getLineCount() < reveal.line) {
        if (tries++ < 20) timer = setTimeout(attempt, 50)
        return
      }
      handledRevealToken = reveal.token
      editor.revealLineInCenter(reveal.line)
      editor.setPosition({ lineNumber: reveal.line, column: model.getLineFirstNonWhitespaceColumn(reveal.line) || 1 })
      editor.focus()
      const deco = editor.createDecorationsCollection([
        { range: new monaco.Range(reveal.line, 1, reveal.line, 1), options: { isWholeLine: true, className: 'sdb-reveal-line' } },
      ])
      clear = setTimeout(() => deco.clear(), 1600)
    }
    let timer = setTimeout(attempt, 30)
    return () => {
      clearTimeout(timer)
      if (clear) clearTimeout(clear)
    }
  }, [reveal, path, mounted])

  return (
    // `nokey`: React Flow ignora el teclado que viene de aquí. Monaco usa EditContext (un <div>), que
    // React Flow no reconoce como campo de texto y le capturaba Espacio (pan) y Backspace (borrar nodo).
    <div className="nokey h-full w-full">
      <Editor
        path={path}
        value={value}
        language={language}
        theme="stepdb"
        onMount={onMount}
        onChange={(v) => onChange?.(v ?? '')}
        loading={<div className="p-4 text-sm text-slate-400">Cargando editor…</div>}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 12.5,
          lineHeight: 19,
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
          tabSize: 2,
          insertSpaces: true,
          scrollBeyondLastLine: false,
          renderLineHighlight: 'line',
          // El panel es angosto: ajustar líneas evita el scroll horizontal que esconde el inicio de cada línea.
          wordWrap: 'on',
          wrappingIndent: 'deepIndent',
          automaticLayout: true,
          padding: { top: 10, bottom: 10 },
          fixedOverflowWidgets: true,
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        }}
      />
    </div>
  )
}
