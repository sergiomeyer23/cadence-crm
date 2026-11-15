import type {
  CheckInSource,
  ContactChannel,
  RetentionStatus,
  Role,
  TimelineEventType,
  WorkspaceKind,
} from './constants';
import type { StatusReason } from './frequency-rule';
import type { RadarScope } from './schemas';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  workspace: { id: string; name: string; kind: WorkspaceKind };
}

export interface WorkspaceClock {
  /** "Agora" da academia, já somado o avanço das semanas simuladas. */
  now: string;
  simulatedWeeks: number;
  simulationPending: boolean;
}

export interface PersonRef {
  id: string;
  name: string;
}

export interface RadarCard {
  id: string;
  name: string;
  status: RetentionStatus;
  statusChangedAt: string;
  coach: PersonRef | null;
  weeklyGoal: number;
  lastCheckInAt: string | null;
  daysAbsent: number;
  checkInsInWindow: number;
  expectedInWindow: number | null;
  adherence: number | null;
  reasons: StatusReason[];
  nextFollowUpOn: string | null;
  followUpOverdue: boolean;
  pauseReason: string | null;
}

export interface RadarResponse {
  scope: RadarScope;
  clock: WorkspaceClock;
  columns: Record<RetentionStatus, RadarCard[]>;
}

export interface OpenFollowUp {
  contactId: string;
  followUpOn: string;
  channel: ContactChannel;
  note: string;
  overdue: boolean;
}

export interface StudentDetail extends RadarCard {
  email: string | null;
  phone: string | null;
  notes: string | null;
  startedOn: string;
  trackingSince: string;
  pausedAt: string | null;
  openFollowUps: OpenFollowUp[];
}

export interface TimelinePayloads {
  /** `via: 'WEBSITE'` quando o aluno chegou pelo widget do site da academia. */
  ENROLLED: { weeklyGoal: number; via?: 'WEBSITE'; utmSource?: string | null };
  CHECK_IN: { checkInId: string; source: CheckInSource };
  CONTACT: { contactId: string; channel: ContactChannel; note: string; followUpOn: string | null };
  FOLLOW_UP_DONE: { contactId: string };
  PAUSED: { reason: string };
  RESUMED: { pausedDays: number };
  STATUS_CHANGED: {
    from: RetentionStatus;
    to: RetentionStatus;
    reasons: StatusReason[];
    adherence: number | null;
    daysAbsent: number;
  };
}

export type TimelineItem = {
  [K in TimelineEventType]: {
    id: string;
    type: K;
    occurredAt: string;
    actor: PersonRef | null;
    payload: TimelinePayloads[K];
  };
}[TimelineEventType];

export interface WeeklyReportData {
  statusCounts: Record<RetentionStatus, number>;
  checkIns: number;
  contacts: number;
  movedToRisk: number;
  recovered: number;
  atRiskWithoutContact: PersonRef[];
}

export interface WeeklyReport {
  id: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  data: WeeklyReportData;
}

export interface TeamMember extends PersonRef {
  role: Role;
}

export interface SimulationStarted {
  jobId: string;
  fromOffsetDays: number;
}

export interface SimulateCheckInsJobData {
  workspaceId: string;
  /** Deslocamento do relógio no momento do clique; evita simular a mesma semana duas vezes. */
  fromOffsetDays: number;
}

export interface WorkspaceJobData {
  /** Sem workspace, o job processa todos. */
  workspaceId?: string;
  /** Depois da análise disparada pela simulação, gera o relatório da semana simulada. */
  reportAfter?: boolean;
}
