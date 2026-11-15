import { DAY_MS } from './constants';

export const APP_TIME_ZONE = 'America/Sao_Paulo';

// O Brasil não tem horário de verão desde 2019, então o deslocamento é fixo.
const APP_UTC_OFFSET = '-03:00';

/**
 * Cada workspace tem um relógio próprio: o horário real somado aos dias que a
 * simulação já avançou. Assim a demo de uma academia não mexe nas outras.
 */
export function workspaceNow(clockOffsetDays: number, realNow: Date = new Date()): Date {
  return new Date(realNow.getTime() + clockOffsetDays * DAY_MS);
}

/** Data local (AAAA-MM-DD) no fuso da aplicação. */
export function toLocalDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function startOfLocalDay(localDate: string): Date {
  return new Date(`${localDate}T00:00:00${APP_UTC_OFFSET}`);
}

export function addDaysToLocalDate(localDate: string, days: number): string {
  return toLocalDate(new Date(startOfLocalDay(localDate).getTime() + days * DAY_MS + 12 * 3_600_000));
}
