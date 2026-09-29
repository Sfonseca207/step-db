export interface DiffLine {
  text: string
  /** `same`: está en ambos lados; `changed`: solo en este lado. */
  kind: 'same' | 'changed'
}

/**
 * Diff por líneas (subsecuencia común más larga). Devuelve ambos textos con
 * las líneas propias de cada lado marcadas. Para textos enormes se omite el
 * cálculo y se marca todo como cambiado desde la primera diferencia.
 */
export function diffLines(left: string, right: string): { left: DiffLine[]; right: DiffLine[] } {
  const a = left.split('\n')
  const b = right.split('\n')
  if (a.length * b.length > 4_000_000) {
    let i = 0
    while (i < a.length && i < b.length && a[i] === b[i]) i++
    const mark = (lines: string[]) => lines.map((text, k) => ({ text, kind: k < i ? ('same' as const) : ('changed' as const) }))
    return { left: mark(a), right: mark(b) }
  }
  // lcs[i][j] = longitud de la subsecuencia común de a[i..] y b[j..]
  const lcs: Uint32Array[] = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const outLeft: DiffLine[] = []
  const outRight: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      outLeft.push({ text: a[i++], kind: 'same' })
      outRight.push({ text: b[j++], kind: 'same' })
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      outLeft.push({ text: a[i++], kind: 'changed' })
    } else {
      outRight.push({ text: b[j++], kind: 'changed' })
    }
  }
  while (i < a.length) outLeft.push({ text: a[i++], kind: 'changed' })
  while (j < b.length) outRight.push({ text: b[j++], kind: 'changed' })
  return { left: outLeft, right: outRight }
}
