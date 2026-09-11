import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const port = process.env.E2E_PORT || '4173';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    baseURL,
  },
  webServer: {
    command: 'node tests/e2e/mock-server.mjs',
    url: `${baseURL}/fixture.html`,
    reuseExistingServer: false,
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
