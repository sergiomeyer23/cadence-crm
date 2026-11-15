import { LoaderCircle } from 'lucide-react';
import { LoginPage } from './features/auth/LoginPage';
import { RadarPage } from './features/radar/RadarPage';
import { useMe } from './lib/queries';

export function App() {
  const me = useMe();

  if (me.isPending) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    );
  }

  return me.data ? <RadarPage user={me.data} /> : <LoginPage />;
}
