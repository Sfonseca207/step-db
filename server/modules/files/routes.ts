import { Hono } from 'hono'
import { z } from 'zod'
import { FILE_KINDS, type FileKind } from '../../../src/core/types.ts'
import type { AuthVars } from '../../middleware/auth.ts'
import { notFound } from '../../lib/errors.ts'
import { clientIdOf, parseJson } from '../../lib/validate.ts'
import { listRevisions, writeStepFile } from './service.ts'

const WriteSchema = z.object({
  content: z.string().max(1024 * 1024),
  version: z.number().int().min(0),
})

function kindOf(value: string): FileKind {
  if (!(FILE_KINDS as readonly string[]).includes(value)) throw notFound('Archivo')
  return value as FileKind
}

/** Rutas bajo /api/steps/:id/files */
export const fileRoutes = new Hono<AuthVars>()
  .put('/:id/files/:kind', async (c) => {
    const kind = kindOf(c.req.param('kind'))
    const body = await parseJson(c, WriteSchema)
    const result = await writeStepFile(c.req.param('id'), kind, body, {
      userId: c.get('userId'),
      source: 'ui',
      clientId: clientIdOf(c),
      authorName: c.get('userName') ?? null,
    })
    if (result.ok) return c.json(result)
    return c.json(result, result.error === 'conflict' ? 409 : 422)
  })
  .get('/:id/files/:kind/revisions', async (c) => {
    const kind = kindOf(c.req.param('kind'))
    return c.json(await listRevisions(c.get('userId'), c.req.param('id'), kind))
  })
