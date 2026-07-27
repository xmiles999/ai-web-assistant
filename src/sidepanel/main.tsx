import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Markdown } from '../components/Markdown';
import {
  clearConversations,
  deleteConversation,
  exportHistory,
  listConversations,
} from '../storage/history';
import { getPrompts, getSettings } from '../storage/settings';
import { applyTheme } from '../utils/theme';
import type { Conversation, PendingTask } from '../types';
import type { RuntimeResponse, StreamServerMessage } from '../types/messages';
import '../styles/app.css';
import './sidepanel.css';

type Status = 'empty' | 'awaiting-question' | 'streaming' | 'completed' | 'cancelled' | 'error';

function App() {
  const [task, setTask] = useState<PendingTask>();
  const [status, setStatus] = useState<Status>('empty');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [meta, setMeta] = useState('');
  const [actionName, setActionName] = useState('AI 操作');
  const [question, setQuestion] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [showSelection, setShowSelection] = useState(false);
  const [tab, setTab] = useState<'current' | 'history'>('current');
  const [history, setHistory] = useState<Conversation[]>([]);
  const [query, setQuery] = useState('');
  const portRef = useRef<chrome.runtime.Port | null>(null);

  const start = useCallback((nextTask: PendingTask) => {
    setTask(nextTask);
    setOutput('');
    setError('');
    setMeta('');
    setTab('current');
    void getPrompts().then((prompts) => {
      setActionName(prompts.find((item) => item.id === nextTask.actionId)?.name ?? 'AI 操作');
    });
    if (nextTask.actionId === 'ask' && !nextTask.userInput?.trim()) {
      setStatus('awaiting-question');
      return;
    }
    setStatus('streaming');
    portRef.current?.postMessage({ type: 'START_STREAM', task: nextTask });
  }, []);

  useEffect(() => {
    void getSettings().then((settings) => applyTheme(settings.theme));
    const port = chrome.runtime.connect({ name: 'ai-stream' });
    portRef.current = port;
    const onMessage = (message: StreamServerMessage) => {
      if (message.type === 'STREAM_START') {
        setMeta(`${message.providerName} · ${message.model}`);
        setStatus('streaming');
      } else if (message.type === 'STREAM_CHUNK') {
        setOutput((value) => value + message.text);
      } else if (message.type === 'STREAM_COMPLETE') {
        setStatus('completed');
        void chrome.runtime.sendMessage({
          type: 'CLEAR_PENDING_TASK',
          requestId: message.requestId,
        });
      } else if (message.type === 'STREAM_ERROR') {
        setError(message.error);
        setStatus(message.code === 'cancelled' ? 'cancelled' : 'error');
      }
    };
    port.onMessage.addListener(onMessage);
    void chrome.runtime
      .sendMessage({ type: 'GET_PENDING_TASK' })
      .then((response: RuntimeResponse<PendingTask | undefined>) => {
        if (response.ok && response.data) start(response.data);
      });
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      const pending = changes.pendingTask?.newValue as PendingTask | undefined;
      if (area === 'session' && pending) start(pending);
    };
    chrome.storage.onChanged.addListener(onStorage);
    return () => {
      chrome.storage.onChanged.removeListener(onStorage);
      port.disconnect();
    };
  }, [start]);

  const submitQuestion = () => {
    if (!task || !question.trim()) return;
    start({ ...task, requestId: crypto.randomUUID(), userInput: question.trim() });
  };

  const loadHistory = async () => {
    setHistory(await listConversations());
    setTab('history');
  };

  const visibleHistory = history.filter((item) =>
    `${item.selectedText} ${item.responseText} ${item.pageTitle ?? ''}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <div className="panel-shell">
      <header className="panel-header">
        <div className="brand">
          <span className="brand-mark">AI</span>
          <span>网页助手</span>
        </div>
        <nav aria-label="侧栏视图">
          <button
            aria-current={tab === 'current' ? 'page' : undefined}
            onClick={() => setTab('current')}
          >
            当前
          </button>
          <button
            aria-current={tab === 'history' ? 'page' : undefined}
            onClick={() => void loadHistory()}
          >
            历史
          </button>
        </nav>
      </header>

      {tab === 'current' ? (
        <main className="panel-main">
          {!task ? (
            <div className="panel-empty">
              <h1>选择文字后开始</h1>
              <p>在网页中选择文字，使用右键菜单；或先在扩展弹窗中为当前网站启用悬浮工具栏。</p>
              <button className="button" onClick={() => void chrome.runtime.openOptionsPage()}>
                打开设置
              </button>
            </div>
          ) : (
            <>
              <section className="task-heading">
                <div>
                  <h1>{actionName}</h1>
                  <p className="muted small">{meta || new URL(task.selection.pageUrl).hostname}</p>
                </div>
                <button className="button" onClick={() => setShowSelection((value) => !value)}>
                  {showSelection ? '收起原文' : '查看原文'}
                </button>
              </section>
              {showSelection && (
                <pre className="selection-preview">{task.selection.selectedText}</pre>
              )}

              {status === 'awaiting-question' ? (
                <section className="question-area">
                  <label htmlFor="question">你想了解什么？</label>
                  <textarea
                    id="question"
                    className="textarea"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    autoFocus
                  />
                  <button
                    className="button primary"
                    disabled={!question.trim()}
                    onClick={submitQuestion}
                  >
                    发送
                  </button>
                </section>
              ) : (
                <section className="result" aria-live="polite" aria-busy={status === 'streaming'}>
                  {output ? (
                    <Markdown text={output} />
                  ) : status === 'streaming' ? (
                    <p className="muted">正在生成…</p>
                  ) : null}
                  {error && (
                    <div className="notice error" role="alert">
                      {error}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </main>
      ) : (
        <main className="panel-main">
          <div className="history-tools">
            <input
              className="input"
              type="search"
              placeholder="搜索历史"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              className="button"
              disabled={!history.length}
              onClick={() => downloadHistory(history)}
            >
              导出
            </button>
            <button
              className="button danger"
              disabled={!history.length}
              onClick={() => void clearAllHistory(setHistory)}
            >
              清空
            </button>
          </div>
          <div className="history-list">
            {visibleHistory.length === 0 ? (
              <p className="muted">没有本地历史记录。历史功能默认关闭，可在设置中启用。</p>
            ) : (
              visibleHistory.map((item) => (
                <article key={item.id} className="history-item">
                  <div className="split">
                    <strong>{item.actionId}</strong>
                    <time>{new Date(item.createdAt).toLocaleString()}</time>
                  </div>
                  <p>{item.selectedText.slice(0, 160)}</p>
                  <div className="history-answer">
                    <Markdown text={item.responseText.slice(0, 600)} />
                  </div>
                  <button
                    className="button danger"
                    onClick={() =>
                      void deleteConversation(item.id).then(() =>
                        setHistory((items) => items.filter((entry) => entry.id !== item.id)),
                      )
                    }
                  >
                    删除
                  </button>
                </article>
              ))
            )}
          </div>
        </main>
      )}

      {task && tab === 'current' && status !== 'awaiting-question' && (
        <footer className="panel-footer">
          {status === 'streaming' ? (
            <button
              className="button danger"
              onClick={() => {
                portRef.current?.postMessage({ type: 'CANCEL_REQUEST', requestId: task.requestId });
                setStatus('cancelled');
              }}
            >
              停止生成
            </button>
          ) : (
            <>
              <input
                className="input follow-up"
                aria-label="继续询问选中内容"
                placeholder="继续询问选中内容"
                value={followUp}
                onChange={(event) => setFollowUp(event.target.value)}
              />
              <button
                className="button primary"
                disabled={!followUp.trim()}
                onClick={() => {
                  const userInput = followUp.trim();
                  setFollowUp('');
                  start({
                    ...task,
                    requestId: crypto.randomUUID(),
                    actionId: 'ask',
                    userInput,
                    createdAt: new Date().toISOString(),
                  });
                }}
              >
                提问
              </button>
              <button
                className="button"
                disabled={!output}
                onClick={() => void navigator.clipboard.writeText(output)}
              >
                复制
              </button>
            </>
          )}
          <button
            className="button"
            onClick={() => start({ ...task, requestId: crypto.randomUUID() })}
          >
            重试
          </button>
        </footer>
      )}
    </div>
  );
}

function downloadHistory(history: Conversation[]) {
  const blob = new Blob([exportHistory(history)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ai-web-assistant-history-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function clearAllHistory(setHistory: (items: Conversation[]) => void) {
  if (!confirm('确定删除全部本地历史记录？此操作无法撤销。')) return;
  await clearConversations();
  setHistory([]);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
