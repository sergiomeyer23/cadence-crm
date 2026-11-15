import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Registro') => new HttpError(404, `${what} não encontrado.`);
export const conflict = (message: string) => new HttpError(409, message);
export const forbidden = () => new HttpError(403, 'Seu perfil não tem permissão para esta ação.');

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | HttpError | ZodError, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'Dados inválidos.',
        issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
    }
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    request.log.error(error);
    return reply.code(500).send({ error: 'Erro interno. Tente de novo em instantes.' });
  });
}
