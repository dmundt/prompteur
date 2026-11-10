import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: { alias: { vscode: resolve(__dirname, 'tests/vscode-mock.ts') } },
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      thresholds: { lines: 91, functions: 91, branches: 91, statements: 91 },
      reporter: ['text', 'lcov'],
    },
  },
});
