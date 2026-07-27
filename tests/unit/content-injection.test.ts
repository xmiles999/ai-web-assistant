import { afterEach, describe, expect, it, vi } from 'vitest';

describe('content script injection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('injects existing HTTP tabs and ignores restricted or inaccessible pages', async () => {
    const executeScript = vi.fn(({ target }: { target: { tabId: number } }) => {
      if (target.tabId === 3)
        return Promise.reject(new Error('Cannot access contents of the page'));
      return Promise.resolve([]);
    });
    vi.stubGlobal('chrome', {
      tabs: {
        query: vi.fn(() =>
          Promise.resolve([
            { id: 1, url: 'https://example.com/article' },
            { id: 2, url: 'chrome://extensions' },
            { id: 3 },
          ]),
        ),
      },
      scripting: { executeScript },
    });

    const { injectIntoOpenTabs } = await import('../../src/background/content-injection');
    await expect(injectIntoOpenTabs()).resolves.toBeUndefined();
    expect(executeScript).toHaveBeenCalledTimes(2);
    expect(executeScript).toHaveBeenNthCalledWith(1, {
      target: { tabId: 1, allFrames: true },
      files: ['content-script.js'],
    });
    expect(executeScript).toHaveBeenNthCalledWith(2, {
      target: { tabId: 3, allFrames: true },
      files: ['content-script.js'],
    });
  });
});
