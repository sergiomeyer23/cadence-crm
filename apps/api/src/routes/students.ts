import { checkIns, contacts, recordEvent, students, timelineEvents, users } from '@cadence/db';
import {
  DAY_MS,
  checkInCreateSchema,
  contactCreateSchema,
  pauseSchema,
  radarQuerySchema,
  startOfLocalDay,
  studentCreateSchema,
  studentUpdateSchema,
  toLocalDate,
  type StudentDetail,
  type TimelineItem,
} from '@cadence/shared';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildCards, buildDetail } from '../cards';
import {
  assertCoachInWorkspace,
  contextOf,
  findStudent,
  idParam,
  reanalyze,
  type Deps,
  type RequestContext,
} from '../context';
import { HttpError, conflict, forbidden, notFound } from '../errors';

export function studentRoutes(app: FastifyInstance, deps: Deps): void {
  const { db, config } = deps;

  async function detail(ctx: RequestContext, studentId: string): Promise<StudentDetail> {
    const result = await buildDetail(db, ctx.workspace, studentId, { now: ctx.now, rule: config.rule });
    if (!result) throw notFound('Aluno');
    return result;
  }

  app.get('/api/students', async (request) => {
    const ctx = contextOf(request);
    const { scope } = radarQuerySchema.parse(request.query);
    return buildCards(db, ctx.workspace, {
      now: ctx.now,
      rule: config.rule,
      coachId: scope === 'mine' ? ctx.user.id : undefined,
    });
  });

  app.post('/api/students', async (request, reply) => {
    const ctx = contextOf(request);
    const input = studentCreateSchema.parse(request.body);
    const today = toLocalDate(ctx.now);
    const startedOn = input.startedOn ?? today;
    if (startedOn > today) throw new HttpError(400, 'A data de matrícula não pode estar no futuro.');

    // Treinador cadastrando aluno sem indicar responsável fica com o aluno.
    const coachId = input.coachId === undefined && ctx.user.role === 'COACH' ? ctx.user.id : (input.coachId ?? null);
    if (coachId) await assertCoachInWorkspace(db, ctx.workspace.id, coachId);

    const trackingSince = new Date(Math.min(startOfLocalDay(startedOn).getTime(), ctx.now.getTime()));
    const id = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(students)
        .values({
          workspaceId: ctx.workspace.id,
          coachId,
          name: input.name,
          email: input.email,
          phone: input.phone,
          notes: input.notes,
          weeklyGoal: input.weeklyGoal,
          startedOn,
          trackingSince,
          statusChangedAt: ctx.now,
          simProfile: 'IRREGULAR',
        })
        .returning({ id: students.id });
      await recordEvent(
        tx,
        'ENROLLED',
        { workspaceId: ctx.workspace.id, studentId: created!.id, occurredAt: trackingSince, actorId: ctx.user.id },
        { weeklyGoal: input.weeklyGoal },
      );
      return created!.id;
    });

    await reanalyze(deps, ctx.workspace.id, [id]);
    return reply.code(201).send(await detail(ctx, id));
  });

  app.get('/api/students/:id', async (request) => {
    const ctx = contextOf(request);
    return detail(ctx, idParam(request, 'Aluno'));
  });

  app.patch('/api/students/:id', async (request) => {
    const ctx = contextOf(request);
    const id = idParam(request, 'Aluno');
    const input = studentUpdateSchema.omit({ startedOn: true }).parse(request.body);
    await findStudent(db, ctx.workspace.id, id);
    if (input.coachId) await assertCoachInWorkspace(db, ctx.workspace.id, input.coachId);

    await db
      .update(students)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(students.id, id), eq(students.workspaceId, ctx.workspace.id)));
    await reanalyze(deps, ctx.workspace.id, [id]);
    return detail(ctx, id);
  });

  app.delete('/api/students/:id', async (request, reply) => {
    const ctx = contextOf(request);
    if (ctx.user.role !== 'OWNER') throw forbidden();
    const id = idParam(request, 'Aluno');
    await findStudent(db, ctx.workspace.id, id);
    // Arquivar preserva o histórico de contatos e check-ins do aluno.
    await db
      .update(students)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(students.id, id), eq(students.workspaceId, ctx.workspace.id)));
    return reply.code(204).send();
  });

  app.post('/api/students/:id/check-ins', async (request, reply) => {
    const ctx = contextOf(request);
    const id = idParam(request, 'Aluno');
    const input = checkInCreateSchema.parse(request.body ?? {});
    const student = await findStudent(db, ctx.workspace.id, id);
    if (student.pausedAt) throw conflict('Aluno está pausado. Retome o acompanhamento antes de registrar treino.');

    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : ctx.now;
    if (occurredAt > ctx.now) throw new HttpError(400, 'O treino não pode estar no futuro.');
    if (occurredAt < student.trackingSince) {
      throw new HttpError(400, 'O treino não pode ser anterior ao início do acompanhamento.');
    }

    await db.transaction(async (tx) => {
      const [checkIn] = await tx
        .insert(checkIns)
        .values({ workspaceId: ctx.workspace.id, studentId: id, occurredAt, source: 'MANUAL', createdById: ctx.user.id })
        .returning({ id: checkIns.id });
      await recordEvent(
        tx,
        'CHECK_IN',
        { workspaceId: ctx.workspace.id, studentId: id, occurredAt, actorId: ctx.user.id },
        { checkInId: checkIn!.id, source: 'MANUAL' },
      );
    });

    await reanalyze(deps, ctx.workspace.id, [id]);
    return reply.code(201).send(await detail(ctx, id));
  });

  app.post('/api/students/:id/contacts', async (request, reply) => {
    const ctx = contextOf(request);
    const id = idParam(request, 'Aluno');
    const input = contactCreateSchema.parse(request.body);
    await findStudent(db, ctx.workspace.id, id);
    const followUpOn = input.followUpOn ?? null;
    if (followUpOn && followUpOn < toLocalDate(ctx.now)) {
      throw new HttpError(400, 'O follow-up precisa ser hoje ou depois.');
    }

    await db.transaction(async (tx) => {
      const [contact] = await tx
        .insert(contacts)
        .values({
          workspaceId: ctx.workspace.id,
          studentId: id,
          userId: ctx.user.id,
          channel: input.channel,
          note: input.note,
          contactedAt: ctx.now,
          followUpOn,
        })
        .returning({ id: contacts.id });
      await recordEvent(
        tx,
        'CONTACT',
        { workspaceId: ctx.workspace.id, studentId: id, occurredAt: ctx.now, actorId: ctx.user.id },
        { contactId: contact!.id, channel: input.channel, note: input.note, followUpOn },
      );
    });

    return reply.code(201).send(await detail(ctx, id));
  });

  app.post('/api/contacts/:id/follow-up/complete', async (request) => {
    const ctx = contextOf(request);
    const contactId = idParam(request, 'Follow-up');

    const studentId = await db.transaction(async (tx) => {
      const [done] = await tx
        .update(contacts)
        .set({ followUpDoneAt: ctx.now })
        .where(
          and(
            eq(contacts.id, contactId),
            eq(contacts.workspaceId, ctx.workspace.id),
            isNotNull(contacts.followUpOn),
            isNull(contacts.followUpDoneAt),
          ),
        )
        .returning({ studentId: contacts.studentId });
      if (!done) throw notFound('Follow-up pendente');
      await recordEvent(
        tx,
        'FOLLOW_UP_DONE',
        { workspaceId: ctx.workspace.id, studentId: done.studentId, occurredAt: ctx.now, actorId: ctx.user.id },
        { contactId },
      );
      return done.studentId;
    });

    return detail(ctx, studentId);
  });

  app.post('/api/students/:id/pause', async (request) => {
    const ctx = contextOf(request);
    const id = idParam(request, 'Aluno');
    const { reason } = pauseSchema.parse(request.body);

    await db.transaction(async (tx) => {
      const [paused] = await tx
        .update(students)
        .set({ pausedAt: ctx.now, pauseReason: reason, updatedAt: new Date() })
        .where(
          and(
            eq(students.id, id),
            eq(students.workspaceId, ctx.workspace.id),
            isNull(students.archivedAt),
            isNull(students.pausedAt),
          ),
        )
        .returning({ id: students.id });
      if (!paused) {
        await findStudent(tx, ctx.workspace.id, id);
        throw conflict('Aluno já está pausado.');
      }
      await recordEvent(
        tx,
        'PAUSED',
        { workspaceId: ctx.workspace.id, studentId: id, occurredAt: ctx.now, actorId: ctx.user.id },
        { reason },
      );
    });

    await reanalyze(deps, ctx.workspace.id, [id]);
    return detail(ctx, id);
  });

  app.post('/api/students/:id/resume', async (request) => {
    const ctx = contextOf(request);
    const id = idParam(request, 'Aluno');
    const student = await findStudent(db, ctx.workspace.id, id);
    if (!student.pausedAt) throw conflict('Aluno não está pausado.');

    const pausedDays = Math.max(0, Math.round((ctx.now.getTime() - student.pausedAt.getTime()) / DAY_MS));
    await db.transaction(async (tx) => {
      // A regra volta a contar a partir da retomada, como se fosse um aluno novo.
      await tx
        .update(students)
        .set({ pausedAt: null, pauseReason: null, trackingSince: ctx.now, updatedAt: new Date() })
        .where(and(eq(students.id, id), eq(students.workspaceId, ctx.workspace.id)));
      await recordEvent(
        tx,
        'RESUMED',
        { workspaceId: ctx.workspace.id, studentId: id, occurredAt: ctx.now, actorId: ctx.user.id },
        { pausedDays },
      );
    });

    await reanalyze(deps, ctx.workspace.id, [id]);
    return detail(ctx, id);
  });

  const timelineQuery = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });

  app.get('/api/students/:id/timeline', async (request): Promise<TimelineItem[]> => {
    const ctx = contextOf(request);
    const id = idParam(request, 'Aluno');
    const { limit } = timelineQuery.parse(request.query);
    await findStudent(db, ctx.workspace.id, id);

    const rows = await db
      .select({
        id: timelineEvents.id,
        type: timelineEvents.type,
        occurredAt: timelineEvents.occurredAt,
        payload: timelineEvents.payload,
        actorId: users.id,
        actorName: users.name,
      })
      .from(timelineEvents)
      .leftJoin(users, eq(users.id, timelineEvents.actorId))
      .where(and(eq(timelineEvents.studentId, id), eq(timelineEvents.workspaceId, ctx.workspace.id)))
      .orderBy(desc(timelineEvents.occurredAt), desc(timelineEvents.createdAt))
      .limit(limit);

    return rows.map(
      (row) =>
        ({
          id: row.id,
          type: row.type,
          occurredAt: row.occurredAt.toISOString(),
          actor: row.actorId ? { id: row.actorId, name: row.actorName ?? '' } : null,
          payload: row.payload,
        }) as TimelineItem,
    );
  });
}
