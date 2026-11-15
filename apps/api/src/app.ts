import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { z } from 'zod';
import { registerAuth, requireAuth } from './auth';
import { registerBullBoard } from './bull-board';
import type { Deps } from './context';
import { registerErrorHandler } from './errors';
import { radarRoutes } from './routes/radar';
import { studentRoutes } from './routes/students';

z.config(z.locales.ptBR());

export async function buildApp(deps: Deps) {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  await app.register(cookie);
  registerErrorHandler(app);
  registerAuth(app, deps.db, deps.config);

  app.get('/api/health', async () => ({ ok: true }));

  await app.register(async (protectedScope) => {
    protectedScope.addHook('preHandler', requireAuth);
    studentRoutes(protectedScope, deps);
    radarRoutes(protectedScope, deps);
  });

  await registerBullBoard(app, deps.queues, deps.config);
  return app;
}
