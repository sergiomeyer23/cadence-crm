import { contacts, evaluateStudents, users, type Executor, type StudentEvaluation, type Workspace } from '@cadence/db';
import {
  toLocalDate,
  type FrequencyRuleConfig,
  type OpenFollowUp,
  type RadarCard,
  type StudentDetail,
} from '@cadence/shared';
import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';

const round1 = (value: number) => Math.round(value * 10) / 10;

interface CardOptions {
  now: Date;
  rule: FrequencyRuleConfig;
  studentIds?: string[];
  coachId?: string;
}

function toCard(
  { student, evaluation, lastCheckInAt }: StudentEvaluation,
  coachNames: Map<string, string>,
  nextFollowUpOn: string | null,
  today: string,
): RadarCard {
  return {
    id: student.id,
    name: student.name,
    status: student.status,
    statusChangedAt: student.statusChangedAt.toISOString(),
    coach: student.coachId ? { id: student.coachId, name: coachNames.get(student.coachId) ?? '' } : null,
    weeklyGoal: student.weeklyGoal,
    lastCheckInAt: lastCheckInAt?.toISOString() ?? null,
    daysAbsent: round1(evaluation.daysAbsent),
    checkInsInWindow: evaluation.checkInsInWindow,
    expectedInWindow: evaluation.expectedInWindow === null ? null : round1(evaluation.expectedInWindow),
    adherence: evaluation.adherence === null ? null : Math.round(evaluation.adherence * 100) / 100,
    reasons: evaluation.reasons,
    nextFollowUpOn,
    followUpOverdue: nextFollowUpOn !== null && nextFollowUpOn < today,
    pauseReason: student.pauseReason,
  };
}

async function openFollowUps(db: Executor, workspaceId: string, studentIds: string[]) {
  return db
    .select({
      contactId: contacts.id,
      studentId: contacts.studentId,
      followUpOn: contacts.followUpOn,
      channel: contacts.channel,
      note: contacts.note,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        inArray(contacts.studentId, studentIds),
        isNotNull(contacts.followUpOn),
        isNull(contacts.followUpDoneAt),
      ),
    )
    .orderBy(asc(contacts.followUpOn));
}

async function coachNamesOf(db: Executor, workspaceId: string) {
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.workspaceId, workspaceId));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Monta os cards do Radar: status gravado pelo worker e métricas atuais da regra. */
export async function buildCards(db: Executor, workspace: Workspace, options: CardOptions): Promise<RadarCard[]> {
  const evaluations = await evaluateStudents(db, workspace, options);
  if (evaluations.length === 0) return [];

  const ids = evaluations.map((e) => e.student.id);
  const [followUps, coachNames] = await Promise.all([
    openFollowUps(db, workspace.id, ids),
    coachNamesOf(db, workspace.id),
  ]);

  const nextFollowUp = new Map<string, string>();
  for (const f of followUps) {
    if (f.followUpOn && !nextFollowUp.has(f.studentId)) nextFollowUp.set(f.studentId, f.followUpOn);
  }

  const today = toLocalDate(options.now);
  return evaluations.map((e) => toCard(e, coachNames, nextFollowUp.get(e.student.id) ?? null, today));
}

export async function buildDetail(
  db: Executor,
  workspace: Workspace,
  studentId: string,
  options: Omit<CardOptions, 'studentIds' | 'coachId'>,
): Promise<StudentDetail | null> {
  const [evaluation] = await evaluateStudents(db, workspace, { ...options, studentIds: [studentId] });
  if (!evaluation) return null;

  const [followUps, coachNames] = await Promise.all([
    openFollowUps(db, workspace.id, [studentId]),
    coachNamesOf(db, workspace.id),
  ]);
  const today = toLocalDate(options.now);
  const open: OpenFollowUp[] = followUps.map((f) => ({
    contactId: f.contactId,
    followUpOn: f.followUpOn!,
    channel: f.channel,
    note: f.note,
    overdue: f.followUpOn! < today,
  }));

  const { student } = evaluation;
  return {
    ...toCard(evaluation, coachNames, open[0]?.followUpOn ?? null, today),
    email: student.email,
    phone: student.phone,
    notes: student.notes,
    startedOn: student.startedOn,
    trackingSince: student.trackingSince.toISOString(),
    pausedAt: student.pausedAt?.toISOString() ?? null,
    openFollowUps: open,
  };
}
