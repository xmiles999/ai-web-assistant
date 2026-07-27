import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    baseURL: 'http://127.0.0.1:4173',
  },
  webServer: {
    command: 'node tests/e2e/mock-server.mjs',
    url: 'http://127.0.0.1:4173/fixture.html',
    reuseExistingServer: true,
  },
  projects: [
    {
      name: 'chromium-extension',
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
        channel: 'chromium',
        launchOptions: {
          args: [
            `--disable-extensions-except=${resolve('dist')}`,
            `--load-extension=${resolve('dist')}`,
          ],
        },
      },
    },
  ],
});
