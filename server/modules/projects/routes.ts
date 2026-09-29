import { Hono } from 'hono'
import { z } from 'zod'
import { ConventionsSchema, LayoutSchema } from '../../../src/core/schemas.ts'
import type { AuthVars } from '../../middleware/auth.ts'
import { clientIdOf, parseJson } from '../../lib/validate.ts'
import { listActivity } from '../files/service.ts'
import {
  createExampleProject,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateLayout,
  updateProject,
} from './service.ts'

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullish(),
})

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  conventions: ConventionsSchema.optional(),
  conventionsMd: z.string().max(20000).optional(),
  activeStepId: z.uuid().nullable().optional(),
})

const LayoutPatchSchema = z.object({
  positions: LayoutSchema.shape.positions.optional(),
  removed: z.array(z.string().max(300)).max(2000).optional(),
  viewport: LayoutSchema.shape.viewport.optional(),
})

export const projectRoutes = new Hono<AuthVars>()
  .get('/', async (c) => c.json(await listProjects(c.get('userId'))))
  .post('/', async (c) => {
    const body = await parseJson(c, CreateSchema)
    return c.json(await createProject(c.get('userId'), body), 201)
  })
  .post('/example', async (c) => c.json(await createExampleProject(c.get('userId')), 201))
  .get('/:id', async (c) => c.json(await getProject(c.get('userId'), c.req.param('id'))))
  .patch('/:id', async (c) => {
    const body = await parseJson(c, PatchSchema)
    return c.json(await updateProject(c.get('userId'), c.req.param('id'), body, 'ui', clientIdOf(c)))
  })
  .delete('/:id', async (c) => {
    await deleteProject(c.get('userId'), c.req.param('id'), clientIdOf(c))
    return c.body(null, 204)
  })
  .put('/:id/layout', async (c) => {
    const body = await parseJson(c, LayoutPatchSchema)
    return c.json(await updateLayout(c.get('userId'), c.req.param('id'), body, clientIdOf(c)))
  })
  .get('/:id/activity', async (c) => c.json(await listActivity(c.get('userId'), c.req.param('id'))))
