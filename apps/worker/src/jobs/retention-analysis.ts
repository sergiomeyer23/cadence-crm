import { runRetentionAnalysis, type Db, type RetentionAnalysisResult } from '@retention/db';
import type { FrequencyRuleConfig, WorkspaceJobData } from '@retention/shared';

export interface RetentionAnalysisDeps {
  db: Db;
  rule: FrequencyRuleConfig;
  /** Chamado quando a análise veio de uma simulação e o relatório da semana deve ser gerado. */
  requestReport?: (workspaceId: string) => Promise<void>;
}

/**
 * Pode rodar quantas vezes for preciso: o serviço só grava STATUS_CHANGED
 * quando o status calculado difere do gravado.
 */
export async function handleRetentionAnalysis(
  deps: RetentionAnalysisDeps,
  data: WorkspaceJobData,
  realNow?: Date,
): Promise<RetentionAnalysisResult> {
  const result = await runRetentionAnalysis(deps.db, { workspaceId: data.workspaceId, rule: deps.rule, realNow });
  if (data.workspaceId && data.reportAfter && deps.requestReport) await deps.requestReport(data.workspaceId);
  return result;
}
