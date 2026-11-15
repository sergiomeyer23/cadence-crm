import { Badge } from '@/components/ui/badge';
import { STATUS_LABEL, absenceText, formatLocalDate, frequencyText } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { RadarCard, RetentionStatus } from '@retention/shared';
import { CalendarClock } from 'lucide-react';

interface StudentCardProps {
  card: RadarCard;
  showCoach: boolean;
  movedFrom?: RetentionStatus;
  onOpen: (id: string) => void;
}

export function StudentCard({ card, showCoach, movedFrom, onOpen }: StudentCardProps) {
  const paused = card.status === 'PAUSED_INJURY';

  return (
    <button
      type="button"
      onClick={() => onOpen(card.id)}
      className={cn(
        'w-full rounded-lg border bg-card p-3 text-left shadow-xs transition hover:border-foreground/25 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        movedFrom && 'card-moved border-sky-300',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-snug">{card.name}</span>
        {card.nextFollowUpOn && (
          <Badge
            variant="outline"
            className={cn(
              'shrink-0 gap-1 text-[11px] font-normal',
              card.followUpOverdue && 'border-rose-200 bg-rose-50 text-rose-700',
            )}
          >
            <CalendarClock className="size-3" />
            {card.followUpOverdue ? 'atrasado' : formatLocalDate(card.nextFollowUpOn)}
          </Badge>
        )}
      </div>

      {showCoach && card.coach && <p className="mt-0.5 text-xs text-muted-foreground">{card.coach.name}</p>}

      <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        {paused ? (
          <p>{card.pauseReason}</p>
        ) : (
          <>
            <p>{frequencyText(card)}</p>
            <p>{absenceText(card)}</p>
          </>
        )}
      </div>

      {movedFrom && <p className="mt-2 text-[11px] font-medium text-sky-700">Veio de {STATUS_LABEL[movedFrom]}</p>}
    </button>
  );
}
