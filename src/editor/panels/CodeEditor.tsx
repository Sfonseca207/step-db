import Editor, { type OnMount } from '@monaco-editor/react'
import { useEffect, useRef } from 'react'
import type { Diagnostic } from '../../core/types.ts'
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

export function CodeEditor({ path, value, language, readOnly, diagnostics, reveal, onChange }: Props) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)

  const onMount: OnMount = (editor) => {
    editorRef.current = editor
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

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !reveal) return
    const t = setTimeout(() => {
      editor.revealLineInCenter(reveal.line)
      editor.setPosition({ lineNumber: reveal.line, column: 1 })
      editor.focus()
      const deco = editor.createDecorationsCollection([
        { range: new monaco.Range(reveal.line, 1, reveal.line, 1), options: { isWholeLine: true, className: 'sdb-reveal-line' } },
      ])
      setTimeout(() => deco.clear(), 1600)
    }, 60)
    return () => clearTimeout(t)
  }, [reveal])

  return (
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
        wordWrap: language === 'markdown' ? 'on' : 'off',
        automaticLayout: true,
        padding: { top: 10, bottom: 10 },
        fixedOverflowWidgets: true,
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      }}
    />
  )
}
