import { expect, test } from '@playwright/test';

test.describe('extension fixture', () => {
  test('runs the built content script, shows the toolbar and sends a structured action', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as typeof window & { __lastMessage?: unknown }).__lastMessage = undefined;
      Object.defineProperty(window, 'chrome', {
        value: {
          runtime: {
            sendMessage: (message: unknown) => {
              (window as typeof window & { __lastMessage?: unknown }).__lastMessage = message;
              return Promise.resolve({ ok: true });
            },
          },
        },
      });
    });
    await page.goto('/fixture.html');
    await page.addScriptTag({ path: 'dist/content-script.js' });
    await page.locator('#text').selectText();
    const toolbar = page.locator('[data-ai-web-assistant="toolbar"]');
    await expect(toolbar.locator('button', { hasText: '总结' })).toBeVisible();
    await toolbar.locator('button', { hasText: '总结' }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as typeof window & { __lastMessage?: { actionId?: string } }).__lastMessage
              ?.actionId,
        ),
      )
      .toBe('summarize');
  });

  test('runs the full extension stream when the browser exposes extension workers', async ({
    context,
    page,
  }) => {
    const serviceWorker = context.serviceWorkers()[0];
    test.skip(
      !serviceWorker,
      '当前无头 Chromium 不提供扩展 Service Worker；请使用 headed Chromium 运行完整链路',
    );
    if (!serviceWorker) return;
    const extensionId = new URL(serviceWorker.url()).hostname;
    await page.goto('/fixture.html');
    const control = await context.newPage();
    await control.goto(`chrome-extension://${extensionId}/popup.html`);
    await control.evaluate(() => {
      const button = document.createElement('button');
      button.id = 'e2e-grant';
      button.addEventListener('click', () => {
        void chrome.permissions
          .request({ origins: ['http://127.0.0.1:4173/*'] })
          .then((granted) => {
            (window as typeof window & { __granted?: boolean }).__granted = granted;
          });
      });
      document.body.append(button);
    });
    await control.locator('#e2e-grant').click();
    await expect
      .poll(() =>
        control.evaluate(() => (window as typeof window & { __granted?: boolean }).__granted),
      )
      .toBe(true);
    await control.evaluate(async () => {
      const now = new Date().toISOString();
      const stored = await chrome.storage.local.get(['settings']);
      const rawSettings: unknown = stored.settings;
      const currentSettings = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
      await chrome.storage.local.set({
        settings: { ...currentSettings, activeProviderId: 'e2e-provider', historyEnabled: false },
        providers: [
          {
            id: 'e2e-provider',
            name: 'E2E Mock',
            protocol: 'openai-compatible',
            baseUrl: 'http://127.0.0.1:4173/v1',
            model: 'e2e-model',
            apiKeyRequired: false,
            secretStorage: 'session',
            temperature: 0,
            maxOutputTokens: 64,
            timeoutMs: 10_000,
            enabled: true,
            createdAt: now,
            updatedAt: now,
          },
        ],
      });
      const tabs = await chrome.tabs.query({});
      const fixture = tabs.find((tab) => tab.url?.startsWith('http://127.0.0.1:4173/fixture'));
      if (!fixture?.id || !fixture.url) throw new Error('找不到测试标签页');
      const response: unknown = await chrome.runtime.sendMessage({
        type: 'SET_SITE_PERMISSION',
        tabId: fixture.id,
        url: fixture.url,
        enabled: true,
      });
      if (!response || typeof response !== 'object' || !('ok' in response))
        throw new Error('权限响应格式无效');
      if (!response.ok)
        throw new Error(
          'error' in response && typeof response.error === 'string' ? response.error : '授权失败',
        );
    });
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.locator('#text').selectText();
    const toolbar = page.locator('[data-ai-web-assistant="toolbar"]');
    await toolbar.locator('button', { hasText: '总结' }).click();
    await expect(panel.locator('.markdown')).toContainText('测试流式回答');
  });
});
