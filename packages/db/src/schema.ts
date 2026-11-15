import {
  CHECK_IN_SOURCES,
  CONTACT_CHANNELS,
  RETENTION_STATUSES,
  ROLES,
  SIM_PROFILES,
  TIMELINE_EVENT_TYPES,
  WORKSPACE_KINDS,
  type WeeklyReportData,
} from '@cadence/shared';
import {
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const workspaceKind = pgEnum('workspace_kind', WORKSPACE_KINDS);
export const userRole = pgEnum('user_role', ROLES);
export const retentionStatus = pgEnum('retention_status', RETENTION_STATUSES);
export const contactChannel = pgEnum('contact_channel', CONTACT_CHANNELS);
export const checkInSource = pgEnum('check_in_source', CHECK_IN_SOURCES);
export const timelineEventType = pgEnum('timeline_event_type', TIMELINE_EVENT_TYPES);
export const simProfile = pgEnum('sim_profile', SIM_PROFILES);

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  kind: workspaceKind('kind').notNull(),
  clockOffsetDays: integer('clock_offset_days').notNull().default(0),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: userRole('role').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_key').on(t.email), index('users_workspace_idx').on(t.workspaceId)],
);

export const sessions = pgTable(
  'sessions',
  {
    // Guardamos só o hash do token; o valor em si fica apenas no cookie.
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamptz('expires_at').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    coachId: uuid('coach_id').references(() => users.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    notes: text('notes'),
    weeklyGoal: smallint('weekly_goal').notNull(),
    startedOn: date('started_on', { mode: 'string' }).notNull(),
    trackingSince: timestamptz('tracking_since').notNull(),
    status: retentionStatus('status').notNull().default('ACTIVE'),
    statusChangedAt: timestamptz('status_changed_at').notNull().defaultNow(),
    pausedAt: timestamptz('paused_at'),
    pauseReason: text('pause_reason'),
    // Usado só pelo job de simulação para decidir quem treina na semana.
    simProfile: simProfile('sim_profile').notNull().default('STEADY'),
    archivedAt: timestamptz('archived_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('students_workspace_status_idx').on(t.workspaceId, t.status),
    index('students_workspace_coach_idx').on(t.workspaceId, t.coachId),
  ],
);

export const checkIns = pgTable(
  'check_ins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    occurredAt: timestamptz('occurred_at').notNull(),
    source: checkInSource('source').notNull(),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('check_ins_student_occurred_idx').on(t.studentId, t.occurredAt),
    index('check_ins_workspace_occurred_idx').on(t.workspaceId, t.occurredAt),
  ],
);

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    channel: contactChannel('channel').notNull(),
    note: text('note').notNull(),
    contactedAt: timestamptz('contacted_at').notNull(),
    followUpOn: date('follow_up_on', { mode: 'string' }),
    followUpDoneAt: timestamptz('follow_up_done_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('contacts_student_contacted_idx').on(t.studentId, t.contactedAt),
    index('contacts_workspace_follow_up_idx').on(t.workspaceId, t.followUpOn),
  ],
);

export const timelineEvents = pgTable(
  'timeline_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    type: timelineEventType('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    occurredAt: timestamptz('occurred_at').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('timeline_student_occurred_idx').on(t.studentId, t.occurredAt),
    index('timeline_workspace_type_occurred_idx').on(t.workspaceId, t.type, t.occurredAt),
  ],
);

export const weeklyReports = pgTable(
  'weekly_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    data: jsonb('data').$type<WeeklyReportData>().notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  // Um relatório por workspace e data de fechamento: rodar de novo só atualiza.
  (t) => [uniqueIndex('weekly_reports_workspace_period_key').on(t.workspaceId, t.periodEnd)],
);

export type Workspace = typeof workspaces.$inferSelect;
export type User = typeof users.$inferSelect;
export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
export type CheckIn = typeof checkIns.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type TimelineEvent = typeof timelineEvents.$inferSelect;
export type NewTimelineEvent = typeof timelineEvents.$inferInsert;
