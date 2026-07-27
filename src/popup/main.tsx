import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getProviders, getSettings } from '../storage/settings';
import { applyTheme } from '../utils/theme';
import '../styles/app.css';
import './popup.css';

interface TabInfo {
  id: number;
  url: string;
}

function App() {
  const [tab, setTab] = useState<TabInfo>();
  const [provider, setProvider] = useState('未配置');
  const [status, setStatus] = useState('');

  useEffect(() => {
    void Promise.all([
      chrome.tabs.query({ active: true, currentWindow: true }),
      getSettings(),
      getProviders(),
    ])
      .then(([tabs, settings, providers]) => {
        applyTheme(settings.theme);
        const active = tabs[0];
        if (active?.id && active.url) setTab({ id: active.id, url: active.url });
        const current = providers.find((item) => item.id === settings.activeProviderId);
        if (current)
          setProvider(`${current.name}${current.model ? ` · ${current.model}` : ' · 未填写模型'}`);
      })
      .catch(() => setStatus('无法读取当前标签页'));
  }, []);

  const supported = Boolean(tab?.url.startsWith('http://') || tab?.url.startsWith('https://'));

  return (
    <main className="popup">
      <header>
        <div className="brand">
          <span className="brand-mark">AI</span>
          <span>网页助手</span>
        </div>
      </header>
      <section>
        <span className="label">当前服务</span>
        <p>{provider}</p>
      </section>
      <section>
        <div className="split">
          <span className="label">网页工具栏</span>
          <span className="badge">全站启用</span>
        </div>
        <p className="site">{tab ? safeHostname(tab.url) : '无法读取'}</p>
        <p className="muted small">
          {supported
            ? '选中文字后会自动显示工具栏，AI 结果默认在选区附近弹出。'
            : 'Chrome 内部页和商店页不支持注入工具栏。'}
        </p>
        <div className="status" role="status">
          {status}
        </div>
      </section>
      <footer>
        <button
          className="button"
          disabled={!tab}
          onClick={() =>
            tab && void chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL', tabId: tab.id })
          }
        >
          打开侧栏
        </button>
        <button className="button" onClick={() => void chrome.runtime.openOptionsPage()}>
          设置
        </button>
      </footer>
    </main>
  );
}

function safeHostname(value: string): string {
  try {
    return new URL(value).hostname || value;
  } catch {
    return value;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
