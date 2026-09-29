import type * as Monaco from 'monaco-editor/editor/editor.api'
import { currentCatalog, kindOfPath } from './dbml-catalog.ts'
import { completeDbml, type ItemKind } from './dbml-complete.ts'

/** Gramática Monarch de DBML + extensiones de StepDB (`[step: "…"]`). */
export function registerDbml(monaco: typeof Monaco) {
  if (monaco.languages.getLanguages().some((l) => l.id === 'dbml')) return
  monaco.languages.register({ id: 'dbml', extensions: ['.dbml'], aliases: ['DBML'] })

  monaco.languages.setMonarchTokensProvider('dbml', {
    ignoreCase: true,
    keywords: ['table', 'ref', 'enum', 'project', 'tablegroup', 'tablepartial', 'note', 'indexes', 'as', 'records', 'checks'],
    settings: [
      'pk',
      'primary',
      'key',
      'increment',
      'not',
      'null',
      'unique',
      'default',
      'note',
      'ref',
      'name',
      'type',
      'delete',
      'update',
      'cascade',
      'restrict',
      'set',
      'action',
      'no',
      'headercolor',
      'color',
      'btree',
      'hash',
      'step',
    ],
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/'''/, 'string', '@multistring'],
        [/'([^'\\]|\\.)*'/, 'string'],
        [/"([^"\\]|\\.)*"/, 'string.identifier'],
        [/`[^`]*`/, 'string.expression'],
        [/#[0-9a-fA-F]{3,8}\b/, 'number.hex'],
        [/\[/, { token: 'delimiter.bracket', next: '@settings' }],
        [/<>|[<>-](?=\s)/, 'operator'],
        [/~[a-zA-Z_]\w*/, 'type.identifier'],
        [/\b\d+(\.\d+)?\b/, 'number'],
        [
          /[a-zA-Z_][\w]*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@default': 'identifier',
            },
          },
        ],
        [/[{}()]/, '@brackets'],
        [/[:,.]/, 'delimiter'],
      ],
      settings: [
        [/\]/, { token: 'delimiter.bracket', next: '@pop' }],
        [/'([^'\\]|\\.)*'/, 'string'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/`[^`]*`/, 'string.expression'],
        [/#[0-9a-fA-F]{3,8}\b/, 'number.hex'],
        [/<>|[<>-]/, 'operator'],
        [/\b\d+(\.\d+)?\b/, 'number'],
        [
          /[a-zA-Z_][\w]*/,
          {
            cases: {
              '@settings': 'attribute.name',
              '@default': 'identifier',
            },
          },
        ],
        [/[:,.]/, 'delimiter'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
      multistring: [
        [/'''/, 'string', '@pop'],
        [/[^']+/, 'string'],
        [/'/, 'string'],
      ],
    },
  } as Monaco.languages.IMonarchLanguage)

  monaco.languages.setLanguageConfiguration('dbml', {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: "'", close: "'", notIn: ['string'] },
      { open: '"', close: '"', notIn: ['string'] },
      { open: '`', close: '`' },
    ],
    indentationRules: { increaseIndentPattern: /\{\s*$/, decreaseIndentPattern: /^\s*\}/ },
  })

  const K = monaco.languages.CompletionItemKind
  const kinds: Record<ItemKind, Monaco.languages.CompletionItemKind> = {
    keyword: K.Keyword,
    snippet: K.Snippet,
    type: K.TypeParameter,
    enum: K.Enum,
    table: K.Struct,
    column: K.Field,
    schema: K.Module,
    step: K.Event,
    setting: K.Property,
    value: K.Value,
    operator: K.Operator,
  }
  monaco.languages.registerCompletionItemProvider('dbml', {
    // Además de las letras, abren la lista los caracteres tras los que cambia lo que se puede escribir.
    triggerCharacters: [' ', '.', '[', ',', ':', '"', '>', '<', '-', '~', '('],
    provideCompletionItems(model, position) {
      const found = completeDbml({
        text: model.getValue(),
        offset: model.getOffsetAt(position),
        kind: kindOfPath(model.uri.path),
        catalog: currentCatalog(),
      })
      if (!found) return { suggestions: [] }
      const range = monaco.Range.fromPositions(model.getPositionAt(found.from), model.getPositionAt(found.to))
      return {
        suggestions: found.items.map((item, index) => ({
          label: item.label,
          kind: kinds[item.kind],
          detail: item.detail,
          insertText: item.insert,
          insertTextRules: item.snippet ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
          // El orden lo decide el contexto (lo más probable arriba), no el alfabeto.
          sortText: String(index).padStart(4, '0'),
          command: item.retrigger ? { id: 'editor.action.triggerSuggest', title: 'Sugerir' } : undefined,
          range,
        })),
      }
    },
  })

  monaco.editor.defineTheme('stepdb', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '8E4EC6', fontStyle: 'bold' },
      { token: 'attribute.name', foreground: '0090FF' },
      { token: 'string', foreground: '30A46C' },
      { token: 'string.identifier', foreground: '1E293B' },
      { token: 'string.expression', foreground: 'D6409F' },
      { token: 'number', foreground: 'F76B15' },
      { token: 'number.hex', foreground: 'AD7F58' },
      { token: 'operator', foreground: 'E5484D', fontStyle: 'bold' },
      { token: 'comment', foreground: '94A3B8', fontStyle: 'italic' },
      { token: 'type.identifier', foreground: '12A594' },
    ],
    colors: {
      'editor.background': '#FFFFFF',
      'editorLineNumber.foreground': '#CBD5E1',
      'editorLineNumber.activeForeground': '#64748B',
      'editor.lineHighlightBackground': '#F8FAFC',
      'editorIndentGuide.background1': '#F1F5F9',
      'editorSuggestWidget.background': '#FFFFFF',
      'editorSuggestWidget.border': '#E2E8F0',
      'editorSuggestWidget.foreground': '#334155',
      'editorSuggestWidget.selectedBackground': '#E2E8F0',
      'editorSuggestWidget.selectedForeground': '#0F172A',
      'editorSuggestWidget.selectedIconForeground': '#0F172A',
      'editorSuggestWidget.highlightForeground': '#0090FF',
      'editorSuggestWidget.focusHighlightForeground': '#0090FF',
    },
  })
}
