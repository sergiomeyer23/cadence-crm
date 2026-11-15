import type { TimelineEventType, TimelinePayloads } from '@cadence/shared';
import type { Executor } from './client';
import { timelineEvents, type NewTimelineEvent } from './schema';

interface EventBase {
  workspaceId: string;
  studentId: string;
  occurredAt: Date;
  actorId?: string | null;
}

export function timelineEvent<K extends TimelineEventType>(
  type: K,
  base: EventBase,
  payload: TimelinePayloads[K],
): NewTimelineEvent {
  return { ...base, actorId: base.actorId ?? null, type, payload: { ...payload } };
}

export async function recordEvent<K extends TimelineEventType>(
  db: Executor,
  type: K,
  base: EventBase,
  payload: TimelinePayloads[K],
): Promise<void> {
  await db.insert(timelineEvents).values(timelineEvent(type, base, payload));
}
