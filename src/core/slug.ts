/** "Recepción de ventas" → "recepcion-de-ventas". */
export function slugify(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
  return slug || 'step'
}

/** Slug de step `NN-slug-del-nombre` (RF-11). */
export function makeStepSlug(position: number, name: string): string {
  return `${String(position).padStart(2, '0')}-${slugify(name)}`
}

/** Número visible del step a partir de su posición (1-based). */
export function stepNumber(position: number): string {
  return String(position).padStart(2, '0')
}
