import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { sql } from 'drizzle-orm';
import Fastify from 'fastify';
import { z } from 'zod';
import { registerAuth, requireAuth } from './auth';
import { registerBullBoard } from './bull-board';
import type { Deps } from './context';
import { registerErrorHandler } from './errors';
import { radarRoutes } from './routes/radar';
import { studentRoutes } from './routes/students';

z.config(z.locales.ptBR());

export const PUBLIC_PREFIX = '/api/public/';
const HEALTH_TIMEOUT_MS = 2_000;

async function check(probe: () => Promise<unknown>): Promise<'ok' | 'error'> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), HEALTH_TIMEOUT_MS);
  });
  try {
    await Promise.race([probe(), timeout]);
    return 'ok';
  } catch {
    return 'error';
  } finally {
    clearTimeout(timer);
  }
}

export async function buildApp(deps: Deps, options: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: options.logger === false ? false : { level: process.env.LOG_LEVEL ?? 'info' },
    // Atrás de Vercel, Render ou Railway o IP real e o protocolo chegam em X-Forwarded-*.
    trustProxy: deps.config.trustProxy,
  });

  await app.register(cookie);
  await app.register(cors, {
    delegator: (request, callback) => {
      // A API pública recebe formulários de qualquer site e nunca usa cookie;
      // o resto só aceita as origens configuradas, com credenciais.
      if (request.url?.startsWith(PUBLIC_PREFIX)) {
        callback(null, { origin: '*', methods: ['POST'], credentials: false, maxAge: 600 });
      } else {
        callback(null, {
          origin: deps.config.corsOrigins,
          credentials: true,
          methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'],
        });
      }
    },
  });
  registerErrorHandler(app);
  registerAuth(app, deps.db, deps.config);

  app.get('/api/health', async (_request, reply) => {
    const [database, redis] = await Promise.all([
      check(() => deps.db.execute(sql`select 1`)),
      check(() => deps.redis.ping()),
    ]);
    const healthy = database === 'ok' && redis === 'ok';
    return reply.code(healthy ? 200 : 503).send({
      status: healthy ? 'ok' : 'degraded',
      service: 'cadence-api',
      timestamp: new Date().toISOString(),
      checks: { database, redis },
    });
  });

  await app.register(async (protectedScope) => {
    protectedScope.addHook('preHandler', requireAuth);
    studentRoutes(protectedScope, deps);
    radarRoutes(protectedScope, deps);
  });

  await registerBullBoard(app, deps.queues, deps.config);
  return app;
}
