import { createDb, hashPassword, loadEnv, students, users, workspaces, type Db, type NewStudent } from '@retention/db';
import { DAY_MS } from '@retention/shared';
import { sql } from 'drizzle-orm';

loadEnv();

export const NOW = new Date('2026-11-15T15:00:00Z');
export const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

export function testDb() {
  return createDb(process.env.TEST_DATABASE_URL!, { max: 5 });
}

export async function resetDatabase(db: Db) {
  await db.execute(
    sql`TRUNCATE TABLE weekly_reports, timeline_events, contacts, check_ins, students, sessions, users, workspaces CASCADE`,
  );
}

export async function createWorkspace(db: Db) {
  const [workspace] = await db.insert(workspaces).values({ name: 'Academia Teste', kind: 'GYM' }).returning();
  const [coach] = await db
    .insert(users)
    .values({
      workspaceId: workspace!.id,
      name: 'Treinador Teste',
      email: `coach-${workspace!.id}@teste.test`,
      role: 'COACH',
      passwordHash: await hashPassword('x'),
    })
    .returning();
  return { workspace: workspace!, coach: coach! };
}

export async function createStudent(db: Db, values: Omit<NewStudent, 'startedOn' | 'trackingSince'> & { since?: Date }) {
  const since = values.since ?? daysAgo(90);
  const [student] = await db
    .insert(students)
    .values({ ...values, startedOn: since.toISOString().slice(0, 10), trackingSince: since })
    .returning();
  return student!;
}
