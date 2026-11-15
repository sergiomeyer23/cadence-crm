import {
  DAY_MS,
  DEFAULT_FREQUENCY_RULE,
  evaluateFrequency,
  workspaceNow,
  type FrequencyEvaluation,
  type FrequencyRuleConfig,
  type RetentionStatus,
} from '@retention/shared';
import { and, eq, gte, inArray, isNull, lte, max } from 'drizzle-orm';
import type { Db, Executor } from './client';
import { checkIns, students, workspaces, type Student, type Workspace } from './schema';
import { recordEvent } from './timeline';

export interface StudentEvaluation {
  student: Student;
  evaluation: FrequencyEvaluation;
  lastCheckInAt: Date | null;
}

interface EvaluateOptions {
  studentIds?: string[];
  coachId?: string;
  rule?: FrequencyRuleConfig;
  now?: Date;
}

/**
 * Carrega o necessário para aplicar a regra a vários alunos de uma vez:
 * os check-ins da janela e o último check-in de cada um (para medir ausência).
 */
export async function evaluateStudents(
  db: Executor,
  workspace: Pick<Workspace, 'id' | 'clockOffsetDays'>,
  options: EvaluateOptions = {},
): Promise<StudentEvaluation[]> {
  const rule = options.rule ?? DEFAULT_FREQUENCY_RULE;
  const now = options.now ?? workspaceNow(workspace.clockOffsetDays);

  const filters = [eq(students.workspaceId, workspace.id), isNull(students.archivedAt)];
  if (options.studentIds) filters.push(inArray(students.id, options.studentIds));
  if (options.coachId) filters.push(eq(students.coachId, options.coachId));

  const rows = await db.select().from(students).where(and(...filters)).orderBy(students.name);
  if (rows.length === 0) return [];

  const ids = rows.map((s) => s.id);
  const checkInFilters = [eq(checkIns.workspaceId, workspace.id), inArray(checkIns.studentId, ids)];
  const windowStart = new Date(now.getTime() - rule.windowDays * DAY_MS);

  const [recent, latest] = await Promise.all([
    db
      .select({ studentId: checkIns.studentId, occurredAt: checkIns.occurredAt })
      .from(checkIns)
      .where(and(...checkInFilters, gte(checkIns.occurredAt, windowStart), lte(checkIns.occurredAt, now))),
    db
      .select({ studentId: checkIns.studentId, last: max(checkIns.occurredAt) })
      .from(checkIns)
      .where(and(...checkInFilters, lte(checkIns.occurredAt, now)))
      .groupBy(checkIns.studentId),
  ]);

  const byStudent = new Map<string, Date[]>();
  for (const row of recent) {
    const list = byStudent.get(row.studentId) ?? [];
    list.push(row.occurredAt);
    byStudent.set(row.studentId, list);
  }
  const lastByStudent = new Map(latest.map((row) => [row.studentId, row.last]));

  return rows.map((student) => {
    const lastCheckInAt = lastByStudent.get(student.id) ?? null;
    const history = byStudent.get(student.id) ?? [];
    const evaluation = evaluateFrequency(
      {
        now,
        weeklyGoal: student.weeklyGoal,
        trackingSince: student.trackingSince,
        paused: student.pausedAt !== null,
        checkIns: lastCheckInAt ? [...history, lastCheckInAt] : history,
      },
      rule,
    );
    return { student, evaluation, lastCheckInAt };
  });
}

export interface StatusChange {
  studentId: string;
  from: RetentionStatus;
  to: RetentionStatus;
}

export interface RetentionAnalysisResult {
  workspaces: number;
  evaluated: number;
  changes: StatusChange[];
}

/**
 * Recalcula o status dos alunos e grava STATUS_CHANGED só quando o status muda.
 *
 * O UPDATE é condicionado ao status lido antes. Se duas análises rodarem ao
 * mesmo tempo, só a primeira altera a linha e registra o evento; a segunda não
 * encontra mais o status antigo e segue sem duplicar nada.
 */
export async function runRetentionAnalysis(
  db: Db,
  options: { workspaceId?: string; studentIds?: string[]; rule?: FrequencyRuleConfig; realNow?: Date } = {},
): Promise<RetentionAnalysisResult> {
  const targets = options.workspaceId
    ? await db.select().from(workspaces).where(eq(workspaces.id, options.workspaceId))
    : await db.select().from(workspaces);

  const result: RetentionAnalysisResult = { workspaces: targets.length, evaluated: 0, changes: [] };

  for (const workspace of targets) {
    const now = workspaceNow(workspace.clockOffsetDays, options.realNow);
    const evaluations = await evaluateStudents(db, workspace, {
      studentIds: options.studentIds,
      rule: options.rule,
      now,
    });
    result.evaluated += evaluations.length;

    for (const { student, evaluation } of evaluations) {
      if (evaluation.status === student.status) continue;
      const changed = await applyStatusChange(db, student, evaluation, now);
      if (changed) result.changes.push({ studentId: student.id, from: student.status, to: evaluation.status });
    }
  }

  return result;
}

async function applyStatusChange(
  db: Db,
  student: Student,
  evaluation: FrequencyEvaluation,
  now: Date,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(students)
      .set({ status: evaluation.status, statusChangedAt: now, updatedAt: new Date() })
      .where(and(eq(students.id, student.id), eq(students.status, student.status)))
      .returning({ id: students.id });

    if (updated.length === 0) return false;

    await recordEvent(
      tx,
      'STATUS_CHANGED',
      { workspaceId: student.workspaceId, studentId: student.id, occurredAt: now },
      {
        from: student.status,
        to: evaluation.status,
        reasons: evaluation.reasons,
        adherence: evaluation.adherence,
        daysAbsent: Math.round(evaluation.daysAbsent * 10) / 10,
      },
    );
    return true;
  });
}
