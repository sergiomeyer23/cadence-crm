import type { RadarResponse, RetentionStatus } from '@cadence/shared';
import { useEffect, useRef, useState } from 'react';

const HIGHLIGHT_MS = 6_000;

/**
 * Compara cada resposta do polling com a anterior e devolve, por alguns
 * segundos, os alunos que trocaram de coluna e de onde vieram.
 */
export function useMovedCards(data: RadarResponse | undefined): Map<string, RetentionStatus> {
  const previous = useRef<Map<string, RetentionStatus> | null>(null);
  const [moved, setMoved] = useState<Map<string, RetentionStatus>>(() => new Map());

  useEffect(() => {
    if (!data) return;
    const current = new Map<string, RetentionStatus>();
    for (const cards of Object.values(data.columns)) for (const card of cards) current.set(card.id, card.status);

    const changes = new Map<string, RetentionStatus>();
    if (previous.current) {
      for (const [id, status] of current) {
        const before = previous.current.get(id);
        if (before && before !== status) changes.set(id, before);
      }
    }
    previous.current = current;
    if (changes.size === 0) return;

    setMoved((old) => new Map([...old, ...changes]));
    const timer = setTimeout(() => {
      setMoved((old) => {
        const next = new Map(old);
        for (const id of changes.keys()) next.delete(id);
        return next;
      });
    }, HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [data]);

  return moved;
}
