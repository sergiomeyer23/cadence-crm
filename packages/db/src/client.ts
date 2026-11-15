import { drizzle, type PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import * as schema from './schema';

export function createDb(url: string, options: { max?: number } = {}) {
  const client = postgres(url, { max: options.max ?? 10, onnotice: () => {} });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end({ timeout: 5 }) };
}

export type Db = ReturnType<typeof createDb>['db'];

/** Aceita tanto a conexão quanto uma transação aberta. */
export type Executor = PgDatabase<PostgresJsQueryResultHKT, typeof schema>;

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');

export async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end({ timeout: 5 });
  }
}
