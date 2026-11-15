import { createDb, hashPassword, students, timelineEvents, users, workspaces, type Db } from '@cadence/db';
import { sql, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createQueues } from '../src/queues';

const LIMIT = 3;

let db: Db;
let closeDb: () => Promise<void>;
let redis: Redis;
let queues: ReturnType<typeof createQueues>;
let app: FastifyInstance;
let workspaceId: string;

const leadUrl = (id: string) => `/api/public/v1/workspaces/${id}/leads`;

// Cada envio sai de um IP diferente para o rate limit só pesar no teste dele.
let nextIp = 1;
const post = (url: string, payload: object) =>
  app.inject({ method: 'POST', url, payload, remoteAddress: `198.51.100.${nextIp++}` });
const lead = { name: 'Joana Prates', phone: '(11) 98888-7777', weeklyGoal: 4, utmSource: 'instagram' };

beforeAll(async () => {
  const config = { ...loadConfig(), publicLeadsPerMinute: LIMIT, corsOrigins: ['http://localhost:5173'] };
  ({ db, close: closeDb } = createDb(process.env.TEST_DATABASE_URL!, { max: 5 }));
  redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 1 });
  queues = createQueues(config.redisUrl);
  // Prefixo novo a cada execução, para o contador de uma rodada não vazar para a próxima.
  app = await buildApp({ db, queues, redis, config }, { logger: false, rateLimitNamespace: `test-${randomUUID()}-` });
});

afterAll(async () => {
  await app.close();
  await queues.close();
  redis.disconnect();
  await closeDb();
});

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE TABLE weekly_reports, timeline_events, contacts, check_ins, students, sessions, users, workspaces CASCADE`,
  );
  const [workspace] = await db.insert(workspaces).values({ name: 'Academia Teste', kind: 'GYM' }).returning();
  workspaceId = workspace!.id;
  await db.insert(users).values({
    workspaceId,
    name: 'Dona',
    email: 'dona@teste.test',
    role: 'OWNER',
    passwordHash: await hashPassword('x'),
  });
});

describe('POST /api/public/v1/workspaces/:id/leads', () => {
  it('cria o aluno como novo e registra a origem na timeline', async () => {
    const response = await post(leadUrl(workspaceId), lead);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ ok: true });

    const [student] = await db.select().from(students).where(eq(students.workspaceId, workspaceId));
    expect(student).toMatchObject({ name: 'Joana Prates', weeklyGoal: 4, status: 'ACTIVE', coachId: null });

    const [event] = await db.select().from(timelineEvents).where(eq(timelineEvents.studentId, student!.id));
    expect(event).toMatchObject({ type: 'ENROLLED', payload: { via: 'WEBSITE', utmSource: 'instagram', weeklyGoal: 4 } });
  });

  it('finge sucesso e descarta o envio quando o campo isca vem preenchido', async () => {
    const response = await post(leadUrl(workspaceId), { ...lead, website: 'http://spam.example' });

    expect(response.statusCode).toBe(202);
    expect(await db.select().from(students)).toHaveLength(0);
  });

  it('exige e-mail ou telefone', async () => {
    const response = await post(leadUrl(workspaceId), { name: 'Sem Contato' });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues[0].message).toMatch(/e-mail ou telefone/);
  });

  it('responde 404 para academia inexistente ou ID inválido', async () => {
    const unknown = await post(leadUrl(randomUUID()), lead);
    const invalid = await post(leadUrl('nao-e-uuid'), lead);

    expect(unknown.statusCode).toBe(404);
    expect(invalid.statusCode).toBe(404);
  });

  it('aceita preflight de qualquer site, sem credenciais', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: leadUrl(workspaceId),
      headers: {
        origin: 'https://site-da-academia.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('limita os envios por IP', async () => {
    const send = () =>
      app.inject({ method: 'POST', url: leadUrl(workspaceId), payload: lead, remoteAddress: '203.0.113.9' });

    for (let i = 0; i < LIMIT; i++) expect((await send()).statusCode).toBe(201);
    const blocked = await send();

    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error).toMatch(/Muitas tentativas/);
    expect(await db.select().from(students)).toHaveLength(LIMIT);
  });
});

describe('CORS das rotas autenticadas', () => {
  it('só libera as origens configuradas, com credenciais', async () => {
    const preflight = (origin: string) =>
      app.inject({
        method: 'OPTIONS',
        url: '/api/students',
        headers: { origin, 'access-control-request-method': 'PATCH' },
      });

    const allowed = await preflight('http://localhost:5173');
    const other = await preflight('https://outro-site.example');

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('GET /api/health', () => {
  it('confere Postgres e Redis', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', service: 'cadence-api', checks: { database: 'ok', redis: 'ok' } });
  });
});
