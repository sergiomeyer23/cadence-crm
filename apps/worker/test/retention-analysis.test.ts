import { checkIns, seedDatabase, students, timelineEvents, type Db } from '@cadence/db';
import { DEFAULT_FREQUENCY_RULE } from '@cadence/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRetentionAnalysis } from '../src/jobs/retention-analysis';
import { NOW, createStudent, createWorkspace, daysAgo, resetDatabase, testDb } from './helpers';

let db: Db;
let close: () => Promise<void>;

beforeAll(() => {
  ({ db, close } = testDb());
});
afterAll(async () => {
  await close();
});
beforeEach(async () => {
  await resetDatabase(db);
});

const deps = () => ({ db, rule: DEFAULT_FREQUENCY_RULE });
const analyze = (workspaceId?: string) => handleRetentionAnalysis(deps(), { workspaceId }, NOW);

async function statusChangedEvents(workspaceId: string) {
  return db
    .select()
    .from(timelineEvents)
    .where(and(eq(timelineEvents.workspaceId, workspaceId), eq(timelineEvents.type, 'STATUS_CHANGED')));
}

/** Três alunos gravados como ACTIVE: um continua, um sumiu e um está pausado. */
async function fixture() {
  const { workspace, coach } = await createWorkspace(db);
  const base = { workspaceId: workspace.id, coachId: coach.id, weeklyGoal: 3, status: 'ACTIVE' as const };

  const steady = await createStudent(db, { ...base, name: 'Assíduo' });
  const missing = await createStudent(db, { ...base, name: 'Sumido' });
  const paused = await createStudent(db, { ...base, name: 'Pausado', pausedAt: daysAgo(3), pauseReason: 'Lesão' });

  await db.insert(checkIns).values([
    ...[13, 11, 9, 6, 4, 1].map((d) => ({
      workspaceId: workspace.id,
      studentId: steady.id,
      occurredAt: daysAgo(d),
      source: 'SEED' as const,
    })),
    { workspaceId: workspace.id, studentId: missing.id, occurredAt: daysAgo(12), source: 'SEED' as const },
  ]);

  return { workspace, steady, missing, paused };
}

async function statusOf(id: string) {
  const [row] = await db.select({ status: students.status }).from(students).where(eq(students.id, id));
  return row!.status;
}

describe('retention-analysis', () => {
  it('grava STATUS_CHANGED só para quem mudou de status', async () => {
    const { workspace, steady, missing, paused } = await fixture();

    const result = await analyze(workspace.id);

    expect(result.evaluated).toBe(3);
    expect(result.changes).toHaveLength(2);
    expect(await statusOf(steady.id)).toBe('ACTIVE');
    expect(await statusOf(missing.id)).toBe('AT_RISK');
    expect(await statusOf(paused.id)).toBe('PAUSED_INJURY');

    const events = await statusChangedEvents(workspace.id);
    expect(events.map((e) => e.studentId).sort()).toEqual([missing.id, paused.id].sort());
    expect(events.find((e) => e.studentId === missing.id)?.payload).toMatchObject({ from: 'ACTIVE', to: 'AT_RISK' });
  });

  it('é idempotente: rodar de novo não muda nada nem duplica eventos', async () => {
    const { workspace, missing } = await fixture();

    await analyze(workspace.id);
    const second = await analyze(workspace.id);
    const third = await analyze();

    expect(second.changes).toEqual([]);
    expect(third.changes).toEqual([]);
    expect(await statusChangedEvents(workspace.id)).toHaveLength(2);
    expect(await statusOf(missing.id)).toBe('AT_RISK');
  });

  it('não duplica eventos quando várias análises rodam ao mesmo tempo', async () => {
    const { workspace } = await fixture();

    const results = await Promise.all([analyze(workspace.id), analyze(workspace.id), analyze()]);

    expect(results.flatMap((r) => r.changes)).toHaveLength(2);
    expect(await statusChangedEvents(workspace.id)).toHaveLength(2);
  });

  it('não altera nenhum status logo depois do seed', async () => {
    await seedDatabase(db, { now: NOW });
    const before = await db.select({ id: timelineEvents.id }).from(timelineEvents);

    const result = await analyze();

    expect(result.evaluated).toBe(48);
    expect(result.changes).toEqual([]);
    expect(await db.select({ id: timelineEvents.id }).from(timelineEvents)).toHaveLength(before.length);
  });

  it('pede o relatório semanal só quando a análise veio da simulação', async () => {
    const { workspace } = await fixture();
    const requestReport = vi.fn(async () => {});

    await handleRetentionAnalysis({ ...deps(), requestReport }, { workspaceId: workspace.id }, NOW);
    expect(requestReport).not.toHaveBeenCalled();

    await handleRetentionAnalysis({ ...deps(), requestReport }, { workspaceId: workspace.id, reportAfter: true }, NOW);
    expect(requestReport).toHaveBeenCalledWith(workspace.id);
  });
});
