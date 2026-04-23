import { defineConfig, devices } from '@playwright/test';

// Smoke-test config for apps/web. Runs against a locally-started Next.js
// dev server and only exercises public (unauthenticated) routes by
// default — auth'd flows require fixture users and are left for a
// follow-up. See apps/web/e2e/README.md for setup.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Next.js dev mode can be slow to compile on first hit — give pages
    // more than the default 5s before failing.
    navigationTimeout: 20_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Auto-spawn the dev server if nothing is already listening on :3000.
  // `reuseExistingServer` keeps local `npm run dev` sessions working.
  webServer: {
    command: 'npm run dev -- --port 3000',
    url: 'http://localhost:3000',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
