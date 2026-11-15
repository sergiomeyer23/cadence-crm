import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { api } from '@/lib/api';
import {
  CHANNEL_LABEL,
  STATUS_LABEL,
  absenceText,
  formatLocalDate,
  percent,
  plural,
  reasonsText,
} from '@/lib/format';
import { useStudent, useStudentMutation, useTimeline } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { SessionUser, StudentDetail } from '@cadence/shared';
import { Archive, Bandage, CalendarClock, CirclePlay, Dumbbell, LoaderCircle, Mail, Pencil, Phone } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { STATUS_STYLE } from '../radar/status';
import { ContactForm } from './ContactForm';
import { StudentFormDialog } from './StudentFormDialog';
import { Timeline } from './Timeline';

interface StudentSheetProps {
  studentId: string | null;
  user: SessionUser;
  today: string;
  onClose: () => void;
}

export function StudentSheet({ studentId, user, today, onClose }: StudentSheetProps) {
  const student = useStudent(studentId);
  const timeline = useTimeline(studentId);

  return (
    <Sheet open={studentId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        {student.data ? (
          <StudentPanel student={student.data} user={user} today={today} onArchived={onClose}>
            {timeline.data && <Timeline items={timeline.data} />}
          </StudentPanel>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>Carregando aluno</SheetTitle>
              <SheetDescription className="sr-only">Buscando os dados do aluno</SheetDescription>
            </SheetHeader>
            <div className="grid h-40 place-items-center text-muted-foreground">
              {student.error ? (
                <p className="text-sm text-destructive">{student.error.message}</p>
              ) : (
                <LoaderCircle className="size-5 animate-spin" />
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 px-4 py-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold leading-tight tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface StudentPanelProps {
  student: StudentDetail;
  user: SessionUser;
  today: string;
  onArchived: () => void;
  children: ReactNode;
}

function StudentPanel({ student, user, today, onArchived, children }: StudentPanelProps) {
  const style = STATUS_STYLE[student.status];
  const paused = student.pausedAt !== null;
  const [editing, setEditing] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [pauseReason, setPauseReason] = useState('');

  const checkIn = useStudentMutation(student.id, () => api.checkIn(student.id));
  const pause = useStudentMutation(student.id, () => api.pause(student.id, { reason: pauseReason }));
  const resume = useStudentMutation(student.id, () => api.resume(student.id));
  const completeFollowUp = useStudentMutation(student.id, (contactId: string) => api.completeFollowUp(contactId));
  const archive = useStudentMutation(student.id, () => api.archiveStudent(student.id));

  const actionError = checkIn.error ?? pause.error ?? resume.error ?? archive.error ?? completeFollowUp.error;

  function submitPause(event: FormEvent) {
    event.preventDefault();
    pause.mutate(undefined, {
      onSuccess: () => {
        setPausing(false);
        setPauseReason('');
      },
    });
  }

  function confirmArchive() {
    if (window.confirm(`Arquivar ${student.name}? O histórico continua guardado.`)) {
      archive.mutate(undefined, { onSuccess: onArchived });
    }
  }

  return (
    <>
      <SheetHeader className="border-b pr-12">
        <div className="flex flex-wrap items-center gap-2">
          <SheetTitle className="text-lg">{student.name}</SheetTitle>
          <Badge variant="outline" className={cn('font-medium', style.badge)}>
            {STATUS_LABEL[student.status]}
          </Badge>
        </div>
        <SheetDescription>
          {student.coach ? `Treinador: ${student.coach.name}` : 'Sem treinador'} · Meta de {student.weeklyGoal}x por semana ·
          Aluno desde {formatLocalDate(student.startedOn)}
        </SheetDescription>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {student.phone && (
            <span className="flex items-center gap-1.5">
              <Phone className="size-3.5" />
              {student.phone}
            </span>
          )}
          {student.email && (
            <span className="flex items-center gap-1.5">
              <Mail className="size-3.5" />
              {student.email}
            </span>
          )}
        </div>
        {student.notes && <p className="text-sm">{student.notes}</p>}
      </SheetHeader>

      <Section title="Frequência">
        {paused ? (
          <p className="text-sm text-muted-foreground">
            Pausa por lesão: {student.pauseReason}. A regra de frequência volta a valer na retomada.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Metric
                label="Treinos na janela"
                value={student.expectedInWindow === null ? `${student.checkInsInWindow}` : `${student.checkInsInWindow} de ${Math.round(student.expectedInWindow)}`}
                hint={student.expectedInWindow === null ? 'período de adaptação' : undefined}
              />
              <Metric label="Aderência" value={percent(student.adherence)} />
              <Metric label="Sem treinar" value={plural(Math.floor(student.daysAbsent), 'dia', 'dias')} />
            </div>
            <p className="text-xs text-muted-foreground">
              {absenceText(student)}.{student.reasons.length > 0 && ` Motivo do status: ${reasonsText(student.reasons)}.`}
            </p>
          </>
        )}

        <div className="flex flex-wrap gap-2">
          {!paused && (
            <Button size="sm" onClick={() => checkIn.mutate(undefined)} disabled={checkIn.isPending}>
              {checkIn.isPending ? <LoaderCircle className="animate-spin" /> : <Dumbbell />}
              Registrar treino
            </Button>
          )}
          {paused ? (
            <Button size="sm" variant="outline" onClick={() => resume.mutate(undefined)} disabled={resume.isPending}>
              <CirclePlay />
              Retomar acompanhamento
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setPausing((v) => !v)}>
              <Bandage />
              Pausar por lesão
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil />
            Editar
          </Button>
          {user.role === 'OWNER' && (
            <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={confirmArchive}>
              <Archive />
              Arquivar
            </Button>
          )}
        </div>

        {pausing && !paused && (
          <form onSubmit={submitPause} className="flex gap-2">
            <Input
              autoFocus
              placeholder="Motivo, ex.: entorse no tornozelo"
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              required
              minLength={2}
            />
            <Button type="submit" size="sm" className="h-9" disabled={pause.isPending}>
              Confirmar pausa
            </Button>
          </form>
        )}
        {actionError && <p className="text-sm text-destructive">{actionError.message}</p>}
      </Section>

      {student.openFollowUps.length > 0 && (
        <>
          <Separator />
          <Section title="Follow-ups pendentes">
            <ul className="space-y-2">
              {student.openFollowUps.map((followUp) => (
                <li key={followUp.contactId} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0 text-sm">
                    <p className={cn('flex items-center gap-1.5 font-medium', followUp.overdue && 'text-rose-700')}>
                      <CalendarClock className="size-3.5" />
                      {formatLocalDate(followUp.followUpOn)}
                      {followUp.overdue && ' (atrasado)'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {CHANNEL_LABEL[followUp.channel]}: {followUp.note}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => completeFollowUp.mutate(followUp.contactId)}
                    disabled={completeFollowUp.isPending}
                  >
                    Concluir
                  </Button>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}

      <Separator />
      <Section title="Registrar contato">
        <ContactForm studentId={student.id} today={today} />
      </Section>

      <Separator />
      <Section title="Linha do tempo">{children}</Section>

      <StudentFormDialog open={editing} onOpenChange={setEditing} today={today} student={student} />
    </>
  );
}
