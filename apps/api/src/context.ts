import { runRetentionAnalysis, students, users, type Db, type Executor } from '@retention/db';
import { workspaceNow } from '@retention/shared';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authOf, type AuthContext } from './auth';
import type { AppConfig } from './config';
import { HttpError, notFound } from './errors';
import type { Queues } from './queues';

export interface Deps {
  db: Db;
  queues: Queues;
  config: AppConfig;
}

export interface RequestContext extends AuthContext {
  now: Date;
}

export function contextOf(request: FastifyRequest): RequestContext {
  const auth = authOf(request);
  return { ...auth, now: workspaceNow(auth.workspace.clockOffsetDays) };
}

const idParams = z.object({ id: z.string() });

/** IDs que não são UUID viram 404, para não vazar erro de sintaxe do banco. */
export function idParam(request: FastifyRequest, what: string): string {
  const { id } = idParams.parse(request.params);
  if (!z.uuid().safeParse(id).success) throw notFound(what);
  return id;
}

export async function findStudent(db: Executor, workspaceId: string, studentId: string) {
  const [student] = await db
    .select()
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.workspaceId, workspaceId), isNull(students.archivedAt)));
  if (!student) throw notFound('Aluno');
  return student;
}

export async function assertCoachInWorkspace(db: Executor, workspaceId: string, coachId: string): Promise<void> {
  const [coach] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, coachId), eq(users.workspaceId, workspaceId)));
  if (!coach) throw new HttpError(400, 'Treinador não pertence a esta academia.');
}

/** Reaplica a regra só para os alunos afetados, para o card mudar de coluna na hora. */
export async function reanalyze(deps: Deps, workspaceId: string, studentIds: string[]): Promise<void> {
  await runRetentionAnalysis(deps.db, { workspaceId, studentIds, rule: deps.config.rule });
}
