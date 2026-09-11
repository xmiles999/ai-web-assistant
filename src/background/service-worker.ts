import { rebuildContextMenus, MENU_PREFIX } from './context-menus';
import { injectContentScript, injectIntoOpenTabs } from './content-injection';
import { renderPrompt } from '../prompts/template';
import { ProviderError, streamChat } from '../providers/openai';
import { saveConversation, removeExpiredConversations } from '../storage/history';
import {
  getPrompts,
  getProviders,
  getProviderSecret,
  getSettings,
  initializeStorage,
  KEYS,
} from '../storage/settings';
import type { PendingTask, SelectionContext } from '../types';
import type {
  RuntimeRequest,
  RuntimeResponse,
  StreamClientMessage,
  StreamServerMessage,
} from '../types/messages';

const controllers = new Map<string, AbortController>();
let preparation: Promise<void> | undefined;

function prepare(): Promise<void> {
  preparation ??= performPrepare().finally(() => {
    preparation = undefined;
  });
  return preparation;
}

async function performPrepare(): Promise<void> {
  await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  await initializeStorage();
  await rebuildContextMenus();
  await injectIntoOpenTabs();
  const settings = await getSettings();
  if (settings.historyEnabled) await removeExpiredConversations(settings.retentionDays);
}

function schedulePrepare(): void {
  void prepare().catch((error: unknown) => {
    console.error('AI 网页助手初始化失败', error);
  });
}

function scheduleOpenTabInjection(): void {
  void injectIntoOpenTabs().catch((error: unknown) => {
    console.error('AI 网页助手补注入失败', error);
  });
}

chrome.runtime.onInstalled.addListener(schedulePrepare);
chrome.runtime.onStartup.addListener(schedulePrepare);
chrome.permissions.onAdded.addListener(scheduleOpenTabInjection);
chrome.tabs.onActivated.addListener(({ tabId }) => void injectContentScript(tabId));
schedulePrepare();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const tabId = tab?.id;
  if (!String(info.menuItemId).startsWith(MENU_PREFIX) || !info.selectionText || !tabId) return;
  const actionId = String(info.menuItemId).slice(MENU_PREFIX.length);
  const selection: SelectionContext = {
    selectedText: info.selectionText,
    pageTitle: tab.title ?? '',
    pageUrl: info.pageUrl ?? tab.url ?? '',
    timestamp: new Date().toISOString(),
  };
  void createTask(actionId, selection).then((task) => queueTask(task, tabId));
});

chrome.commands.onCommand.addListener((command, tab) => {
  const tabId = tab?.id;
  if (command === 'open-side-panel' && tabId !== undefined) void chrome.sidePanel.open({ tabId });
});

chrome.runtime.onMessage.addListener(
  (message: RuntimeRequest, sender, sendResponse: (response: RuntimeResponse) => void) => {
    void handleRuntimeMessage(message, sender)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error: unknown) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : '操作失败' }),
      );
    return true;
  },
);

async function handleRuntimeMessage(message: RuntimeRequest, sender: chrome.runtime.MessageSender) {
  switch (message.type) {
    case 'RUN_ACTION': {
      const task = await createTask(message.actionId, message.selection, message.userInput);
      if (message.presentation === 'inline') return task;
      const tabId = sender.tab?.id;
      if (!tabId) throw new Error('无法确定当前标签页');
      await queueTask(task, tabId);
      return task;
    }
    case 'GET_PENDING_TASK': {
      const result = await chrome.storage.session.get(KEYS.pendingTask);
      return result[KEYS.pendingTask] as PendingTask | undefined;
    }
    case 'CLEAR_PENDING_TASK': {
      const result = await chrome.storage.session.get(KEYS.pendingTask);
      const current = result[KEYS.pendingTask] as PendingTask | undefined;
      if (current?.requestId === message.requestId)
        await chrome.storage.session.remove(KEYS.pendingTask);
      return undefined;
    }
    case 'OPEN_SIDE_PANEL':
      await chrome.sidePanel.open({ tabId: message.tabId });
      return undefined;
    case 'OPEN_OPTIONS':
      await chrome.runtime.openOptionsPage();
      return undefined;
    case 'REFRESH_CONTEXT_MENUS':
      await rebuildContextMenus();
      return undefined;
    case 'TEST_PROVIDER': {
      const profile = (await getProviders()).find((item) => item.id === message.providerId);
      if (!profile) throw new Error('服务配置不存在');
      const apiKey = await getProviderSecret(profile);
      let output = '';
      const controller = new AbortController();
      await streamChat(
        { ...profile, maxOutputTokens: Math.min(profile.maxOutputTokens, 16) },
        apiKey,
        [
          { role: 'system', content: '这是连接测试。只输出 OK。' },
          { role: 'user', content: '请回复 OK' },
        ],
        (text) => {
          output += text;
        },
        controller.signal,
      );
      return output;
    }
  }
}

