import type { ActionId, PendingTask, SelectionContext } from '../types';
import type { StreamServerMessage } from '../types/messages';
import { sendRuntime } from '../messaging/client';

declare global {
  interface Window {
    __AI_WEB_ASSISTANT_LOADED__?: boolean;
  }
}

if (!window.__AI_WEB_ASSISTANT_LOADED__) {
  window.__AI_WEB_ASSISTANT_LOADED__ = true;
  installSelectionToolbar();
}

function installSelectionToolbar(): void {
  const host = document.createElement('div');
  host.dataset.aiWebAssistant = 'root';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = TOOLBAR_CSS;
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'AI 网页助手');
  toolbar.hidden = true;
  const panel = createResultPanel();
  shadow.append(style, toolbar, panel.root);
  document.documentElement.append(host);

  const actions: Array<[ActionId, string]> = [
    ['translate', '翻译'],
    ['summarize', '总结'],
    ['explain', '解释'],
    ['ask', 'AI'],
    ['copy', '复制'],
    ['code-analysis', '更多'],
  ];
  for (const [id, label] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.action = id;
    button.setAttribute('aria-label', label);
    toolbar.append(button);
  }

  let current: { context: SelectionContext; rect: DOMRect } | undefined;
  let scheduled = 0;

  const refresh = () => {
    cancelAnimationFrame(scheduled);
    scheduled = requestAnimationFrame(() => {
      const selection = readSelection();
      if (!selection || shadow.activeElement || !panel.root.hidden) {
        if (!shadow.activeElement && panel.root.hidden) toolbar.hidden = true;
        return;
      }
      current = selection;
      position(toolbar, selection.rect);
      toolbar.hidden = false;
    });
  };

  document.addEventListener('selectionchange', refresh, { passive: true });
  document.addEventListener('mouseup', refresh, { passive: true });
  document.addEventListener('keyup', (event) => {
    if (event.key === 'Escape') {
      if (!panel.root.hidden) panel.close();
      else toolbar.hidden = true;
    } else refresh();
  });
  window.addEventListener(
    'scroll',
    () => {
      toolbar.hidden = true;
    },
    { passive: true, capture: true },
  );
  window.addEventListener(
    'resize',
    () => {
      toolbar.hidden = true;
    },
    { passive: true },
  );
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!event.composedPath().includes(host)) toolbar.hidden = true;
    },
    { capture: true },
  );

  toolbar.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!button || !current) return;
    const actionId = button.dataset.action;
    if (!actionId) return;
    if (actionId === 'copy') {
      void navigator.clipboard.writeText(current.context.selectedText).then(
        () => showStatus(toolbar, '已复制'),
        () => showStatus(toolbar, '复制失败'),
      );
      return;
    }
    button.disabled = true;
    void sendRuntime<PendingTask>({
      type: 'RUN_ACTION',
      actionId,
      selection: current.context,
      presentation: 'inline',
    })
      .then((response) => {
        if (!response.ok || !response.data) throw new Error(response.error ?? '操作失败');
        toolbar.hidden = true;
        panel.open(response.data, current!.rect);
      })
      .catch((error: unknown) => {
        showStatus(toolbar, error instanceof Error ? error.message : '操作失败');
      })
      .finally(() => {
        button.disabled = false;
      });
  });

  panel.onSettings = () => void sendRuntime({ type: 'OPEN_OPTIONS' });
}

