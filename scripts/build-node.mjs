// Gera o bundle de produção de um app Node (api ou worker).
// Uso, a partir da pasta do app:
//   node ../../scripts/build-node.mjs index=src/index.ts [nome=entrada ...] [--copy=origem:destino ...]
//
// O código dos pacotes @cadence/* entra no bundle, porque eles são publicados
// como TypeScript. Todo o resto continua vindo do node_modules em tempo de execução.
import { build } from 'esbuild';
import { cpSync, rmSync } from 'node:fs';

const args = process.argv.slice(2);
const copies = args.filter((arg) => arg.startsWith('--copy=')).map((arg) => arg.slice('--copy='.length).split(':'));
const entryPoints = args.filter((arg) => !arg.startsWith('--')).map((arg) => {
  const [out, entry] = arg.split('=');
  if (!out || !entry) throw new Error(`Entrada inválida: ${arg}. Use nome=caminho.`);
  return { out, in: entry };
});

const externalDependencies = {
  name: 'external-dependencies',
  setup(context) {
    context.onResolve({ filter: /^[^./]/ }, (args) =>
      args.path.startsWith('@cadence/') ? undefined : { path: args.path, external: true },
    );
  },
};

rmSync('dist', { recursive: true, force: true });
await build({
  entryPoints,
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
  plugins: [externalDependencies],
});

for (const [from, to] of copies) {
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  console.log(`copiado ${from} -> ${to}`);
}
