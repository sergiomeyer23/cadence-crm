import { recordEvent, students, workspaces } from '@cadence/db';
import { publicLeadSchema, toLocalDate, workspaceNow } from '@cadence/shared';
import rateLimit from '@fastify/rate-limit';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { reanalyze, type Deps } from '../context';
import { HttpError, notFound } from '../errors';

const paramsSchema = z.object({ workspaceId: z.string() });

/**
 * Rotas chamadas por sites de terceiros (o widget de captura de leads).
 * Não usam sessão; o CORS aberto para elas é configurado em app.ts.
 */
export async function publicRoutes(app: FastifyInstance, deps: Deps, options: { rateLimitNamespace: string }) {
  await app.register(async (scope) => {
    await scope.register(rateLimit, {
      max: deps.config.publicLeadsPerMinute,
      timeWindow: '1 minute',
      // No Redis o limite vale para todas as instâncias da API, não só para esta.
      redis: deps.redis,
      nameSpace: options.rateLimitNamespace,
      errorResponseBuilder: () => new HttpError(429, 'Muitas tentativas seguidas. Tente de novo em um minuto.'),
    });

    scope.post('/api/public/v1/workspaces/:workspaceId/leads', { bodyLimit: 10_000 }, async (request, reply) => {
      const { workspaceId } = paramsSchema.parse(request.params);
      if (!z.uuid().safeParse(workspaceId).success) throw notFound('Academia');
      const lead = publicLeadSchema.parse(request.body);

      // Bot preencheu o campo escondido: responde como sucesso para ele não tentar de novo.
      if (lead.website) return reply.code(202).send({ ok: true });

      const [workspace] = await deps.db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
      if (!workspace) throw notFound('Academia');
      const now = workspaceNow(workspace.clockOffsetDays);

      const studentId = await deps.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(students)
          .values({
            workspaceId: workspace.id,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            notes: lead.message ? `Mensagem enviada pelo site: ${lead.message}` : null,
            weeklyGoal: lead.weeklyGoal,
            startedOn: toLocalDate(now),
            trackingSince: now,
            statusChangedAt: now,
            simProfile: 'IRREGULAR',
          })
          .returning({ id: students.id });
        await recordEvent(
          tx,
          'ENROLLED',
          { workspaceId: workspace.id, studentId: created!.id, occurredAt: now },
          { weeklyGoal: lead.weeklyGoal, via: 'WEBSITE', utmSource: lead.utmSource },
        );
        return created!.id;
      });

      await reanalyze(deps, workspace.id, [studentId]);
      request.log.info({ workspaceId: workspace.id, studentId }, 'lead recebido pelo site');
      return reply.code(201).send({ ok: true });
    });
  });
}
