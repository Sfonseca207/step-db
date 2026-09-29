import { CLIENT_ID_HEADER } from '../core/api.ts'

/** Identifica las escrituras de esta pestaña para ignorar su eco por WebSocket. */
export const CLIENT_ID = crypto.randomUUID()

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { [CLIENT_ID_HEADER]: CLIENT_ID }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    const message =
      (data as { error?: { message?: string } } | null)?.error?.message ?? `Error ${res.status}`
    throw new ApiError(res.status, message, data)
  }
  return data as T
}

/** Como `api`, pero devuelve status y cuerpo sin lanzar en 409/422 (guardado de archivos). */
export async function apiRaw<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(path, {
    method,
    headers: { [CLIENT_ID_HEADER]: CLIENT_ID, 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => null)) as T
  if (!res.ok && res.status !== 409 && res.status !== 422) {
    const message = (data as { error?: { message?: string } } | null)?.error?.message ?? `Error ${res.status}`
    throw new ApiError(res.status, message, data)
  }
  return { status: res.status, data }
}
