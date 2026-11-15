import type {
  CheckInSource,
  ContactChannel,
  RadarCard,
  RetentionStatus,
  StatusReason,
  TimelineItem,
} from '@cadence/shared';

export const STATUS_LABEL: Record<RetentionStatus, string> = {
  ACTIVE: 'Ativo',
  WARNING: 'Atenção',
  AT_RISK: 'Em risco',
  PAUSED_INJURY: 'Pausa por lesão',
};

export const CHANNEL_LABEL: Record<ContactChannel, string> = {
  WHATSAPP: 'WhatsApp',
  PHONE: 'Ligação',
  IN_PERSON: 'Conversa na academia',
  EMAIL: 'E-mail',
};

const REASON_LABEL: Record<StatusReason, string> = {
  PAUSED: 'pausado por lesão',
  NEW_STUDENT: 'aluno novo, aderência ainda não é cobrada',
  LOW_ADHERENCE: 'aderência abaixo de 60%',
  VERY_LOW_ADHERENCE: 'aderência abaixo de 30%',
  ABSENCE: 'passou da tolerância de dias sem treinar',
  LONG_ABSENCE: 'mais que o dobro da tolerância sem treinar',
};

const SOURCE_LABEL: Record<CheckInSource, string> = {
  MANUAL: 'registrado na recepção',
  SIMULATION: 'simulação',
  SEED: 'histórico',
};

export function reasonsText(reasons: StatusReason[]): string {
  return reasons.map((r) => REASON_LABEL[r]).join('; ');
}

const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});
const longDateFormat = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  timeZone: 'America/Sao_Paulo',
});

export const formatDate = (iso: string) => dateFormat.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));
export const formatLongDate = (iso: string) => longDateFormat.format(new Date(iso));

/** Datas sem horário (AAAA-MM-DD) viram DD/MM sem passar por fuso horário. */
export function formatLocalDate(localDate: string): string {
  const [, month, day] = localDate.split('-');
  return `${day}/${month}`;
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function percent(value: number | null): string {
  return value === null ? 'n/d' : `${Math.round(Math.min(value, 9.99) * 100)}%`;
}

export function absenceText(card: Pick<RadarCard, 'daysAbsent' | 'lastCheckInAt'>): string {
  const days = Math.floor(card.daysAbsent);
  if (!card.lastCheckInAt) return days === 0 ? 'Ainda não treinou' : `Sem treino há ${plural(days, 'dia', 'dias')}`;
  if (days === 0) return 'Treinou hoje';
  if (days === 1) return 'Último treino ontem';
  return `Último treino há ${days} dias`;
}

export function frequencyText(card: Pick<RadarCard, 'checkInsInWindow' | 'expectedInWindow'>): string {
  if (card.expectedInWindow === null) return 'Período de adaptação';
  return `${card.checkInsInWindow} de ${Math.round(card.expectedInWindow)} treinos esperados`;
}

export function timelineText(item: TimelineItem): { title: string; detail?: string } {
  switch (item.type) {
    case 'ENROLLED':
      return { title: 'Matrícula', detail: `Meta de ${plural(item.payload.weeklyGoal, 'treino', 'treinos')} por semana` };
    case 'CHECK_IN':
      return { title: 'Treino', detail: SOURCE_LABEL[item.payload.source] };
    case 'CONTACT':
      return {
        title: `Contato por ${CHANNEL_LABEL[item.payload.channel]}`,
        detail: item.payload.followUpOn
          ? `${item.payload.note} Follow-up para ${formatLocalDate(item.payload.followUpOn)}.`
          : item.payload.note,
      };
    case 'FOLLOW_UP_DONE':
      return { title: 'Follow-up concluído' };
    case 'PAUSED':
      return { title: 'Pausa por lesão', detail: item.payload.reason };
    case 'RESUMED':
      return { title: 'Retomou os treinos', detail: `Ficou ${plural(item.payload.pausedDays, 'dia', 'dias')} em pausa` };
    case 'STATUS_CHANGED':
      return {
        title: `Passou de ${STATUS_LABEL[item.payload.from]} para ${STATUS_LABEL[item.payload.to]}`,
        detail: reasonsText(item.payload.reasons) || 'frequência dentro do combinado',
      };
  }
}
