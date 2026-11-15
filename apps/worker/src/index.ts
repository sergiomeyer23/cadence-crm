import { createDb } from '@cadence/db';
import { QUEUE_NAMES, type SimulateCheckInsJobData, type WorkspaceJobData } from '@cadence/shared';
import { Queue, Worker, type Job } from 'bullmq';
import { loadConfig } from './config';
import { handleRetentionAnalysis } from './jobs/retention-analysis';
import { simulateWeek } from './jobs/simulate-checkins';
import { generateWeeklyReports } from './jobs/weekly-report';

const config = loadConfig();
const { db, close: closeDb } = createDb(config.databaseUrl, { max: 5 });
// Workers mantêm conexões bloqueantes com o Redis; sem este ajuste o BullMQ recusa a conexão.
const connection = { url: config.redisUrl, maxRetriesPerRequest: null };

const retentionQueue = new Queue<WorkspaceJobData>(QUEUE_NAMES.retentionAnalysis, { connection });
const reportQueue = new Queue<WorkspaceJobData>(QUEUE_NAMES.weeklyReport, { connection });

const log = (message: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), message, ...extra }));

await retentionQueue.upsertJobScheduler(
  'retention-analysis-all',
  { every: config.analysisEveryMs },
  { name: 'retention-analysis', data: {}, opts: { removeOnComplete: 50, removeOnFail: 100 } },
);
await reportQueue.upsertJobScheduler(
  'weekly-report-all',
  { pattern: config.weeklyReportCron, tz: config.weeklyReportTz },
  { name: 'weekly-report', data: {}, opts: { removeOnComplete: 20, removeOnFail: 50 } },
);

const simulationWorker = new Worker<SimulateCheckInsJobData>(
  QUEUE_NAMES.simulateCheckIns,
  async (job) => {
    const result = await simulateWeek(db, job.data);
    if (result.simulated) {
      await retentionQueue.add(
        'retention-analysis',
        { workspaceId: job.data.workspaceId, reportAfter: true },
        { removeOnComplete: 50, removeOnFail: 100 },
      );
    }
    return result;
  },
  { connection, concurrency: 1 },
);

const retentionWorker = new Worker<WorkspaceJobData>(
  QUEUE_NAMES.retentionAnalysis,
  async (job) => {
    const result = await handleRetentionAnalysis(
      {
        db,
        rule: config.rule,
        requestReport: async (workspaceId) => {
          await reportQueue.add('weekly-report', { workspaceId }, { removeOnComplete: 20, removeOnFail: 50 });
        },
      },
      job.data,
    );
    return { workspaces: result.workspaces, evaluated: result.evaluated, changed: result.changes.length, changes: result.changes };
  },
  // Uma análise por vez evita trabalho repetido; a idempotência cobre o resto.
  { connection, concurrency: 1 },
);

const reportWorker = new Worker<WorkspaceJobData>(
  QUEUE_NAMES.weeklyReport,
  async (job) => ({ workspaces: await generateWeeklyReports(db, { workspaceId: job.data.workspaceId }) }),
  { connection, concurrency: 1 },
);

const workers = [simulationWorker, retentionWorker, reportWorker];
for (const worker of workers) {
  worker.on('completed', (job: Job, result: unknown) => {
    log('job concluído', { queue: worker.name, jobId: job.id, result });
  });
  worker.on('failed', (job: Job | undefined, error: Error) => {
    log('job falhou', { queue: worker.name, jobId: job?.id, error: error.message });
  });
}

log('worker iniciado', {
  queues: workers.map((w) => w.name),
  analysisEveryMs: config.analysisEveryMs,
  weeklyReportCron: config.weeklyReportCron,
});

async function shutdown() {
  await Promise.all(workers.map((worker) => worker.close()));
  await Promise.all([retentionQueue.close(), reportQueue.close()]);
  await closeDb();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
