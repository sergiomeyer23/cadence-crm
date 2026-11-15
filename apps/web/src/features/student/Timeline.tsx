import { formatDateTime, timelineText } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { TimelineEventType, TimelineItem } from '@retention/shared';
import {
  Activity,
  Bandage,
  CircleCheck,
  CirclePlay,
  Dumbbell,
  MessageCircle,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';

const ICON: Record<TimelineEventType, LucideIcon> = {
  ENROLLED: UserPlus,
  CHECK_IN: Dumbbell,
  CONTACT: MessageCircle,
  FOLLOW_UP_DONE: CircleCheck,
  PAUSED: Bandage,
  RESUMED: CirclePlay,
  STATUS_CHANGED: Activity,
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nada registrado ainda.</p>;

  return (
    <ol className="space-y-3">
      {items.map((item) => {
        const Icon = ICON[item.type];
        const { title, detail } = timelineText(item);
        const quiet = item.type === 'CHECK_IN';
        return (
          <li key={item.id} className="flex gap-3">
            <div
              className={cn(
                'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border bg-card',
                item.type === 'STATUS_CHANGED' && 'border-sky-200 bg-sky-50 text-sky-700',
                item.type === 'CONTACT' && 'border-violet-200 bg-violet-50 text-violet-700',
              )}
            >
              <Icon className="size-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <p className={cn('text-sm', quiet ? 'text-muted-foreground' : 'font-medium')}>{title}</p>
                <time className="text-xs text-muted-foreground" dateTime={item.occurredAt}>
                  {formatDateTime(item.occurredAt)}
                </time>
              </div>
              {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
              {item.actor && item.type !== 'CHECK_IN' && <p className="text-xs text-muted-foreground">por {item.actor.name}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
