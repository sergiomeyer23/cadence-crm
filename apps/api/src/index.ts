import { createDb } from '@cadence/db';
import { Redis } from 'ioredis';
import { buildApp } from './app';
import { loadConfig } from './config';
import { createQueues } from './queues';

const config = loadConfig();
const { db, close: closeDb } = createDb(config.databaseUrl);
const queues = createQueues(config.redisUrl);
const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 2_000 });
const app = await buildApp({ db, queues, redis, config });

async function shutdown() {
  await app.close();
  await queues.close();
  redis.disconnect();
  await closeDb();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

await app.listen({ port: config.port, host: '0.0.0.0' });