function createResultPanel() {
  const root = document.createElement('section');
  root.className = 'result-panel';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'AI 结果');

  const header = document.createElement('header');
  const title = document.createElement('strong');
  const meta = document.createElement('span');
  meta.className = 'panel-meta';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'icon-button';
  close.textContent = '×';
  close.setAttribute('aria-label', '关闭结果');
  header.append(title, meta, close);

  const selection = document.createElement('details');
  selection.className = 'panel-selection';
  const summary = document.createElement('summary');
  summary.textContent = '查看选中文字';
  const selectionText = document.createElement('pre');
  selection.append(summary, selectionText);

  const questionArea = document.createElement('div');
  questionArea.className = 'question-area';
  questionArea.hidden = true;
  const question = document.createElement('textarea');
  question.placeholder = '输入你想了解的问题';
  question.rows = 3;
  question.setAttribute('aria-label', '询问 AI');
  const ask = document.createElement('button');
  ask.type = 'button';
  ask.className = 'primary-button';
  ask.textContent = '发送';
  questionArea.append(question, ask);

  const result = document.createElement('pre');
  result.className = 'result-text';
  result.setAttribute('aria-live', 'polite');
  const status = document.createElement('div');
  status.className = 'panel-status';
  status.setAttribute('role', 'status');

  const footer = document.createElement('footer');
  const stop = document.createElement('button');
  stop.type = 'button';
  stop.className = 'danger-button';
  stop.textContent = '停止';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'plain-button';
  copy.textContent = '复制';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'plain-button';
  retry.textContent = '重试';
  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'plain-button';
  settings.textContent = '设置';
  footer.append(stop, copy, retry, settings);
  root.append(header, selection, questionArea, result, status, footer);

  let activePort: chrome.runtime.Port | undefined;
  let activeTask: PendingTask | undefined;
  let onSettings: () => void = () => undefined;

  const stopRequest = () => {
    if (activeTask)
      activePort?.postMessage({ type: 'CANCEL_REQUEST', requestId: activeTask.requestId });
    activePort?.disconnect();
    activePort = undefined;
    stop.hidden = true;
    status.textContent = '已停止';
  };

  const startRequest = (task: PendingTask) => {
    activeTask = task;
    activePort?.disconnect();
    activePort = chrome.runtime.connect({ name: 'ai-stream-inline' });
    activePort.onMessage.addListener((message: StreamServerMessage) => {
      if (message.type === 'STREAM_START') {
        meta.textContent = `${message.providerName} · ${message.model}`;
        status.textContent = '正在生成…';
        stop.hidden = false;
      } else if (message.type === 'STREAM_CHUNK') {
        result.textContent += message.text;
        result.scrollTop = result.scrollHeight;
      } else if (message.type === 'STREAM_COMPLETE') {
        status.textContent = '生成完成';
        stop.hidden = true;
        activePort?.disconnect();
        activePort = undefined;
      } else if (message.type === 'STREAM_ERROR') {
        status.textContent = message.error;
        stop.hidden = true;
        settings.hidden = false;
        activePort?.disconnect();
        activePort = undefined;
      }
    });
    activePort.postMessage({ type: 'START_STREAM', task });
  };

  const open = (task: PendingTask, rect: DOMRect) => {
    if (activePort) stopRequest();
    activeTask = task;
    title.textContent = actionLabel(task.actionId);
    meta.textContent = '准备中…';
    selectionText.textContent = task.selection.selectedText;
    result.textContent = '';
    status.textContent = '';
    question.value = task.userInput ?? '';
    questionArea.hidden = task.actionId !== 'ask' || Boolean(task.userInput?.trim());
    stop.hidden = true;
    settings.hidden = true;
    root.hidden = false;
    positionPanel(root, rect);
    if (!questionArea.hidden) question.focus();
    else startRequest(task);
  };

  ask.addEventListener('click', () => {
    if (!activeTask || !question.value.trim()) return;
    questionArea.hidden = true;
    startRequest({
      ...activeTask,
      requestId: crypto.randomUUID(),
      userInput: question.value.trim(),
    });
  });
  question.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') ask.click();
  });
  stop.addEventListener('click', stopRequest);
  close.addEventListener('click', () => closePanel());
  copy.addEventListener(
    'click',
    () => void navigator.clipboard.writeText(result.textContent ?? ''),
  );
  retry.addEventListener('click', () => {
    if (activeTask) {
      result.textContent = '';
      status.textContent = '准备重试…';
      startRequest({ ...activeTask, requestId: crypto.randomUUID() });
    }
  });
  settings.addEventListener('click', () => onSettings());

  function closePanel() {
    stopRequest();
    root.hidden = true;
  }

  return {
    root,
    open,
    close: closePanel,
    set onSettings(value: () => void) {
      onSettings = value;
    },
  };
}

function actionLabel(actionId: string): string {
  return (
    (
      {
        ask: '询问 AI',
        translate: '翻译',
        summarize: '总结',
        explain: '解释',
        polish: '润色',
        'code-analysis': '代码分析',
      } as Record<string, string>
    )[actionId] ?? 'AI 操作'
  );
}

function readSelection(): { context: SelectionContext; rect: DOMRect } | undefined {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    if (active.type === 'password') return undefined;
    const start = active.selectionStart ?? 0;
    const end = active.selectionEnd ?? 0;
    const text = active.value.slice(start, end).trim();
    if (!text) return undefined;
    return { context: context(text), rect: active.getBoundingClientRect() };
  }
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return undefined;
  const text = selection.toString().trim();
  if (!text) return undefined;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return undefined;
  return { context: context(text), rect };
}

function context(selectedText: string): SelectionContext {
  return {
    selectedText,
    pageTitle: document.title,
    pageUrl: location.href,
    frameUrl: location.href,
    timestamp: new Date().toISOString(),
  };
}

function position(toolbar: HTMLDivElement, rect: DOMRect): void {
  const width = 302;
  const gap = 8;
  const left = Math.min(
    Math.max(gap, rect.left + rect.width / 2 - width / 2),
    innerWidth - width - gap,
  );
  const preferredTop = rect.top - 42 - gap;
  const top = preferredTop > gap ? preferredTop : Math.min(innerHeight - 50, rect.bottom + gap);
  toolbar.style.left = `${left}px`;
  toolbar.style.top = `${top}px`;
}

