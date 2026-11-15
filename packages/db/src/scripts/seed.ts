import { createDb } from '../client';
import { loadEnv, requireEnv } from '../env';
import { DEMO_PASSWORD, seedDatabase } from '../seed';

loadEnv();
const { db, close } = createDb(requireEnv('DATABASE_URL'));
try {
  const { gym, solo } = await seedDatabase(db);
  console.log(`${gym.workspace.name}: ${gym.students} alunos, ${gym.checkIns} check-ins`);
  console.log(`${solo.workspace.name}: ${solo.students} alunos, ${solo.checkIns} check-ins`);
  console.log(`Senha de todos os usuários: ${DEMO_PASSWORD}`);
} finally {
  await close();
}
