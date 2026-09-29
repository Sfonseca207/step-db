/**
 * Traducción de los mensajes del parser de DBML (`@dbml/core`), que vienen en
 * inglés. Lo que no se reconoce se devuelve tal cual.
 */
const RULES: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^Expect a comma ','$/i, () => "Se esperaba una coma ','"],
  [/^Expect a closing brace '}'$/i, () => "Falta cerrar la llave '}'"],
  [/^Expect a closing bracket '\]'$/i, () => "Falta cerrar el corchete ']'"],
  [/^Expect a closing parenthesis '\)'$/i, () => "Falta cerrar el paréntesis ')'"],
  [/^Expect an opening brace '{'$/i, () => "Se esperaba una llave de apertura '{'"],
  [/^Expect an identifier$/i, () => 'Se esperaba un nombre (identificador)'],
  [/^Expect a variable or literal$/i, () => 'Se esperaba un nombre o un valor'],
  [/^Expect (.+)$/i, (m) => `Se esperaba ${m[1]}`],
  [/^Unexpected (.+)$/i, (m) => `No se esperaba ${m[1]}`],
  [/^A Table must have a name$/i, () => 'La tabla debe tener un nombre'],
  [/^A column must have a type$/i, () => 'La columna debe tener un tipo'],
  [/^An Enum must have at least one element$/i, () => 'El enum debe tener al menos un valor'],
  [/^A Custom element .+$/i, () => "Elemento no reconocido: se esperaba Table, Ref, Enum, TableGroup, TablePartial o Project"],
  [/^'(.+)' can only appear once$/i, (m) => `'${m[1]}' solo puede aparecer una vez`],
  [/^'(.+)' and '(.+)' can not be set at the same time$/i, (m) => `'${m[1]}' y '${m[2]}' no pueden usarse a la vez`],
  [/^'default' must be .+$/i, () => "'default' debe ser un texto, un número, true, false, null, un valor de enum o una expresión entre `backticks`"],
  [/^Custom setting '(.+)' must be a string or a color literal$/i, (m) => `La propiedad '${m[1]}' necesita un valor de texto entre comillas (p. ej. ${m[1]}: "valor")`],
  [/^Two endpoints are the same$/i, () => 'La relación apunta a la misma columna en ambos extremos'],
  [/^Invalid start of operand "(.*)"$/i, (m) => `Falta un valor antes de "${m[1]}"`],
  [/^Invalid newline encountered while parsing$/i, () => 'Salto de línea inesperado: falta cerrar comillas o corchetes'],
  [/^Invalid column type$/i, () => 'Tipo de columna inválido'],
  [/^Invalid (.+)$/i, (m) => `${m[1]} inválido`],
  [/^Inline column settings can only be `pk` or `unique`$/i, () => 'Las propiedades de la columna deben ir entre corchetes: [not null, ...]'],
  [/^These fields must be some inline settings optionally ended with a setting list$/i, () => 'Después del tipo solo pueden ir propiedades de la columna entre corchetes'],
  [/^Table or schema '(.+)' does not exist$/i, (m) => `La tabla o el schema '${m[1]}' no existe`],
  [/^Table '(.+)' does not exist in Schema '(.+)'$/i, (m) => `La tabla '${m[1]}' no existe en el schema '${m[2]}'`],
  [/^Schema '(.+)' does not exist.*$/i, (m) => `El schema '${m[1]}' no existe`],
  [/^Table '(.+)' already exists in schema '(.+)'$/i, (m) => `La tabla '${m[1]}' ya existe en el schema '${m[2]}'`],
  [/^Enum '(.+)' already exists.*$/i, (m) => `El enum '${m[1]}' ya existe`],
  [/^No column named '(.+)' inside Table '(.+)'$/i, (m) => `La tabla '${m[2]}' no tiene una columna '${m[1]}'`],
  [/^Column '(.+)' does not exist in Table '(.+)'$/i, (m) => `La columna '${m[1]}' no existe en la tabla '${m[2]}'`],
  [/^Column '(.+)' does not exist.*$/i, (m) => `La columna '${m[1]}' no existe`],
  [/^Duplicate column (.+)$/i, (m) => `Columna duplicada ${m[1]}`],
  [/^Column name '?(.+?)'? (?:is )?duplicated.*$/i, (m) => `La columna '${m[1]}' está duplicada`],
  [/^Reference with the same endpoints already exists$/i, () => 'Ya existe una relación entre esas mismas columnas'],
  [/^References with same endpoints exist$/i, () => 'Ya existe una relación entre esas mismas columnas'],
  [/^A Table must have at least one column$/i, () => 'La tabla debe tener al menos una columna'],
  [/^no viable alternative at input '(.*)'$/i, (m) => `Sintaxis no reconocida cerca de '${m[1]}'`],
  [/^mismatched input '(.*)' expecting (.+)$/i, (m) => `Se encontró '${m[1]}' pero se esperaba ${m[2]}`],
  [/^missing (.+) at '(.*)'$/i, (m) => `Falta ${m[1]} antes de '${m[2]}'`],
  [/^extraneous input '(.*)' expecting (.+)$/i, (m) => `Sobra '${m[1]}'; se esperaba ${m[2]}`],
]

export function translateParserMessage(message: string): string {
  const text = message.trim()
  for (const [re, fn] of RULES) {
    const m = re.exec(text)
    if (m) return fn(m)
  }
  return message
}
