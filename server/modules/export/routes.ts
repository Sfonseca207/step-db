import { Hono } from 'hono'
import { EXPORT_EXTENSIONS, EXPORT_TARGETS, type ExportTarget } from '../../../src/core/export/index.ts'
import type { AuthVars } from '../../middleware/auth.ts'
import { notFound } from '../../lib/errors.ts'
import { exportProject } from './service.ts'

/** GET /api/projects/:id/export/:target?step=&idempotent=&download= */
export const exportRoutes = new Hono<AuthVars>().get('/:id/export/:target', async (c) => {
  const target = c.req.param('target')
  if (!(EXPORT_TARGETS as readonly string[]).includes(target)) throw notFound('Formato de exportación')
  const t = target as ExportTarget
  const { text, fileName } = await exportProject(c.get('userId'), c.req.param('id'), t, {
    step: c.req.query('step') || undefined,
    idempotent: c.req.query('idempotent') === '1' || c.req.query('idempotent') === 'true',
  })
  const headers: Record<string, string> = { 'content-type': 'text/plain; charset=utf-8' }
  if (c.req.query('download')) {
    headers['content-disposition'] = `attachment; filename="${fileName}.${EXPORT_EXTENSIONS[t]}"`
  }
  return c.body(text, 200, headers)
})
