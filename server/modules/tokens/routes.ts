import { Hono } from 'hono'
import { z } from 'zod'
import { createApiToken, listApiTokens, revokeApiToken } from '../../auth/tokens.ts'
import type { AuthVars } from '../../middleware/auth.ts'
import { notFound } from '../../lib/errors.ts'
import { isUuid, parseJson } from '../../lib/validate.ts'

const CreateSchema = z.object({ name: z.string().trim().min(1).max(80) })

export const tokenRoutes = new Hono<AuthVars>()
  .get('/', async (c) => c.json(await listApiTokens(c.get('userId'))))
  .post('/', async (c) => {
    const { name } = await parseJson(c, CreateSchema)
    const { token, info } = await createApiToken(c.get('userId'), name)
    return c.json({ token, ...info }, 201)
  })
  .delete('/:id', async (c) => {
    const id = c.req.param('id')
    if (!isUuid(id)) throw notFound('Token')
    await revokeApiToken(c.get('userId'), id)
    return c.body(null, 204)
  })
