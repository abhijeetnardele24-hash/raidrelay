import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'docs/playwright-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4000',
    trace: 'off',
    channel: 'chrome',
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
      },
    },
    {
      name: 'Mobile Viewport (390px)',
      use: {
        viewport: { width: 390, height: 844 },
        channel: 'chrome',
      },
    },
  ],
  webServer: {
    command: 'npx tsx apps/server/src/index.ts',
    url: 'http://127.0.0.1:4000/api/health',
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      PORT: '4000',
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      APP_BASE_URL: 'http://127.0.0.1:4000',
      CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:4000,http://localhost:4000',
      SESSION_SECRET: 'playwright-test-session-secret-at-least-32-chars-long-0123',
      HMAC_VOTER_SALT: 'playwright-test-voter-salt-at-least-32-chars-long-0123',
    },
  },
});

