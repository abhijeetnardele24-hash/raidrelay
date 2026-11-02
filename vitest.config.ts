import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts', 'apps/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@raidrelay/contracts': path.resolve(__dirname, './packages/contracts/src'),
      '@raidrelay/domain': path.resolve(__dirname, './packages/domain/src'),
      '@raidrelay/fixtures': path.resolve(__dirname, './packages/fixtures/src'),
    },
  },
});