async function createTask(
  actionId: string,
  selection: SelectionContext,
  userInput?: string,
): Promise<PendingTask> {
  const settings = await getSettings();
  const length = [...selection.selectedText].length;
  if (length === 0) throw new Error('没有可处理的选中文字');
  if (length > settings.maxSelectionCharacters)
    throw new Error(`选中文字超过 ${settings.maxSelectionCharacters} 字符，请缩短后重试`);
  return {
    requestId: crypto.randomUUID(),
    actionId,
    selection,
    userInput,
    createdAt: new Date().toISOString(),
  };
}

async function queueTask(task: PendingTask, tabId: number): Promise<void> {
  await chrome.storage.session.set({ [KEYS.pendingTask]: task });
  await chrome.sidePanel.open({ tabId });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ai-stream' && port.name !== 'ai-stream-inline') return;
  const requestIds = new Set<string>();
  port.onMessage.addListener((message: StreamClientMessage) => {
    if (message.type === 'CANCEL_REQUEST') {
      controllers.get(message.requestId)?.abort();
      return;
    }
    if (message.type === 'START_STREAM') {
      requestIds.add(message.task.requestId);
      void runStream(message.task, port).finally(() => requestIds.delete(message.task.requestId));
    }
  });
  port.onDisconnect.addListener(() => {
    for (const requestId of requestIds) controllers.get(requestId)?.abort();
  });
});

async function runStream(task: PendingTask, port: chrome.runtime.Port): Promise<void> {
  const controller = new AbortController();
  controllers.set(task.requestId, controller);
  let responseText = '';
  try {
    const [settings, providers, prompts] = await Promise.all([
      getSettings(),
      getProviders(),
      getPrompts(),
    ]);
    const action = prompts.find((item) => item.id === task.actionId && item.enabled);
    if (!action) throw new ProviderError('所选操作不存在或已停用。', 'invalid-action');
    const profile = providers.find(
      (item) => item.id === (action.providerId || settings.activeProviderId) && item.enabled,
    );
    if (!profile) throw new ProviderError('没有可用的 AI 服务配置。', 'invalid-config');
    const apiKey = await getProviderSecret(profile);
    const prompt = renderPrompt(action, task.selection, settings, task.userInput);
    post(port, {
      type: 'STREAM_START',
      requestId: task.requestId,
      providerName: profile.name,
      model: profile.model,
    });
    await streamChat(
      profile,
      apiKey,
      [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      (text) => {
        responseText += text;
        post(port, { type: 'STREAM_CHUNK', requestId: task.requestId, text });
      },
      controller.signal,
    );
    post(port, { type: 'STREAM_COMPLETE', requestId: task.requestId });
    if (settings.historyEnabled) {
      const now = new Date().toISOString();
      await saveConversation({
        id: task.requestId,
        providerId: profile.id,
        model: profile.model,
        actionId: task.actionId,
        pageTitle: settings.sendPageTitle ? task.selection.pageTitle : undefined,
        pageUrl: settings.sendPageUrl ? task.selection.pageUrl : undefined,
        selectedText: task.selection.selectedText,
        userInput: task.userInput,
        responseText,
        status: 'completed',
        createdAt: task.createdAt,
        updatedAt: now,
      });
    }
  } catch (error) {
    const known = error instanceof ProviderError ? error : undefined;
    post(port, {
      type: 'STREAM_ERROR',
      requestId: task.requestId,
      error: error instanceof Error ? error.message : '生成失败',
      code: known?.code,
    });
  } finally {
    controllers.delete(task.requestId);
  }
}

function post(port: chrome.runtime.Port, message: StreamServerMessage): void {
  try {
    port.postMessage(message);
  } catch {
    // Side Panel 已关闭；请求会由 onDisconnect 中止。
  }
}
