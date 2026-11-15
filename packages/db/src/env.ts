import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Carrega o .env da raiz do monorepo sem sobrescrever variáveis já definidas. */
export function loadEnv(): void {
  const file = join(repoRoot, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ${name} não definida. Veja o .env.example.`);
  return value;
}
