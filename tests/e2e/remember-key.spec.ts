import { chromium, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

test('remembers a key across a real browser restart and reuses it for AI requests', async ({
  browserName,
  baseURL,
}, testInfo) => {
  test.setTimeout(90_000);
  expect(browserName).toBe('chromium');
  const profilePath = await mkdtemp(resolve(tmpdir(), 'ai-web-assistant-key-'));
  const launch = () =>
    chromium.launchPersistentContext(profilePath, {
      channel: 'chromium',
      headless: true,
      viewport: { width: 1280, height: 900 },
      args: [
        `--disable-extensions-except=${resolve('dist')}`,
        `--load-extension=${resolve('dist')}`,
      ],
    });
  let context = await launch();
  const errors: string[] = [];
  const openSettings = async () => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(`chrome-extension://${new URL(worker.url()).hostname}/options.html`);
    await expect(page).toHaveTitle('AI 网页助手设置');
    await expect(page.getByRole('heading', { name: '服务配置', exact: true })).toBeVisible();
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    return page;
  };

  try {
    let page = await openSettings();
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    await expect(page.getByLabel('密钥保存方式')).toHaveValue('local');
    await page.getByLabel('Base URL').fill(`${baseURL}/remember/v1`);
    await page.getByLabel('模型', { exact: true }).fill('e2e-model');
    await page.getByLabel('API Key', { exact: true }).fill('e2e-not-a-real-key');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('服务配置已保存');
    await expect(page.getByText('已记住 Key', { exact: true })).toBeVisible();

    await context.close();
    context = await launch();
    page = await openSettings();
    await expect(page.getByText('已记住 Key', { exact: true })).toBeVisible();
    page.on('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: '测试', exact: true }).click();
    // The local mock endpoint requires the saved credential, not just any response.
    await expect(page.getByRole('status')).toContainText('连接成功：测试流式回答');
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: '获取模型', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('模型列表已更新');
    await expect(page.locator('#known-models option')).toHaveAttribute('value', 'e2e-model');
    await expect(page.getByText('保存在本机扩展存储', { exact: false })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('remember-key-desktop.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('密钥保存方式').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('remember-key-mobile.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('服务配置已保存');

    const webPage = await context.newPage();
    await webPage.goto(`${baseURL}/fixture.html`);
    const worker = context.serviceWorkers()[0]!;
    const storageBlocked = await worker.evaluate(async (fixtureUrl) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((item) => item.url === fixtureUrl);
      if (tab?.id === undefined) throw new Error('Test fixture tab missing');
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async () => {
          try {
            await chrome.storage.local.get('providers');
            return false;
          } catch {
            return true;
          }
        },
      });
      return results[0]?.result;
    }, `${baseURL}/fixture.html`);
    expect(storageBlocked).toBe(true);
    await webPage.locator('#text').selectText();
    const extension = webPage.locator('[data-ai-web-assistant="root"]');
    await extension.getByRole('button', { name: '总结', exact: true }).click();
    await expect(extension.locator('.result-text')).toContainText('测试流式回答');

    await page.getByRole('button', { name: '删除', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('服务配置已删除');
    await expect(page.getByText('已记住 Key', { exact: true })).toHaveCount(0);
    expect(
      await page.evaluate(async () => {
        const data = await chrome.storage.local.get('providers');
        return JSON.stringify(data).includes('e2e-not-a-real-key');
      }),
    ).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await rm(profilePath, { recursive: true, force: true });
  }
});
