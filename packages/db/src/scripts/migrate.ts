import { loadEnv, requireEnv } from '../env';
import { runMigrations } from '../client';

loadEnv();
await runMigrations(requireEnv('DATABASE_URL'));
console.log('Migrations aplicadas.');
