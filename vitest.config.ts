import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
    coverage: {
      provider: 'istanbul',
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
