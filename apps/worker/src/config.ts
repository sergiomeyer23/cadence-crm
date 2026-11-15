import { loadEnv, loadFrequencyRule } from '@cadence/db';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  RETENTION_ANALYSIS_EVERY_MS: z.coerce.number().int().min(5_000).default(60_000),
  WEEKLY_REPORT_CRON: z.string().min(1).default('0 8 * * 1'),
  WEEKLY_REPORT_TZ: z.string().min(1).default('America/Sao_Paulo'),
});

export function loadConfig() {
  const env = envSchema.parse(process.env);
  return {
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    analysisEveryMs: env.RETENTION_ANALYSIS_EVERY_MS,
    weeklyReportCron: env.WEEKLY_REPORT_CRON,
    weeklyReportTz: env.WEEKLY_REPORT_TZ,
    rule: loadFrequencyRule(),
  };
}
