export const RETENTION_STATUSES = ['ACTIVE', 'WARNING', 'AT_RISK', 'PAUSED_INJURY'] as const;
export type RetentionStatus = (typeof RETENTION_STATUSES)[number];

export const ROLES = ['OWNER', 'COACH'] as const;
export type Role = (typeof ROLES)[number];

export const WORKSPACE_KINDS = ['GYM', 'SOLO'] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

export const CONTACT_CHANNELS = ['WHATSAPP', 'PHONE', 'IN_PERSON', 'EMAIL'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const CHECK_IN_SOURCES = ['MANUAL', 'SIMULATION', 'SEED'] as const;
export type CheckInSource = (typeof CHECK_IN_SOURCES)[number];

export const TIMELINE_EVENT_TYPES = [
  'ENROLLED',
  'CHECK_IN',
  'CONTACT',
  'FOLLOW_UP_DONE',
  'PAUSED',
  'RESUMED',
  'STATUS_CHANGED',
] as const;
export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export const SIM_PROFILES = ['STEADY', 'IRREGULAR', 'DRIFTING', 'GHOST'] as const;
export type SimProfile = (typeof SIM_PROFILES)[number];

export const QUEUE_NAMES = {
  simulateCheckIns: 'simulate-checkins',
  retentionAnalysis: 'retention-analysis',
  weeklyReport: 'weekly-report',
} as const;

export const DAY_MS = 86_400_000;
