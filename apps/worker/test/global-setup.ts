import { loadEnv, runMigrations } from '@retention/db';

export default async function setup() {
  loadEnv();
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('Defina TEST_DATABASE_URL (veja o .env.example) e suba o Postgres com docker compose.');
  await runMigrations(url);
}
