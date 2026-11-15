import { createDb } from '@retention/db';
import { buildApp } from './app';
import { loadConfig } from './config';
import { createQueues } from './queues';

const config = loadConfig();
const { db, close: closeDb } = createDb(config.databaseUrl);
const queues = createQueues(config.redisUrl);
const app = await buildApp({ db, queues, config });

async function shutdown() {
  await app.close();
  await queues.close();
  await closeDb();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

await app.listen({ port: config.port, host: '0.0.0.0' });
