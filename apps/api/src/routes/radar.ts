import { users, weeklyReports } from '@cadence/db';
import {
  RETENTION_STATUSES,
  radarQuerySchema,
  type RadarCard,
  type RadarResponse,
  type RetentionStatus,
  type SimulationStarted,
  type TeamMember,
  type WeeklyReport,
} from '@cadence/shared';
import { asc, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildCards } from '../cards';
import { contextOf, type Deps, type RequestContext } from '../context';
import { forbidden } from '../errors';
import { simulationJobId } from '../queues';

const PENDING_STATES = new Set(['waiting', 'active', 'delayed', 'prioritized', 'waiting-children']);

export function radarRoutes(app: FastifyInstance, deps: Deps): void {
  const { db, config, queues } = deps;

  async function simulationPending(ctx: RequestContext): Promise<boolean> {
    const job = await queues.simulateCheckIns.getJob(simulationJobId(ctx.workspace.id, ctx.workspace.clockOffsetDays));
    return job ? PENDING_STATES.has(await job.getState()) : false;
  }

  app.get('/api/radar', async (request): Promise<RadarResponse> => {
    const ctx = contextOf(request);
    const query = radarQuerySchema.parse(request.query);
    // Personal autônomo só tem os próprios alunos; o filtro não se aplica.
    const scope = ctx.workspace.kind === 'SOLO' ? 'all' : (query.scope ?? (ctx.user.role === 'COACH' ? 'mine' : 'all'));

    const [cards, pending] = await Promise.all([
      buildCards(db, ctx.workspace, {
        now: ctx.now,
        rule: config.rule,
        coachId: scope === 'mine' ? ctx.user.id : undefined,
      }),
      simulationPending(ctx),
    ]);

    const columns = Object.fromEntries(RETENTION_STATUSES.map((s) => [s, [] as RadarCard[]])) as Record<
      RetentionStatus,
      RadarCard[]
    >;
    for (const card of cards) columns[card.status].push(card);
    // Dentro de cada coluna, quem está há mais tempo sem treinar aparece primeiro.
    for (const status of RETENTION_STATUSES) columns[status].sort((a, b) => b.daysAbsent - a.daysAbsent);

    return {
      scope,
      clock: {
        now: ctx.now.toISOString(),
        simulatedWeeks: Math.floor(ctx.workspace.clockOffsetDays / 7),
        simulationPending: pending,
      },
      columns,
    };
  });

  app.post('/api/simulation/week', async (request, reply): Promise<SimulationStarted> => {
    const ctx = contextOf(request);
    if (ctx.user.role !== 'OWNER') throw forbidden();
    const fromOffsetDays = ctx.workspace.clockOffsetDays;
    // O jobId fixo por semana faz o BullMQ ignorar cliques repetidos.
    const job = await queues.simulateCheckIns.add(
      'simulate-checkins',
      { workspaceId: ctx.workspace.id, fromOffsetDays },
      {
        jobId: simulationJobId(ctx.workspace.id, fromOffsetDays),
        removeOnComplete: { age: 3600, count: 200 },
        removeOnFail: { count: 200 },
      },
    );
    reply.code(202);
    return { jobId: job.id ?? '', fromOffsetDays };
  });

  app.get('/api/reports/latest', async (request): Promise<WeeklyReport | null> => {
    const ctx = contextOf(request);
    const [report] = await db
      .select()
      .from(weeklyReports)
      .where(eq(weeklyReports.workspaceId, ctx.workspace.id))
      .orderBy(desc(weeklyReports.periodEnd))
      .limit(1);
    if (!report) return null;
    return {
      id: report.id,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      createdAt: report.createdAt.toISOString(),
      data: report.data,
    };
  });

  app.get('/api/team', async (request): Promise<TeamMember[]> => {
    const ctx = contextOf(request);
    return db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.workspaceId, ctx.workspace.id))
      .orderBy(asc(users.name));
  });
}
