import { QUEUE_NAMES, type SimulateCheckInsJobData, type WorkspaceJobData } from '@retention/shared';
import { Queue } from 'bullmq';

export function createQueues(redisUrl: string) {
  const connection = { url: redisUrl };
  const simulateCheckIns = new Queue<SimulateCheckInsJobData>(QUEUE_NAMES.simulateCheckIns, { connection });
  const retentionAnalysis = new Queue<WorkspaceJobData>(QUEUE_NAMES.retentionAnalysis, { connection });
  const weeklyReport = new Queue<WorkspaceJobData>(QUEUE_NAMES.weeklyReport, { connection });
  const all = [simulateCheckIns, retentionAnalysis, weeklyReport];

  return {
    simulateCheckIns,
    retentionAnalysis,
    weeklyReport,
    all,
    close: async () => {
      await Promise.all(all.map((queue) => queue.close()));
    },
  };
}

export type Queues = ReturnType<typeof createQueues>;

export const simulationJobId = (workspaceId: string, fromOffsetDays: number) =>
  `simulate-${workspaceId}-${fromOffsetDays}`;
