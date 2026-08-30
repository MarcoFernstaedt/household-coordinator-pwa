import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    environmentOptions: { jsdom: { url: 'http://localhost:4173/' } },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 65 },
      exclude: ['tools/**', 'src/server/index.ts'],
    },
  },
});
