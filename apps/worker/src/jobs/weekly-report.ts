import { checkIns, contacts, students, timelineEvents, weeklyReports, workspaces, type Db, type Workspace } from '@retention/db';
import {
  DAY_MS,
  RETENTION_STATUSES,
  addDaysToLocalDate,
  toLocalDate,
  workspaceNow,
  type RetentionStatus,
  type WeeklyReportData,
} from '@retention/shared';
import { and, count, eq, gt, isNull, lte, notExists, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

async function reportFor(db: Db, workspace: Workspace, now: Date): Promise<WeeklyReportData> {
  const since = new Date(now.getTime() - 7 * DAY_MS);
  const inPeriod = (column: AnyPgColumn) => and(gt(column, since), lte(column, now));

  const [statusRows, [checkInCount], [contactCount], transitions, atRisk] = await Promise.all([
    db
      .select({ status: students.status, total: count() })
      .from(students)
      .where(and(eq(students.workspaceId, workspace.id), isNull(students.archivedAt)))
      .groupBy(students.status),
    db
      .select({ total: count() })
      .from(checkIns)
      .where(and(eq(checkIns.workspaceId, workspace.id), inPeriod(checkIns.occurredAt))),
    db
      .select({ total: count() })
      .from(contacts)
      .where(and(eq(contacts.workspaceId, workspace.id), inPeriod(contacts.contactedAt))),
    db
      .select({
        to: sql<RetentionStatus>`${timelineEvents.payload}->>'to'`,
        from: sql<RetentionStatus>`${timelineEvents.payload}->>'from'`,
      })
      .from(timelineEvents)
      .where(
        and(
          eq(timelineEvents.workspaceId, workspace.id),
          eq(timelineEvents.type, 'STATUS_CHANGED'),
          inPeriod(timelineEvents.occurredAt),
        ),
      ),
    db
      .select({ id: students.id, name: students.name })
      .from(students)
      .where(
        and(
          eq(students.workspaceId, workspace.id),
          isNull(students.archivedAt),
          eq(students.status, 'AT_RISK'),
          notExists(
            db
              .select({ one: sql`1` })
              .from(contacts)
              .where(and(eq(contacts.studentId, students.id), inPeriod(contacts.contactedAt))),
          ),
        ),
      )
      .orderBy(students.name),
  ]);

  const statusCounts = Object.fromEntries(RETENTION_STATUSES.map((s) => [s, 0])) as Record<RetentionStatus, number>;
  for (const row of statusRows) statusCounts[row.status] = row.total;

  return {
    statusCounts,
    checkIns: checkInCount?.total ?? 0,
    contacts: contactCount?.total ?? 0,
    movedToRisk: transitions.filter((t) => t.to === 'AT_RISK').length,
    recovered: transitions.filter((t) => t.to === 'ACTIVE' && (t.from === 'WARNING' || t.from === 'AT_RISK')).length,
    atRiskWithoutContact: atRisk,
  };
}

/**
 * Gera o resumo dos últimos 7 dias de cada workspace. A chave é a data de
 * fechamento, então rodar duas vezes no mesmo dia só atualiza o relatório.
 */
export async function generateWeeklyReports(
  db: Db,
  options: { workspaceId?: string; realNow?: Date } = {},
): Promise<number> {
  const targets = options.workspaceId
    ? await db.select().from(workspaces).where(eq(workspaces.id, options.workspaceId))
    : await db.select().from(workspaces);

  for (const workspace of targets) {
    const now = workspaceNow(workspace.clockOffsetDays, options.realNow);
    const periodEnd = toLocalDate(now);
    const periodStart = addDaysToLocalDate(periodEnd, -7);
    const data = await reportFor(db, workspace, now);

    await db
      .insert(weeklyReports)
      .values({ workspaceId: workspace.id, periodStart, periodEnd, data })
      .onConflictDoUpdate({
        target: [weeklyReports.workspaceId, weeklyReports.periodEnd],
        set: { periodStart, data, createdAt: new Date() },
      });
  }

  return targets.length;
}
