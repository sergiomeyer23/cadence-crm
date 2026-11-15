import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { CHANNEL_LABEL } from '@/lib/format';
import { useStudentMutation } from '@/lib/queries';
import { CONTACT_CHANNELS, toLocalDate, type ContactChannel } from '@retention/shared';
import { LoaderCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';

export function ContactForm({ studentId, today }: { studentId: string; today: string }) {
  const [channel, setChannel] = useState<ContactChannel>('WHATSAPP');
  const [note, setNote] = useState('');
  const [followUpOn, setFollowUpOn] = useState('');
  const save = useStudentMutation(studentId, () =>
    api.contact(studentId, { channel, note, followUpOn: followUpOn || null }),
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate(undefined, {
      onSuccess: () => {
        setNote('');
        setFollowUpOn('');
      },
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="contact-channel">Canal</Label>
          <Select value={channel} onValueChange={(value) => setChannel(value as ContactChannel)}>
            <SelectTrigger id="contact-channel" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTACT_CHANNELS.map((c) => (
                <SelectItem key={c} value={c}>
                  {CHANNEL_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact-follow-up">Follow-up em (opcional)</Label>
          <Input
            id="contact-follow-up"
            type="date"
            min={toLocalDate(new Date(today))}
            value={followUpOn}
            onChange={(e) => setFollowUpOn(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact-note">O que foi conversado</Label>
        <Textarea
          id="contact-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ex.: disse que mudou de turno no trabalho e vai tentar vir às 6h"
          required
        />
      </div>
      {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
      <Button type="submit" disabled={save.isPending || note.trim().length === 0}>
        {save.isPending && <LoaderCircle className="animate-spin" />}
        Registrar contato
      </Button>
    </form>
  );
}
