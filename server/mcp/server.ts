import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { EXPORT_TARGETS } from '../../src/core/export/index.ts'
import { lintModel } from '../../src/core/lint.ts'
import { buildProjectModel, formatDiagnostic } from '../../src/core/model.ts'
import { FILE_KINDS, STEP_STATUSES, type ColumnModel, type Diagnostic, type TableModel } from '../../src/core/types.ts'
import { HttpError } from '../lib/errors.ts'
import { hub } from '../realtime/hub.ts'
import { exportProject } from '../modules/export/service.ts'
import { loadProjectModel, writeStepFile } from '../modules/files/service.ts'
import { assertProjectAccess, getProject, listProjects } from '../modules/projects/service.ts'
import { createStep, updateStep } from '../modules/steps/service.ts'
import { AGENT_GUIDE } from './guide.ts'

const text = (value: string): CallToolResult => ({ content: [{ type: 'text', text: value }] })
const json = (value: unknown): CallToolResult => text(JSON.stringify(value, null, 2))
const fail = (message: string): CallToolResult => ({ content: [{ type: 'text', text: message }], isError: true })

const projectIdParam = z
  .string()
  .optional()
  .describe('Id del proyecto. Opcional si el usuario tiene un solo proyecto.')
const stepParam = z.string().optional().describe('Id o slug del step (p. ej. "02-facturacion"). Por defecto, el step activo.')
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const ColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)

async function resolveProject(userId: string, projectId?: string): Promise<string> {
  if (projectId) {
    await assertProjectAccess(userId, projectId)
    return projectId
  }
  const projects = await listProjects(userId)
  if (projects.length === 1) return projects[0].id
  throw new HttpError(
    400,
    'project_required',
    projects.length === 0
      ? 'No tienes proyectos. Crea uno desde la UI de StepDB.'
      : `Indica projectId. Proyectos: ${projects.map((p) => `${p.name} (${p.id})`).join(', ')}`,
  )
}

async function resolveStep(userId: string, projectId: string, step?: string) {
  const project = await getProject(userId, projectId)
  const found = step
    ? project.steps.find((s) => s.id === step || s.slug === step)
    : project.steps.find((s) => s.id === project.activeStepId)
  if (!found) {
    throw new HttpError(
      404,
      'not_found',
      step
        ? `Step '${step}' no encontrado. Steps: ${project.steps.map((s) => s.slug).join(', ')}`
        : 'El proyecto no tiene step activo; indica `step`.',
    )
  }
  return { project, step: found }
}

function columnCompact(c: ColumnModel, fk?: string): string {
  const flags = [c.pk ? 'pk' : '', c.increment ? 'inc' : '', c.notNull && !c.pk ? 'nn' : '', c.unique ? 'uq' : ''].filter(Boolean)
  return `${c.name} ${c.type}${flags.length ? ` ${flags.join(',')}` : ''}${fk ? ` →${fk}` : ''}`
}

/** Envuelve una tool: errores de servicio → resultado de error legible. */
function safe<A>(fn: (args: A) => Promise<CallToolResult>) {
  return async (args: A): Promise<CallToolResult> => {
    try {
      return await fn(args)
    } catch (err) {
      if (err instanceof HttpError) return fail(err.message)
      console.error('[mcp]', err)
      return fail('Error interno del servidor')
    }
  }
}

