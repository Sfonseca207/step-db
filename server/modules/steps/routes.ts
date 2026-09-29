import { Hono } from 'hono'
import { z } from 'zod'
import { STEP_STATUSES } from '../../../src/core/types.ts'
import type { AuthVars } from '../../middleware/auth.ts'
import { clientIdOf, parseJson } from '../../lib/validate.ts'
import { createStep, reorderSteps, updateStep } from './service.ts'

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD')
const ColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color #RRGGBB')

export const StepCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullish(),
  workDate: DateSchema.optional(),
  color: ColorSchema.optional(),
  status: z.enum(STEP_STATUSES).optional(),
})

export const StepPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  workDate: DateSchema.optional(),
  color: ColorSchema.optional(),
  status: z.enum(STEP_STATUSES).optional(),
})

const OrderSchema = z.object({ stepIds: z.array(z.uuid()).min(1).max(500) })

/** Rutas bajo /api/projects/:id/steps */
export const projectStepRoutes = new Hono<AuthVars>()
  .post('/:id/steps', async (c) => {
    const body = await parseJson(c, StepCreateSchema)
    return c.json(await createStep(c.get('userId'), c.req.param('id'), body, 'ui', clientIdOf(c)), 201)
  })
  .put('/:id/steps/order', async (c) => {
    const body = await parseJson(c, OrderSchema)
    return c.json(await reorderSteps(c.get('userId'), c.req.param('id'), body.stepIds, 'ui', clientIdOf(c)))
  })

/** Rutas bajo /api/steps */
export const stepRoutes = new Hono<AuthVars>().patch('/:id', async (c) => {
  const body = await parseJson(c, StepPatchSchema)
  return c.json(await updateStep(c.get('userId'), c.req.param('id'), body, 'ui', clientIdOf(c)))
})
