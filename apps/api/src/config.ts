import { loadEnv, loadFrequencyRule } from '@cadence/db';
import { z } from 'zod';

loadEnv();

const origins = z
  .string()
  .default('http://localhost:5173')
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    API_PORT: z.coerce.number().int().positive().default(3333),
    SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
    COOKIE_SECURE: z.stringbool().default(false),
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    CORS_ORIGIN: origins,
    TRUST_PROXY: z.stringbool().default(false),
    BULL_BOARD_USER: z.string().min(1),
    BULL_BOARD_PASSWORD: z.string().min(8),
  })
  .refine((env) => env.COOKIE_SAME_SITE !== 'none' || env.COOKIE_SECURE, {
    // Navegadores descartam cookies SameSite=None que não sejam Secure.
    message: 'COOKIE_SAME_SITE=none exige COOKIE_SECURE=true',
    path: ['COOKIE_SAME_SITE'],
  });

export function loadConfig() {
  const env = envSchema.parse(process.env);
  return {
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    port: env.API_PORT,
    sessionTtlMs: env.SESSION_TTL_HOURS * 3_600_000,
    cookie: { secure: env.COOKIE_SECURE, sameSite: env.COOKIE_SAME_SITE },
    corsOrigins: env.CORS_ORIGIN,
    trustProxy: env.TRUST_PROXY,
    bullBoard: { user: env.BULL_BOARD_USER, password: env.BULL_BOARD_PASSWORD },
    rule: loadFrequencyRule(),
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
