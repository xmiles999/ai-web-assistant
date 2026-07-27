import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/storage/settings', () => ({
  getPrompts: vi.fn(() =>
    Promise.resolve([
      { id: 'ask', name: '询问 AI', enabled: true },
      { id: 'translate', name: '翻译', enabled: true },
    ]),
  ),
}));

describe('context menu rebuild', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('serializes concurrent rebuilds without duplicate IDs or missing parents', async () => {
    const menuIds = new Set<string>();
    const errors: string[] = [];
    const runtime: { lastError?: { message?: string } } = {};
    vi.stubGlobal('chrome', {
      runtime,
      contextMenus: {
        removeAll: (callback: () => void) => {
          setTimeout(() => {
            menuIds.clear();
            callback();
          }, 5);
        },
        create: (properties: { id: string; parentId?: string }, callback: () => void) => {
          let message = '';
          if (menuIds.has(properties.id)) message = `duplicate id ${properties.id}`;
          else if (properties.parentId && !menuIds.has(properties.parentId))
            message = `missing parent ${properties.parentId}`;
          if (message) {
            errors.push(message);
            runtime.lastError = { message };
          } else menuIds.add(properties.id);
          callback();
          delete runtime.lastError;
        },
      },
    });

    const { MENU_ROOT, rebuildContextMenus } = await import('../../src/background/context-menus');
    await Promise.all([rebuildContextMenus(), rebuildContextMenus(), rebuildContextMenus()]);

    expect(errors).toEqual([]);
    expect(menuIds).toEqual(new Set([MENU_ROOT, 'ai-action:ask', 'ai-action:translate']));
  });
});
