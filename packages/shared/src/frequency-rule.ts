import { z } from 'zod';
import { DAY_MS, type RetentionStatus } from './constants';

/**
 * Regra de frequência que decide em qual coluna do Radar o aluno fica.
 *
 * Dois sinais são avaliados e vale o pior deles:
 *
 * 1. Aderência: treinos feitos na janela divididos pelos treinos esperados
 *    (meta semanal x dias da janela / 7).
 * 2. Ausência: dias desde o último treino comparados com uma tolerância
 *    derivada da meta. A tolerância tem piso e teto para não punir quem treina
 *    todo dia por faltar dois dias, nem esperar semanas por quem treina uma vez.
 *
 * Aluno pausado por lesão não é avaliado. O acompanhamento recomeça na data da
 * matrícula ou da última retomada, então quem volta de pausa não carrega as
 * semanas paradas para a conta.
 */

export const frequencyRuleConfigSchema = z
  .object({
    windowDays: z.number().positive(),
    warningAdherence: z.number().min(0).max(1),
    riskAdherence: z.number().min(0).max(1),
    absenceFactor: z.number().positive(),
    absenceFloorDays: z.number().positive(),
    absenceCeilingDays: z.number().positive(),
    riskAbsenceFactor: z.number().min(1),
    newStudentDays: z.number().min(1),
  })
  .refine((c) => c.riskAdherence <= c.warningAdherence, {
    message: 'riskAdherence precisa ser menor ou igual a warningAdherence',
  })
  .refine((c) => c.absenceFloorDays <= c.absenceCeilingDays, {
    message: 'absenceFloorDays precisa ser menor ou igual a absenceCeilingDays',
  });

export type FrequencyRuleConfig = z.infer<typeof frequencyRuleConfigSchema>;

export const DEFAULT_FREQUENCY_RULE: FrequencyRuleConfig = Object.freeze({
  windowDays: 14,
  warningAdherence: 0.6,
  riskAdherence: 0.3,
  absenceFactor: 2,
  absenceFloorDays: 4,
  absenceCeilingDays: 10,
  riskAbsenceFactor: 2,
  newStudentDays: 7,
});

export function resolveFrequencyRule(overrides: Partial<FrequencyRuleConfig> = {}): FrequencyRuleConfig {
  return frequencyRuleConfigSchema.parse({ ...DEFAULT_FREQUENCY_RULE, ...overrides });
}

export type StatusReason =
  | 'PAUSED'
  | 'NEW_STUDENT'
  | 'LOW_ADHERENCE'
  | 'VERY_LOW_ADHERENCE'
  | 'ABSENCE'
  | 'LONG_ABSENCE';

export interface FrequencyInput {
  now: Date;
  /** Treinos por semana combinados com o aluno (1 a 7). */
  weeklyGoal: number;
  /** Matrícula ou última retomada de pausa, o que for mais recente. */
  trackingSince: Date;
  paused: boolean;
  checkIns: readonly Date[];
}

export interface FrequencyEvaluation {
  status: RetentionStatus;
  reasons: StatusReason[];
  /** Janela efetivamente usada; é menor que a configurada para aluno novo. */
  windowDays: number;
  checkInsInWindow: number;
  /** Nulo enquanto o aluno está no período de aluno novo. */
  expectedInWindow: number | null;
  adherence: number | null;
  daysAbsent: number;
  absenceToleranceDays: number;
}

const SEVERITY: Record<Exclude<RetentionStatus, 'PAUSED_INJURY'>, number> = {
  ACTIVE: 0,
  WARNING: 1,
  AT_RISK: 2,
};

type EvaluatedStatus = keyof typeof SEVERITY;

function worse(a: EvaluatedStatus, b: EvaluatedStatus): EvaluatedStatus {
  return SEVERITY[b] > SEVERITY[a] ? b : a;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function normalizeWeeklyGoal(weeklyGoal: number): number {
  return clamp(Math.round(weeklyGoal), 1, 7);
}

/** Quantos dias sem treinar são tolerados antes de o aluno ir para WARNING. */
export function absenceToleranceDays(
  weeklyGoal: number,
  config: FrequencyRuleConfig = DEFAULT_FREQUENCY_RULE,
): number {
  const expectedIntervalDays = 7 / normalizeWeeklyGoal(weeklyGoal);
  return clamp(expectedIntervalDays * config.absenceFactor, config.absenceFloorDays, config.absenceCeilingDays);
}

export function evaluateFrequency(
  input: FrequencyInput,
  config: FrequencyRuleConfig = DEFAULT_FREQUENCY_RULE,
): FrequencyEvaluation {
  const goal = normalizeWeeklyGoal(input.weeklyGoal);
  const nowMs = input.now.getTime();
  const sinceMs = Math.min(input.trackingSince.getTime(), nowMs);
  const trackedDays = (nowMs - sinceMs) / DAY_MS;
  const tolerance = absenceToleranceDays(goal, config);

  // Check-ins anteriores ao início do acompanhamento (por exemplo, antes de uma
  // pausa) não contam, e os posteriores a "agora" ainda não aconteceram.
  const relevant = input.checkIns.map((d) => d.getTime()).filter((t) => t >= sinceMs && t <= nowMs);
  const lastActivityMs = relevant.length > 0 ? Math.max(...relevant) : sinceMs;
  const daysAbsent = (nowMs - lastActivityMs) / DAY_MS;

  const windowDays = Math.min(config.windowDays, trackedDays);
  const windowStartMs = nowMs - windowDays * DAY_MS;
  const checkInsInWindow = relevant.filter((t) => t >= windowStartMs).length;

  const base = { windowDays, checkInsInWindow, daysAbsent, absenceToleranceDays: tolerance };

  if (input.paused) {
    return { ...base, status: 'PAUSED_INJURY', reasons: ['PAUSED'], expectedInWindow: null, adherence: null };
  }

  let status: EvaluatedStatus = 'ACTIVE';
  const reasons: StatusReason[] = [];
  let expectedInWindow: number | null = null;
  let adherence: number | null = null;

  if (trackedDays < config.newStudentDays) {
    // Poucos dias de histórico distorcem a aderência; aqui só a ausência pesa.
    reasons.push('NEW_STUDENT');
  } else {
    expectedInWindow = (goal * windowDays) / 7;
    adherence = checkInsInWindow / expectedInWindow;
    if (adherence < config.riskAdherence) {
      status = worse(status, 'AT_RISK');
      reasons.push('VERY_LOW_ADHERENCE');
    } else if (adherence < config.warningAdherence) {
      status = worse(status, 'WARNING');
      reasons.push('LOW_ADHERENCE');
    }
  }

  if (daysAbsent > tolerance * config.riskAbsenceFactor) {
    status = worse(status, 'AT_RISK');
    reasons.push('LONG_ABSENCE');
  } else if (daysAbsent > tolerance) {
    status = worse(status, 'WARNING');
    reasons.push('ABSENCE');
  }

  return { ...base, status, reasons, expectedInWindow, adherence };
}
