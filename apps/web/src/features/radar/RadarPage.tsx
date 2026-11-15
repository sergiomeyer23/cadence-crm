import { BRAND_NAME, BRAND_SUBTITLE, CadenceMark } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { formatLongDate, plural } from '@/lib/format';
import { useRadar } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';
import type { RadarScope, SessionUser } from '@cadence/shared';
import { LoaderCircle, LogOut, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { StudentFormDialog } from '../student/StudentFormDialog';
import { StudentSheet } from '../student/StudentSheet';
import { Board } from './Board';
import { ReportStrip } from './ReportStrip';
import { SimulateButton } from './SimulateButton';
import { useMovedCards } from './useMovedCards';

export function RadarPage({ user }: { user: SessionUser }) {
  const client = useQueryClient();
  const isGym = user.workspace.kind === 'GYM';
  const [scope, setScope] = useState<RadarScope>(user.role === 'COACH' ? 'mine' : 'all');
  const radar = useRadar(isGym ? scope : undefined);
  const moved = useMovedCards(radar.data);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function logout() {
    await api.logout();
    client.clear();
    client.setQueryData(['me'], null);
  }

  const clock = radar.data?.clock;

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <CadenceMark />
              <div>
                <h1 className="font-semibold leading-tight tracking-tight">{BRAND_NAME}</h1>
                <p className="text-xs text-muted-foreground">{BRAND_SUBTITLE}</p>
              </div>
            </div>
            <div className="hidden border-l pl-4 sm:block">
              <p className="text-sm font-medium leading-tight">{user.workspace.name}</p>
              {clock && (
                <p className="text-xs text-muted-foreground">
                  {formatLongDate(clock.now)}
                  {clock.simulatedWeeks > 0 && ` (${plural(clock.simulatedWeeks, 'semana simulada', 'semanas simuladas')})`}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isGym && (
              <Tabs value={scope} onValueChange={(value) => setScope(value as RadarScope)}>
                <TabsList>
                  <TabsTrigger value="mine">Meus alunos</TabsTrigger>
                  <TabsTrigger value="all">Toda a academia</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <Button variant="outline" onClick={() => setCreating(true)}>
              <UserPlus />
              Novo aluno
            </Button>
            {user.role === 'OWNER' && clock && <SimulateButton clock={clock} />}
            <div className="flex items-center gap-2 border-l pl-3">
              <span className="text-sm text-muted-foreground">{user.name}</span>
              <Button variant="ghost" size="icon-sm" onClick={logout} aria-label="Sair">
                <LogOut />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-4 px-6 py-5">
        <ReportStrip onOpen={setOpenId} />
        {radar.data ? (
          <Board radar={radar.data} showCoach={isGym && scope === 'all'} moved={moved} onOpen={setOpenId} />
        ) : radar.error ? (
          <p className="text-sm text-destructive">{radar.error.message}</p>
        ) : (
          <div className="grid h-64 place-items-center text-muted-foreground">
            <LoaderCircle className="size-6 animate-spin" />
          </div>
        )}
      </main>

      <StudentSheet
        studentId={openId}
        user={user}
        today={clock?.now ?? new Date().toISOString()}
        onClose={() => setOpenId(null)}
      />
      <StudentFormDialog
        open={creating}
        onOpenChange={setCreating}
        today={clock?.now ?? new Date().toISOString()}
        onSaved={(id) => setOpenId(id)}
      />
    </div>
  );
}