/** Crea el servidor MCP para el dueño del token (modo stateless: uno por petición). */
export function createMcpServer(userId: string): McpServer {
  const server = new McpServer(
    { name: 'stepdb', version: '0.1.0' },
    { instructions: 'StepDB: modelado de bases de datos por steps. Llama primero a get_guide y luego a get_project_overview.' },
  )

  server.registerTool(
    'list_projects',
    { title: 'Listar proyectos', description: 'Proyectos del usuario dueño del token.', annotations: { readOnlyHint: true } },
    safe(async () => json(await listProjects(userId))),
  )

  server.registerTool(
    'get_guide',
    {
      title: 'Guía de StepDB',
      description:
        'Guía de uso para agentes: formato de StepDB, convenciones DBML propias, cómo agregar columnas a tablas de otro step, cómo modelar Mongo y el flujo recomendado. Léela primero.',
      annotations: { readOnlyHint: true },
    },
    safe(async () => text(AGENT_GUIDE)),
  )

  server.registerTool(
    'get_project_overview',
    {
      title: 'Resumen del proyecto',
      description: 'Nombre, convenciones, steps (con el activo) y, por step, sus tablas y colecciones con columnas en formato compacto.',
      inputSchema: { projectId: projectIdParam },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ projectId }: { projectId?: string }) => {
      const id = await resolveProject(userId, projectId)
      const { project, steps, conventions, model, errors } = await loadProjectModel(userId, id)
      const fkOf = new Map<string, string>()
      for (const r of model?.relations ?? []) {
        r.from.columns.forEach((c, i) =>
          fkOf.set(`${r.from.table}.${c}`, `${r.to.table}.${r.to.columns[i] ?? r.to.columns[0]}${r.kind === 'logical' ? ' (lógica)' : ''}`),
        )
      }
      const describe = (t: TableModel) => ({
        table: t.key,
        store: t.store,
        ...(t.note ? { note: t.note } : {}),
        columns: t.columns.map((c) => columnCompact(c, fkOf.get(`${t.key}.${c.name}`))),
      })
      return json({
        id: project.id,
        name: project.name,
        description: project.description,
        conventions,
        conventionsMd: project.conventionsMd,
        activeStep: steps.find((s) => s.id === project.activeStepId)?.slug ?? null,
        valid: errors.length === 0,
        errors: errors.map(formatDiagnostic),
        steps: steps.map((s) => ({
          slug: s.slug,
          name: s.name,
          date: s.workDate,
          status: s.status,
          color: s.color,
          description: s.description,
          versions: Object.fromEntries(FILE_KINDS.map((k) => [k, s.files[k].version])),
          tables: (model?.tables ?? []).filter((t) => t.stepId === s.id).map(describe),
          columnsAddedToOtherSteps: (model?.tables ?? []).flatMap((t) =>
            t.stepId === s.id ? [] : t.columns.filter((c) => c.stepId === s.id).map((c) => `${t.key}.${c.name}`),
          ),
        })),
      })
    }),
  )

  server.registerTool(
    'get_step',
    {
      title: 'Leer step',
      description: 'Contenido y versión de los cuatro archivos (model, mongo, views, notes) de un step.',
      inputSchema: { projectId: projectIdParam, step: stepParam },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ projectId, step }: { projectId?: string; step?: string }) => {
      const id = await resolveProject(userId, projectId)
      const { step: s } = await resolveStep(userId, id, step)
      return json({
        id: s.id,
        slug: s.slug,
        name: s.name,
        date: s.workDate,
        status: s.status,
        color: s.color,
        description: s.description,
        files: Object.fromEntries(FILE_KINDS.map((k) => [k, { version: s.files[k].version, content: s.files[k].content }])),
      })
    }),
  )

  server.registerTool(
    'create_step',
    {
      title: 'Crear step',
      description: 'Crea un step al final de la línea de tiempo y lo deja activo. El slug es NN-nombre.',
      inputSchema: {
        projectId: projectIdParam,
        name: z.string().min(1).max(120),
        description: z.string().max(2000).optional(),
        date: DateSchema.optional().describe('AAAA-MM-DD; hoy por defecto'),
        color: ColorSchema.optional().describe('#RRGGBB; siguiente de la paleta por defecto'),
      },
    },
    safe(async (a: { projectId?: string; name: string; description?: string; date?: string; color?: string }) => {
      const id = await resolveProject(userId, a.projectId)
      const s = await createStep(userId, id, { name: a.name, description: a.description, workDate: a.date, color: a.color }, 'mcp', null)
      return json({ id: s.id, slug: s.slug, name: s.name, color: s.color, active: true })
    }),
  )

  server.registerTool(
    'update_step',
    {
      title: 'Editar step',
      description: 'Edita metadatos de un step (el slug no cambia).',
      inputSchema: {
        projectId: projectIdParam,
        step: z.string().describe('Id o slug del step'),
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(2000).optional(),
        date: DateSchema.optional(),
        color: ColorSchema.optional(),
        status: z.enum(STEP_STATUSES).optional(),
      },
    },
    safe(
      async (a: {
        projectId?: string
        step: string
        name?: string
        description?: string
        date?: string
        color?: string
        status?: 'en_curso' | 'completado'
      }) => {
        const id = await resolveProject(userId, a.projectId)
        const { step } = await resolveStep(userId, id, a.step)
        const s = await updateStep(
          userId,
          step.id,
          { name: a.name, description: a.description, workDate: a.date, color: a.color, status: a.status },
          'mcp',
          null,
        )
        return json({ id: s.id, slug: s.slug, name: s.name, status: s.status, color: s.color, date: s.workDate })
      },
    ),
  )

  server.registerTool(
    'write_step_file',
    {
      title: 'Escribir archivo de step',
      description:
        'Escribe el contenido COMPLETO de model | mongo | views | notes con la version leída (get_step). Valida el proyecto completo antes de guardar; si hay errores rechaza con archivo:línea. Devuelve versión nueva, diff y advertencias del linter.',
      inputSchema: {
        projectId: projectIdParam,
        step: stepParam,
        kind: z.enum(FILE_KINDS),
        content: z.string().max(1024 * 1024),
        version: z.number().int().min(0).describe('Versión que leíste con get_step'),
      },
    },
    safe(async (a: { projectId?: string; step?: string; kind: (typeof FILE_KINDS)[number]; content: string; version: number }) => {
      const id = await resolveProject(userId, a.projectId)
      const { step } = await resolveStep(userId, id, a.step)
      const result = await writeStepFile(step.id, a.kind, { content: a.content, version: a.version }, {
        userId,
        source: 'mcp',
        clientId: null,
        authorName: 'Claude',
      })
      if (result.ok) {
        return json({
          ok: true,
          step: step.slug,
          kind: a.kind,
          version: result.version,
          summary: result.summary,
          diff: result.diff,
          warnings: result.warnings.map(formatDiagnostic),
        })
      }
      if (result.error === 'conflict') {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Conflicto: el archivo cambió (versión actual ${result.current.version}). Vuelve a leerlo con get_step, aplica tu cambio y reintenta con esa versión.`,
            },
          ],
        }
      }
      return fail(`No se guardó: el modelo no es válido.\n${result.errors.map((e: Diagnostic) => formatDiagnostic(e)).join('\n')}`)
    }),
  )

  server.registerTool(
    'validate_project',
    {
      title: 'Validar proyecto',
      description:
        'Errores y advertencias del linter sin guardar nada. Opcionalmente prueba un contenido candidato para un archivo (step + kind + content).',
      inputSchema: {
        projectId: projectIdParam,
        step: stepParam,
        kind: z.enum(['model', 'mongo']).optional(),
        content: z.string().max(1024 * 1024).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async (a: { projectId?: string; step?: string; kind?: 'model' | 'mongo'; content?: string }) => {
      const id = await resolveProject(userId, a.projectId)
      const { steps, conventions } = await loadProjectModel(userId, id)
      let target: string | undefined
      if (a.content !== undefined) {
        if (!a.kind) return fail('Para probar un contenido indica también `kind` (model | mongo).')
        target = (await resolveStep(userId, id, a.step)).step.id
      }
      const sources = steps.map((s) => ({
        id: s.id,
        slug: s.slug,
        position: s.position,
        files: {
          model: target === s.id && a.kind === 'model' ? a.content! : s.files.model.content,
          mongo: target === s.id && a.kind === 'mongo' ? a.content! : s.files.mongo.content,
        },
      }))
      const result = buildProjectModel(sources, conventions)
      const slug = new Map(steps.map((s) => [s.id, s.slug]))
      const warnings = result.model ? lintModel(result.model, conventions) : []
      return json({
        valid: result.errors.length === 0,
        errors: result.errors.map(formatDiagnostic),
        warnings: warnings.map((w) => formatDiagnostic({ ...w, stepSlug: w.stepId ? slug.get(w.stepId) : undefined })),
      })
    }),
  )

  server.registerTool(
    'export',
    {
      title: 'Exportar',
      description: 'Exporta el modelo: mssql (T-SQL), mongo (mongosh) o dbml (combinado para dbdiagram). step opcional = script incremental del step.',
      inputSchema: {
        projectId: projectIdParam,
        target: z.enum(EXPORT_TARGETS),
        step: z.string().optional().describe('Id o slug del step; vacío = modelo completo'),
        idempotent: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async (a: { projectId?: string; target: (typeof EXPORT_TARGETS)[number]; step?: string; idempotent?: boolean }) => {
      const id = await resolveProject(userId, a.projectId)
      const { text: out } = await exportProject(userId, id, a.target, { step: a.step, idempotent: a.idempotent })
      return text(out)
    }),
  )

  server.registerTool(
    'focus',
    {
      title: 'Enfocar en la UI',
      description: 'Pide a la UI abierta centrar y resaltar una tabla (schema.tabla) o un step.',
      inputSchema: {
        projectId: projectIdParam,
        table: z.string().optional().describe('schema.tabla'),
        step: z.string().optional().describe('Id o slug del step'),
      },
    },
    safe(async (a: { projectId?: string; table?: string; step?: string }) => {
      const id = await resolveProject(userId, a.projectId)
      if (!a.table && !a.step) return fail('Indica `table` o `step`.')
      const stepId = a.step ? (await resolveStep(userId, id, a.step)).step.id : undefined
      hub.publish({ type: 'ui.focus', projectId: id, ...(a.table ? { table: a.table } : {}), ...(stepId ? { stepId } : {}) })
      return text(`Foco enviado a ${hub.count(id)} ${hub.count(id) === 1 ? 'pestaña abierta' : 'pestañas abiertas'}.`)
    }),
  )

  return server
}
