import type { ActionId, SelectionContext } from '../types';
import type { RuntimeResponse } from '../types/messages';

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
  host.dataset.aiWebAssistant = 'toolbar';
  // 工具栏不包含秘密；开放 Shadow Root 便于可访问性工具和 E2E 检查。
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = TOOLBAR_CSS;
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'AI 网页助手');
  toolbar.hidden = true;
  shadow.append(style, toolbar);
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
      if (!selection || shadow.activeElement) {
        if (!shadow.activeElement) toolbar.hidden = true;
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
    if (event.key === 'Escape') toolbar.hidden = true;
    else refresh();
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
    void chrome.runtime
      .sendMessage({ type: 'RUN_ACTION', actionId, selection: current.context })
      .then((response: RuntimeResponse) => {
        if (!response.ok) throw new Error(response.error);
        toolbar.hidden = true;
      })
      .catch((error: unknown) =>
        showStatus(toolbar, error instanceof Error ? error.message : '操作失败'),
      )
      .finally(() => {
        button.disabled = false;
      });
  });
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
  .toolbar {
    position: fixed;
    z-index: 2147483647;
    display: flex;
    width: 302px;
    min-height: 36px;
    box-sizing: border-box;
    align-items: center;
    gap: 2px;
    padding: 4px;
    color: #f7f4ed;
    background: #173f35;
    border: 1px solid rgba(255,255,255,.18);
    border-radius: 7px;
    box-shadow: 0 8px 24px rgba(0,0,0,.22);
    font: 13px/1.3 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .toolbar[hidden] { display: none; }
  .toolbar.message::before { content: attr(data-status); padding: 5px 8px; }
  .toolbar.message button { display: none; }
  button {
    all: unset;
    box-sizing: border-box;
    min-height: 28px;
    padding: 5px 8px;
    border-radius: 4px;
    color: inherit;
    cursor: pointer;
    white-space: nowrap;
  }
  button:hover { background: rgba(255,255,255,.12); }
  button:focus-visible { outline: 2px solid #e1b568; outline-offset: -1px; }
  button:disabled { opacity: .55; cursor: wait; }
  @media (prefers-color-scheme: light) {
    .toolbar { color: #173f35; background: #fbf8f1; border-color: #c9c5bb; }
    button:hover { background: #ece6da; }
  }
  @media (prefers-reduced-motion: no-preference) {
    .toolbar { animation: appear 100ms ease-out; }
    @keyframes appear { from { opacity: 0; transform: translateY(3px); } }
  }
`;
