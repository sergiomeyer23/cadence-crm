import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { keys } from '@/lib/queries';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dumbbell, LoaderCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';

const DEMO_ACCOUNTS = [
  { email: 'helena@ritmo.test', who: 'Helena Prado', role: 'dona da Academia Ritmo' },
  { email: 'rafael@ritmo.test', who: 'Rafael Monteiro', role: 'treinador da Academia Ritmo' },
  { email: 'marcos@personal.test', who: 'Marcos Vilela', role: 'personal autônomo' },
];
const DEMO_PASSWORD = 'demo1234';

export function LoginPage() {
  const client = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () => api.login(email, password),
    onSuccess: (user) => client.setQueryData(keys.me, user),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    login.mutate();
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Dumbbell className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Retention Gym CRM</h1>
            <p className="text-sm text-muted-foreground">Acompanhe quem está deixando de treinar</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {login.error && <p className="text-sm text-destructive">{login.error.message}</p>}
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending && <LoaderCircle className="animate-spin" />}
            Entrar
          </Button>
        </form>

        {import.meta.env.DEV && (
          <div className="mt-6 space-y-2 text-sm">
            <p className="text-muted-foreground">Contas da demonstração (senha {DEMO_PASSWORD}):</p>
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(DEMO_PASSWORD);
                }}
                className="block w-full rounded-md border border-dashed px-3 py-2 text-left hover:bg-accent"
              >
                <span className="font-medium">{account.who}</span>
                <span className="text-muted-foreground">, {account.role}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
