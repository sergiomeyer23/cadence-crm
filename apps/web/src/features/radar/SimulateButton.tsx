import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { WorkspaceClock } from '@retention/shared';
import { FastForward, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

/** Se o worker estiver parado, o botão volta ao normal depois deste tempo. */
const GIVE_UP_MS = 20_000;

export function SimulateButton({ clock }: { clock: WorkspaceClock }) {
  const client = useQueryClient();
  const [waitingFromWeek, setWaitingFromWeek] = useState<number | null>(null);
  const simulate = useMutation({
    mutationFn: api.simulateWeek,
    onSuccess: () => {
      setWaitingFromWeek(clock.simulatedWeeks);
      void client.invalidateQueries({ queryKey: ['radar'] });
    },
  });

  useEffect(() => {
    if (waitingFromWeek !== null && clock.simulatedWeeks > waitingFromWeek) {
      setWaitingFromWeek(null);
      void client.invalidateQueries({ queryKey: ['report'] });
    }
  }, [clock.simulatedWeeks, waitingFromWeek, client]);

  useEffect(() => {
    if (waitingFromWeek === null) return;
    const timer = setTimeout(() => setWaitingFromWeek(null), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [waitingFromWeek]);

  const busy = simulate.isPending || waitingFromWeek !== null || clock.simulationPending;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={() => simulate.mutate()} disabled={busy}>
        {busy ? <LoaderCircle className="animate-spin" /> : <FastForward />}
        {busy ? 'Simulando semana...' : 'Simular semana de treinos'}
      </Button>
      {simulate.error && <p className="text-xs text-destructive">{simulate.error.message}</p>}
    </div>
  );
}
