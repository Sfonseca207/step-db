import type * as Monaco from 'monaco-editor/editor/editor.api'

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

  const snippet = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
  monaco.languages.registerCompletionItemProvider('dbml', {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }
      const K = monaco.languages.CompletionItemKind
      return {
        suggestions: [
          {
            label: 'Table',
            kind: K.Snippet,
            insertText: 'Table ${1:schema}.${2:tabla} {\n\tid bigint [pk, increment]\n\t$0\n}',
            insertTextRules: snippet,
            range,
          },
          { label: 'Ref', kind: K.Snippet, insertText: 'Ref: ${1:a.b.c} > ${2:x.y.id}', insertTextRules: snippet, range },
          { label: 'Enum', kind: K.Snippet, insertText: 'Enum ${1:schema}.${2:nombre} {\n\t$0\n}', insertTextRules: snippet, range },
          { label: 'indexes', kind: K.Snippet, insertText: 'indexes {\n\t${1:columna} [name: \'${2:ix}\']\n}', insertTextRules: snippet, range },
          { label: 'step', kind: K.Property, insertText: 'step: "${1:NN-slug}"', insertTextRules: snippet, range },
          ...['pk', 'increment', 'not null', 'unique', 'default: ', 'note: ', 'ref: > '].map((s) => ({
            label: s.trim(),
            kind: K.Keyword,
            insertText: s,
            range,
          })),
        ],
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
    },
  })
}
