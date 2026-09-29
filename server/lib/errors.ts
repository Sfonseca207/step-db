/** Error HTTP con código estable y detalle opcional para el cliente. */
export class HttpError extends Error {
  readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 500
  readonly code: string
  readonly details?: Record<string, unknown>

  constructor(
    status: HttpError['status'],
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export const notFound = (what = 'Recurso') => new HttpError(404, 'not_found', `${what} no encontrado`)
export const unauthorized = () => new HttpError(401, 'unauthorized', 'Autenticación requerida')
export const badRequest = (message: string, details?: Record<string, unknown>) =>
  new HttpError(400, 'bad_request', message, details)