function positionPanel(panel: HTMLElement, rect: DOMRect): void {
  const width = Math.min(440, innerWidth - 16);
  const left = Math.min(
    Math.max(8, rect.left + rect.width / 2 - width / 2),
    innerWidth - width - 8,
  );
  const top =
    rect.bottom + 12 + 360 < innerHeight
      ? rect.bottom + 12
      : Math.max(8, rect.top - 12 - Math.min(520, innerHeight - 16));
  panel.style.width = `${width}px`;
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

function showStatus(toolbar: HTMLDivElement, message: string): void {
  toolbar.dataset.status = message;
  toolbar.classList.add('message');
  setTimeout(() => {
    toolbar.classList.remove('message');
    delete toolbar.dataset.status;
    toolbar.hidden = true;
  }, 1400);
}

const TOOLBAR_CSS = `
  :host { all: initial; }
  .toolbar, .result-panel { position: fixed; z-index: 2147483647; box-sizing: border-box; font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .toolbar { display: flex; width: 302px; min-height: 36px; align-items: center; gap: 2px; padding: 4px; color: #f7f4ed; background: #173f35; border: 1px solid rgba(255,255,255,.18); border-radius: 7px; box-shadow: 0 8px 24px rgba(0,0,0,.22); }
  .toolbar[hidden], .result-panel[hidden] { display: none; }
  .toolbar.message::before { content: attr(data-status); padding: 5px 8px; }
  .toolbar.message button { display: none; }
  button { all: unset; box-sizing: border-box; min-height: 28px; padding: 5px 8px; border-radius: 4px; color: inherit; cursor: pointer; white-space: nowrap; }
  button:hover { background: rgba(255,255,255,.12); }
  button:focus-visible, textarea:focus-visible { outline: 2px solid #e1b568; outline-offset: 1px; }
  button:disabled { opacity: .55; cursor: wait; }
  .result-panel { display: flex; max-height: min(70vh, 560px); overflow: auto; flex-direction: column; color: #18342e; background: #fbf8f1; border: 1px solid #c9c5bb; border-radius: 8px; box-shadow: 0 14px 36px rgba(0,0,0,.25); }
  .result-panel header { display: flex; min-height: 48px; align-items: center; gap: 8px; border-bottom: 1px solid #d8d2c7; padding: 0 12px; }
  .result-panel header strong { font-size: 15px; }
  .panel-meta { flex: 1; overflow: hidden; color: #66746e; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .icon-button { padding: 3px 8px; font-size: 20px; line-height: 1; }
  .panel-selection { margin: 10px 12px 0; border-bottom: 1px solid #e2ddd2; color: #66746e; font-size: 11px; }
  .panel-selection pre { max-height: 90px; overflow: auto; margin: 8px 0 10px; white-space: pre-wrap; color: #41534c; font: 11px/1.5 ui-monospace, monospace; }
  .question-area { display: flex; flex-direction: column; gap: 8px; padding: 12px; }
  textarea { width: 100%; box-sizing: border-box; resize: vertical; border: 1px solid #bfc5c0; border-radius: 5px; padding: 8px; color: #18342e; background: #fffdf8; font: inherit; }
  .primary-button { align-self: flex-end; color: #fff; background: #173f35; }
  .result-text { min-height: 80px; max-height: 340px; overflow: auto; margin: 0; padding: 14px 12px; white-space: pre-wrap; overflow-wrap: anywhere; color: #233e35; font: 13px/1.65 system-ui, sans-serif; }
  .panel-status { min-height: 20px; padding: 0 12px 8px; color: #66746e; font-size: 11px; }
  .result-panel footer { display: flex; justify-content: flex-end; gap: 5px; border-top: 1px solid #d8d2c7; padding: 8px 10px; }
  .plain-button, .danger-button { color: #18342e; }
  .danger-button { color: #9a3029; }
  @media (prefers-color-scheme: dark) {
    .toolbar { color: #f7f4ed; background: #173f35; }
    .result-panel { color: #e7eee9; background: #14231f; border-color: #344640; }
    .result-panel header, .result-panel footer, .panel-selection { border-color: #344640; }
    .panel-meta, .panel-status { color: #a9b8b1; }
    .panel-selection pre, .result-text { color: #d3ddd7; }
    textarea { border-color: #50615b; color: #e7eee9; background: #1b3029; }
  }
  @media (prefers-reduced-motion: no-preference) { .toolbar, .result-panel { animation: appear 100ms ease-out; } @keyframes appear { from { opacity: 0; transform: translateY(3px); } } }
`;
