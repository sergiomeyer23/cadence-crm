import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import type { AppConfig } from './config';
import type { Queues } from './queues';

const BASE_PATH = '/admin/queues';

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * O Bull Board mostra jobs de todos os workspaces, então fica atrás de uma
 * credencial de operação separada dos usuários das academias.
 */
export async function registerBullBoard(app: FastifyInstance, queues: Queues, config: AppConfig): Promise<void> {
  const serverAdapter = new FastifyAdapter();
  createBullBoard({ queues: queues.all.map((queue) => new BullMQAdapter(queue)), serverAdapter });
  serverAdapter.setBasePath(BASE_PATH);

  await app.register(async (scope) => {
    scope.addHook('onRequest', async (request, reply) => {
      const header = request.headers.authorization ?? '';
      const [kind, encoded] = header.split(' ');
      const [user, ...rest] = Buffer.from(encoded ?? '', 'base64').toString().split(':');
      const ok =
        kind === 'Basic' &&
        safeEqual(user ?? '', config.bullBoard.user) &&
        safeEqual(rest.join(':'), config.bullBoard.password);
      if (!ok) {
        return reply.code(401).header('WWW-Authenticate', 'Basic realm="Bull Board"').send('Acesso restrito');
      }
    });
    await scope.register(serverAdapter.registerPlugin(), { prefix: BASE_PATH });
  });
}
