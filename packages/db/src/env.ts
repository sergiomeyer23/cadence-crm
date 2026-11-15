import { resolveFrequencyRule, type FrequencyRuleConfig } from '@cadence/shared';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Carrega o .env da raiz do monorepo sem sobrescrever variáveis já definidas.
 * A raiz é procurada a partir do diretório atual, e não do arquivo, porque
 * depois do build este código vive dentro do dist de cada app. Fora do
 * monorepo (num container, por exemplo) nada é carregado.
 */
export function loadEnv(): void {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      const file = join(dir, '.env');
      if (existsSync(file)) process.loadEnvFile(file);
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ${name} não definida. Veja o .env.example.`);
  return value;
}

/** Regra de frequência com os ajustes de FREQUENCY_RULE_OVERRIDES, se houver. */
export function loadFrequencyRule(): FrequencyRuleConfig {
  const raw = process.env.FREQUENCY_RULE_OVERRIDES;
  return resolveFrequencyRule(raw ? (JSON.parse(raw) as Partial<FrequencyRuleConfig>) : {});
}
