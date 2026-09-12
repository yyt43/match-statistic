import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    pool: 'threads',
    maxWorkers: 1,
    minWorkers: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 49,
        branches: 43,
        functions: 56,
        lines: 51,
      },
    },
  },
});
