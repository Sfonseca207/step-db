import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import type { ModelDiff } from '../../src/core/types.ts'

/* ------------------------------------------------------------------ */
/* Better Auth (user, session, account, verification)                  */
/* ------------------------------------------------------------------ */

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_idx').on(t.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('account_user_idx').on(t.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)

/* ------------------------------------------------------------------ */
/* StepDB                                                              */
/* ------------------------------------------------------------------ */

export const apiToken = pgTable(
  'api_token',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    prefix: text('prefix').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('api_token_user_idx').on(t.userId)],
)

export const project = pgTable(
  'project',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    conventions: jsonb('conventions').notNull().default({}),
    conventionsMd: text('conventions_md').notNull().default(''),
    activeStepId: uuid('active_step_id').references((): AnyPgColumn => step.id, { onDelete: 'set null' }),
    layout: jsonb('layout').notNull().default({ positions: {}, viewport: null }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('project_owner_idx').on(t.ownerId)],
)

export const step = pgTable(
  'step',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references((): AnyPgColumn => project.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    position: integer('position').notNull(),
    name: text('name').notNull(),
    workDate: date('work_date', { mode: 'string' }).notNull(),
    color: text('color').notNull(),
    status: text('status', { enum: ['en_curso', 'completado'] }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('step_project_slug_uq').on(t.projectId, t.slug),
    index('step_project_position_idx').on(t.projectId, t.position),
    check('step_status_ck', sql`${t.status} in ('en_curso','completado')`),
  ],
)

export const stepFile = pgTable(
  'step_file',
  {
    stepId: uuid('step_id')
      .notNull()
      .references(() => step.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['model', 'mongo', 'views', 'notes'] }).notNull(),
    content: text('content').notNull().default(''),
    version: integer('version').notNull().default(1),
    updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.stepId, t.kind] }),
    check('step_file_kind_ck', sql`${t.kind} in ('model','mongo','views','notes')`),
  ],
)

export const revision = pgTable(
  'revision',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stepId: uuid('step_id')
      .notNull()
      .references(() => step.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['model', 'mongo', 'views', 'notes'] }).notNull(),
    version: integer('version').notNull(),
    content: text('content').notNull(),
    source: text('source', { enum: ['ui', 'mcp', 'api', 'seed'] }).notNull(),
    authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
    diff: jsonb('diff').$type<ModelDiff | null>(),
    summary: text('summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('revision_step_kind_created_idx').on(t.stepId, t.kind, t.createdAt.desc()),
    check('revision_source_ck', sql`${t.source} in ('ui','mcp','api','seed')`),
  ],
)

export type ProjectRow = typeof project.$inferSelect
export type StepRow = typeof step.$inferSelect
export type StepFileRow = typeof stepFile.$inferSelect
export type RevisionRow = typeof revision.$inferSelect
export type ApiTokenRow = typeof apiToken.$inferSelect
