import { sessions, users, verifyPassword, workspaces, type Db, type User, type Workspace } from '@retention/db';
import { loginSchema, type SessionUser } from '@retention/shared';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import type { AppConfig } from './config';
import { HttpError } from './errors';

const SESSION_COOKIE = 'rg_session';

export interface AuthContext {
  sessionId: string;
  user: Pick<User, 'id' | 'name' | 'email' | 'role' | 'workspaceId'>;
  workspace: Workspace;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function toSessionUser(auth: AuthContext): SessionUser {
  const { user, workspace } = auth;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    workspace: { id: workspace.id, name: workspace.name, kind: workspace.kind },
  };
}

export function authOf(request: FastifyRequest): AuthContext {
  if (!request.auth) throw new HttpError(401, 'Faça login para continuar.');
  return request.auth;
}

export async function requireAuth(request: FastifyRequest): Promise<void> {
  authOf(request);
}

export function registerAuth(app: FastifyInstance, db: Db, config: AppConfig): void {
  app.decorateRequest('auth', null);

  app.addHook('onRequest', async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return;
    const [row] = await db
      .select({ sessionId: sessions.id, user: users, workspace: workspaces })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .innerJoin(workspaces, eq(workspaces.id, users.workspaceId))
      .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())));
    if (row) request.auth = row;
  });

  app.post('/api/auth/login', async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body);
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new HttpError(401, 'E-mail ou senha incorretos.');
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + config.sessionTtlMs);
    await db.delete(sessions).where(and(eq(sessions.userId, user.id), lt(sessions.expiresAt, new Date())));
    await db.insert(sessions).values({ id: hashToken(token), userId: user.id, expiresAt });

    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, user.workspaceId));
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      expires: expiresAt,
    });
    return toSessionUser({ sessionId: hashToken(token), user, workspace: workspace! });
  });

  app.post('/api/auth/logout', async (request, reply) => {
    if (request.auth) await db.delete(sessions).where(eq(sessions.id, request.auth.sessionId));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.code(204).send();
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (request) => toSessionUser(authOf(request)));
}
