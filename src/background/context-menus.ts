import { getPrompts } from '../storage/settings';

export const MENU_ROOT = 'ai-web-assistant';
export const MENU_PREFIX = 'ai-action:';

let rebuildQueue: Promise<void> = Promise.resolve();

export function rebuildContextMenus(): Promise<void> {
  const operation = rebuildQueue.catch(() => undefined).then(runRebuild);
  rebuildQueue = operation;
  return operation;
}

async function runRebuild(): Promise<void> {
  await removeAllMenus();
  await createMenu({
    id: MENU_ROOT,
    title: 'AI 网页助手',
    contexts: ['selection'],
  });
  const prompts = (await getPrompts()).filter((prompt) => prompt.enabled);
  for (const prompt of prompts) {
    await createMenu({
      id: `${MENU_PREFIX}${prompt.id}`,
      parentId: MENU_ROOT,
      title: prompt.name,
      contexts: ['selection'],
    });
  }
}

function removeAllMenus(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.contextMenus.removeAll(() => settleLastError(resolve, reject));
  });
}

function createMenu(properties: chrome.contextMenus.CreateProperties): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.contextMenus.create(properties, () => settleLastError(resolve, reject));
  });
}

function settleLastError(resolve: () => void, reject: (error: Error) => void): void {
  const lastError = chrome.runtime.lastError;
  if (lastError) reject(new Error(lastError.message || '右键菜单操作失败'));
  else resolve();
}
