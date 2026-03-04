import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    exclude: ['widget/**', 'node_modules/**'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/templates/**', 'src/env.d.ts', 'src/test-helpers/**'],
      thresholds: {
        statements: 75,
        branches: 75,
        functions: 65,
        lines: 70,
      },
    },
  },
});
