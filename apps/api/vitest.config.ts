import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Os testes dividem o mesmo banco de teste, então rodam um arquivo por vez.
    fileParallelism: false,
    globalSetup: './test/global-setup.ts',
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
