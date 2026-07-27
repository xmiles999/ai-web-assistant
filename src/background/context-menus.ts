import type { PromptAction } from '../types';
import { getPrompts } from '../storage/settings';

export const MENU_ROOT = 'ai-web-assistant';
export const MENU_PREFIX = 'ai-action:';

export async function rebuildContextMenus(): Promise<void> {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_ROOT,
    title: 'AI 网页助手',
    contexts: ['selection'],
  });
  const prompts = (await getPrompts()).filter((prompt) => prompt.enabled);
  for (const prompt of prompts) createPromptMenu(prompt);
}

function createPromptMenu(prompt: PromptAction): void {
  chrome.contextMenus.create({
    id: `${MENU_PREFIX}${prompt.id}`,
    parentId: MENU_ROOT,
    title: prompt.name,
    contexts: ['selection'],
  });
}
