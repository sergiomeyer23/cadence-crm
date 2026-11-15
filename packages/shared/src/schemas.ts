import { z } from 'zod';
import { CONTACT_CHANNELS } from './constants';

export const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

export const studentCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z
    .union([z.email().trim().toLowerCase().max(160), z.literal('')])
    .nullish()
    .transform((value) => (value ? value : null)),
  phone: nullableText(30),
  weeklyGoal: z.number().int().min(1).max(7),
  coachId: z.uuid().nullish(),
  startedOn: z.iso.date().optional(),
  notes: nullableText(1000),
});
export type StudentCreateInput = z.input<typeof studentCreateSchema>;

export const studentUpdateSchema = studentCreateSchema.partial();
export type StudentUpdateInput = z.input<typeof studentUpdateSchema>;

export const checkInCreateSchema = z.object({
  occurredAt: z.iso.datetime({ offset: true }).optional(),
});
export type CheckInCreateInput = z.input<typeof checkInCreateSchema>;

export const contactCreateSchema = z.object({
  channel: z.enum(CONTACT_CHANNELS),
  note: z.string().trim().min(1).max(1000),
  followUpOn: z.iso.date().nullish(),
});
export type ContactCreateInput = z.input<typeof contactCreateSchema>;

export const pauseSchema = z.object({
  reason: z.string().trim().min(2).max(200),
});
export type PauseInput = z.input<typeof pauseSchema>;

export const RADAR_SCOPES = ['mine', 'all'] as const;
export type RadarScope = (typeof RADAR_SCOPES)[number];

export const radarQuerySchema = z.object({
  scope: z.enum(RADAR_SCOPES).optional(),
});
