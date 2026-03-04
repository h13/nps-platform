import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['widget/src/**/*.test.ts'],
    coverage: {
      provider: 'istanbul',
      include: ['widget/src/**/*.ts'],
      exclude: ['widget/src/**/*.test.ts'],
    },
  },
});
