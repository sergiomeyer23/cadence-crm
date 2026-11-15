import { DAY_MS, addDaysToLocalDate, startOfLocalDay, toLocalDate, type SimProfile } from '@cadence/shared';

export type Rng = () => number;

/** Gerador determinístico (mulberry32) para o seed e os testes darem sempre o mesmo resultado. */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Na demo, um contato recente traz o aluno de volta com boa chance. */
export const RECENT_CONTACT_DAYS = 10;
const CONTACTED_ATTENDANCE = 0.85;

/**
 * Chance de o aluno comparecer a cada treino planejado da semana.
 * `weekIndex` é quantas semanas já foram simuladas no workspace (0 no seed).
 */
export function attendanceProbability(
  profile: SimProfile,
  weekIndex: number,
  recentlyContacted: boolean,
  rng: Rng,
): number {
  let probability: number;
  switch (profile) {
    case 'STEADY':
      probability = 0.92;
      break;
    case 'IRREGULAR':
      probability = 0.35 + rng() * 0.6;
      break;
    case 'DRIFTING':
      probability = Math.max(0.05, 0.85 - 0.4 * weekIndex);
      break;
    case 'GHOST':
      probability = 0.05;
      break;
  }
  return recentlyContacted ? Math.max(probability, CONTACTED_ATTENDANCE) : probability;
}

/**
 * Sorteia os horários de treino entre `from` (exclusivo) e `to` (inclusivo).
 * Os treinos são espalhados pela semana em faixas iguais, como numa rotina
 * real, para que um aluno assíduo não fique dias seguidos sem aparecer.
 */
export function planCheckIns(params: {
  from: Date;
  to: Date;
  weeklyGoal: number;
  probability: number;
  rng: Rng;
}): Date[] {
  const { from, to, weeklyGoal, probability, rng } = params;
  const firstDay = addDaysToLocalDate(toLocalDate(from), 1);
  const slot = 7 / weeklyGoal;
  const result: Date[] = [];

  for (let i = 0; i < weeklyGoal; i++) {
    if (rng() >= probability) continue;
    const day = Math.min(6, Math.floor(i * slot + rng() * slot));
    const hour = 6 + Math.floor(rng() * 15);
    const minute = Math.floor(rng() * 60);
    let at = new Date(startOfLocalDay(addDaysToLocalDate(firstDay, day)).getTime() + (hour * 60 + minute) * 60_000);
    if (at > to) at = new Date(at.getTime() - DAY_MS);
    if (at > from && at <= to) result.push(at);
  }

  return result;
}
