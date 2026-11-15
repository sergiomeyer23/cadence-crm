import { RETENTION_STATUSES, type RadarResponse, type RetentionStatus } from '@cadence/shared';
import { cn } from '@/lib/utils';
import { STATUS_STYLE } from './status';
import { StudentCard } from './StudentCard';

interface BoardProps {
  radar: RadarResponse;
  showCoach: boolean;
  moved: Map<string, RetentionStatus>;
  onOpen: (id: string) => void;
}

export function Board({ radar, showCoach, moved, onOpen }: BoardProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {RETENTION_STATUSES.map((status) => {
        const style = STATUS_STYLE[status];
        const cards = radar.columns[status];
        const Icon = style.icon;
        return (
          <section key={status} className={cn('flex min-h-48 flex-col rounded-xl border', style.column)}>
            <header className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
              <div className="flex items-center gap-2">
                <Icon className={cn('size-4', style.accent)} />
                <h2 className="text-sm font-semibold">{style.title}</h2>
                <span className="text-xs text-muted-foreground">{status}</span>
              </div>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', style.badge)}>{cards.length}</span>
            </header>
            <p className="px-4 pb-3 text-xs text-muted-foreground">{style.hint}</p>
            <div className="flex max-h-[calc(100vh-17rem)] flex-col gap-2 overflow-y-auto px-3 pb-3">
              {cards.length === 0 && (
                <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                  Nenhum aluno aqui
                </p>
              )}
              {cards.map((card) => (
                <StudentCard
                  key={card.id}
                  card={card}
                  showCoach={showCoach}
                  movedFrom={moved.get(card.id)}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
