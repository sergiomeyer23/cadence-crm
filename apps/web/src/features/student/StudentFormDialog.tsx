import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useStudentMutation, useTeam } from '@/lib/queries';
import { toLocalDate, type StudentDetail } from '@cadence/shared';
import { LoaderCircle } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

const NO_COACH = 'none';

interface StudentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: string;
  /** Sem aluno, o formulário cadastra um novo. */
  student?: StudentDetail;
  onSaved?: (id: string) => void;
}

function initialState(student: StudentDetail | undefined, today: string) {
  return {
    name: student?.name ?? '',
    phone: student?.phone ?? '',
    email: student?.email ?? '',
    weeklyGoal: String(student?.weeklyGoal ?? 3),
    coachId: student ? (student.coach?.id ?? NO_COACH) : '',
    startedOn: toLocalDate(new Date(today)),
    notes: student?.notes ?? '',
  };
}

export function StudentFormDialog({ open, onOpenChange, today, student, onSaved }: StudentFormDialogProps) {
  const team = useTeam();
  const [form, setForm] = useState(() => initialState(student, today));
  const set = (field: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [field]: value }));

  useEffect(() => {
    if (open) setForm(initialState(student, today));
    // Recomeça o formulário só quando o diálogo abre, não a cada polling do aluno.
  }, [open]);

  const save = useStudentMutation(student?.id ?? null, async () => {
    const common = {
      name: form.name,
      phone: form.phone,
      email: form.email,
      weeklyGoal: Number(form.weeklyGoal),
      notes: form.notes,
    };
    // Sem escolha no cadastro, a API deixa o aluno com o treinador que cadastrou.
    const coachId = form.coachId === '' ? undefined : form.coachId === NO_COACH ? null : form.coachId;
    return student
      ? api.updateStudent(student.id, { ...common, coachId })
      : api.createStudent({ ...common, coachId, startedOn: form.startedOn });
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate(undefined, {
      onSuccess: (saved) => {
        onOpenChange(false);
        onSaved?.(saved.id);
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{student ? 'Editar aluno' : 'Novo aluno'}</DialogTitle>
            <DialogDescription>
              A meta semanal é a base da regra de frequência que decide a coluna do aluno.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="student-name">Nome</Label>
            <Input id="student-name" value={form.name} onChange={(e) => set('name')(e.target.value)} required minLength={2} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="student-phone">Telefone</Label>
              <Input id="student-phone" value={form.phone} onChange={(e) => set('phone')(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="student-email">E-mail</Label>
              <Input id="student-email" type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="student-goal">Treinos por semana</Label>
              <Select value={form.weeklyGoal} onValueChange={set('weeklyGoal')}>
                <SelectTrigger id="student-goal" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}x por semana
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="student-coach">Treinador responsável</Label>
              <Select value={form.coachId} onValueChange={set('coachId')}>
                <SelectTrigger id="student-coach" className="w-full">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_COACH}>Sem treinador</SelectItem>
                  {team.data?.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {!student && (
            <div className="space-y-1.5">
              <Label htmlFor="student-started">Data da matrícula</Label>
              <Input
                id="student-started"
                type="date"
                max={toLocalDate(new Date(today))}
                value={form.startedOn}
                onChange={(e) => set('startedOn')(e.target.value)}
                required
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="student-notes">Observações</Label>
            <Textarea id="student-notes" rows={2} value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
          </div>

          {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <LoaderCircle className="animate-spin" />}
              {student ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
