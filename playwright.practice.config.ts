import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PRACTICE_URL ?? `http://127.0.0.1:4174${process.env.PRACTICE_BASE_PATH || '/domain-expansion-ar-game/'}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/practice.spec.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  outputDir: 'practice-test-results',
  use: { baseURL, trace: 'retain-on-failure', ...devices['Desktop Chrome'] },
  webServer: process.env.PRACTICE_URL ? undefined : {
    command: 'node scripts/serve-practice.mjs',
    url: baseURL,
    reuseExistingServer: false
  }
});
