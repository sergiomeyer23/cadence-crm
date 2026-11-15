import { checkIns, seededRng, workspaces, type Db } from '@cadence/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { simulateWeek } from '../src/jobs/simulate-checkins';
import { NOW, createStudent, createWorkspace, resetDatabase, testDb } from './helpers';

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

describe('simulate-checkins', () => {
  it('avança o relógio uma semana e ignora o mesmo job repetido', async () => {
    const { workspace, coach } = await createWorkspace(db);
    await createStudent(db, {
      workspaceId: workspace.id,
      coachId: coach.id,
      name: 'Assíduo',
      weeklyGoal: 4,
      simProfile: 'STEADY',
    });
    const options = { rng: seededRng(1), realNow: NOW };

    const first = await simulateWeek(db, { workspaceId: workspace.id, fromOffsetDays: 0 }, options);
    const retry = await simulateWeek(db, { workspaceId: workspace.id, fromOffsetDays: 0 }, options);

    const [stored] = await db.select().from(workspaces).where(eq(workspaces.id, workspace.id));
    const rows = await db.select().from(checkIns).where(eq(checkIns.workspaceId, workspace.id));

    expect(first).toMatchObject({ simulated: true, toOffsetDays: 7 });
    expect(first.checkIns).toBeGreaterThan(0);
    expect(retry.simulated).toBe(false);
    expect(stored!.clockOffsetDays).toBe(7);
    expect(rows).toHaveLength(first.checkIns);
    for (const row of rows) {
      expect(row.occurredAt.getTime()).toBeGreaterThan(NOW.getTime());
      expect(row.occurredAt.getTime()).toBeLessThanOrEqual(NOW.getTime() + 7 * 86_400_000);
    }
  });

  it('sorteia os mesmos treinos para a mesma semana do mesmo workspace', async () => {
    const { workspace, coach } = await createWorkspace(db);
    for (const name of ['Ana', 'Bruno', 'Carla']) {
      await createStudent(db, { workspaceId: workspace.id, coachId: coach.id, name, weeklyGoal: 3, simProfile: 'IRREGULAR' });
    }
    const run = async () => {
      await simulateWeek(db, { workspaceId: workspace.id, fromOffsetDays: 0 }, { realNow: NOW });
      const rows = await db.select().from(checkIns).where(eq(checkIns.workspaceId, workspace.id));
      return rows.map((r) => `${r.studentId}@${r.occurredAt.toISOString()}`).sort();
    };

    const first = await run();
    await db.delete(checkIns).where(eq(checkIns.workspaceId, workspace.id));
    await db.update(workspaces).set({ clockOffsetDays: 0 }).where(eq(workspaces.id, workspace.id));
    const second = await run();

    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
  });

  it('não gera treinos para aluno pausado', async () => {
    const { workspace } = await createWorkspace(db);
    await createStudent(db, {
      workspaceId: workspace.id,
      name: 'Pausado',
      weeklyGoal: 5,
      pausedAt: NOW,
      pauseReason: 'Lesão',
    });

    const result = await simulateWeek(db, { workspaceId: workspace.id, fromOffsetDays: 0 }, { realNow: NOW });

    expect(result).toMatchObject({ simulated: true, checkIns: 0 });
  });
});
