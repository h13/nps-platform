import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:8787',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'pnpm exec wrangler dev --local --port 8787',
    port: 8787,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
