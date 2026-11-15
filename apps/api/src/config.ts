import { loadEnv, loadFrequencyRule } from '@cadence/db';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().positive().default(3333),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
  COOKIE_SECURE: z.stringbool().default(false),
  BULL_BOARD_USER: z.string().min(1),
  BULL_BOARD_PASSWORD: z.string().min(8),
});

export function loadConfig() {
  const env = envSchema.parse(process.env);
  return {
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    port: env.API_PORT,
    sessionTtlMs: env.SESSION_TTL_HOURS * 3_600_000,
    cookieSecure: env.COOKIE_SECURE,
    bullBoard: { user: env.BULL_BOARD_USER, password: env.BULL_BOARD_PASSWORD },
    rule: loadFrequencyRule(),
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
