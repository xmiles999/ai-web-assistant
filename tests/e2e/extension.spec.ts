import { expect, test } from '@playwright/test';

test.describe('extension fixture', () => {
  test('shows the all-site toolbar and renders streamed content in the inline panel', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as typeof window & { __lastMessage?: unknown }).__lastMessage = undefined;
      Object.defineProperty(window, 'chrome', {
        value: {
          runtime: {
            sendMessage: (message: { type?: string; actionId?: string; selection?: unknown }) => {
              (window as typeof window & { __lastMessage?: unknown }).__lastMessage = message;
              return Promise.resolve({
                ok: true,
                data: {
                  requestId: 'e2e-inline',
                  actionId: message.actionId,
                  selection: message.selection,
                  createdAt: new Date().toISOString(),
                },
              });
            },
            connect: () => {
              const listeners: Array<(message: unknown) => void> = [];
              return {
                onMessage: {
                  addListener: (listener: (message: unknown) => void) => listeners.push(listener),
                },
                postMessage: (message: { type?: string; task?: { requestId?: string } }) => {
                  if (message.type !== 'START_STREAM') return;
                  const requestId = message.task?.requestId ?? 'e2e-inline';
                  setTimeout(
                    () =>
                      listeners.forEach((listener) =>
                        listener({
                          type: 'STREAM_START',
                          requestId,
                          providerName: 'Mock',
                          model: 'test',
                        }),
                      ),
                    10,
                  );
                  setTimeout(
                    () =>
                      listeners.forEach((listener) =>
                        listener({ type: 'STREAM_CHUNK', requestId, text: '测试流式回答' }),
                      ),
                    20,
                  );
                  setTimeout(
                    () =>
                      listeners.forEach((listener) =>
                        listener({ type: 'STREAM_COMPLETE', requestId }),
                      ),
                    30,
                  );
                },
                disconnect: () => undefined,
              };
            },
          },
        },
      });
    });
    await page.goto('/fixture.html');
    await page.addScriptTag({ path: 'dist/content-script.js' });
    await page.locator('#text').selectText();
    const extension = page.locator('[data-ai-web-assistant="root"]');
    await expect(extension.locator('button', { hasText: '总结' })).toBeVisible();
    await extension.locator('button', { hasText: '总结' }).click();
    await expect(extension.locator('.result-panel')).toBeVisible();
    await expect(extension.locator('.result-text')).toContainText('测试流式回答');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as typeof window & { __lastMessage?: { presentation?: string } }).__lastMessage
              ?.presentation,
        ),
      )
      .toBe('inline');
  });

  test('runs the full inline stream when the browser exposes extension workers', async ({
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
    const control = await context.newPage();
    await control.goto(`chrome-extension://${extensionId}/popup.html`);
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
    });
    await page.goto('/fixture.html');
    await page.locator('#text').selectText();
    const extension = page.locator('[data-ai-web-assistant="root"]');
    await extension.locator('button', { hasText: '总结' }).click();
    await expect(extension.locator('.result-text')).toContainText('测试流式回答');
  });
});
