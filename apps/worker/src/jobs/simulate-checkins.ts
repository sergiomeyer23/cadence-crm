import {
  RECENT_CONTACT_DAYS,
  attendanceProbability,
  checkIns,
  contacts,
  planCheckIns,
  rngFor,
  students,
  timelineEvent,
  timelineEvents,
  workspaces,
  type Db,
  type NewTimelineEvent,
  type Rng,
} from '@cadence/db';
import { DAY_MS, workspaceNow, type SimulateCheckInsJobData } from '@cadence/shared';
import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

export interface SimulationResult {
  simulated: boolean;
  toOffsetDays: number;
  checkIns: number;
}

/**
 * Avança o relógio do workspace em 7 dias e gera os treinos dessa semana.
 *
 * O avanço só acontece se o relógio ainda estiver no deslocamento visto no
 * clique. Um retry do mesmo job, ou dois cliques seguidos, não simulam a
 * mesma semana duas vezes.
 */
export async function simulateWeek(
  db: Db,
  data: SimulateCheckInsJobData,
  options: { rng?: Rng; realNow?: Date } = {},
): Promise<SimulationResult> {
  // A mesma semana do mesmo workspace sempre sorteia os mesmos treinos.
  const rng = options.rng ?? rngFor(`${data.workspaceId}:${data.fromOffsetDays}`);
  const realNow = options.realNow ?? new Date();
  const toOffsetDays = data.fromOffsetDays + 7;

  return db.transaction(async (tx) => {
    const [workspace] = await tx
      .update(workspaces)
      .set({ clockOffsetDays: toOffsetDays })
      .where(and(eq(workspaces.id, data.workspaceId), eq(workspaces.clockOffsetDays, data.fromOffsetDays)))
      .returning();
    if (!workspace) return { simulated: false, toOffsetDays, checkIns: 0 };

    const from = workspaceNow(data.fromOffsetDays, realNow);
    const to = workspaceNow(toOffsetDays, realNow);
    const weekIndex = toOffsetDays / 7;

    const [roster, contacted] = await Promise.all([
      tx
        .select()
        .from(students)
        .where(and(eq(students.workspaceId, workspace.id), isNull(students.archivedAt), isNull(students.pausedAt))),
      tx
        .selectDistinct({ studentId: contacts.studentId })
        .from(contacts)
        .where(
          and(
            eq(contacts.workspaceId, workspace.id),
            gte(contacts.contactedAt, new Date(from.getTime() - RECENT_CONTACT_DAYS * DAY_MS)),
            lte(contacts.contactedAt, from),
          ),
        ),
    ]);
    const recentlyContacted = new Set(contacted.map((c) => c.studentId));

    const checkInRows: (typeof checkIns.$inferInsert)[] = [];
    const eventRows: NewTimelineEvent[] = [];
    for (const student of roster) {
      const probability = attendanceProbability(student.simProfile, weekIndex, recentlyContacted.has(student.id), rng);
      const start = student.trackingSince > from ? student.trackingSince : from;
      for (const occurredAt of planCheckIns({ from: start, to, weeklyGoal: student.weeklyGoal, probability, rng })) {
        const id = randomUUID();
        const base = { workspaceId: workspace.id, studentId: student.id, occurredAt };
        checkInRows.push({ id, ...base, source: 'SIMULATION' });
        eventRows.push(timelineEvent('CHECK_IN', base, { checkInId: id, source: 'SIMULATION' }));
      }
    }

    if (checkInRows.length > 0) {
      await tx.insert(checkIns).values(checkInRows);
      await tx.insert(timelineEvents).values(eventRows);
    }
    return { simulated: true, toOffsetDays, checkIns: checkInRows.length };
  });
}
