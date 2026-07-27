import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getProviders, getSettings } from '../storage/settings';
import { sendRuntime } from '../messaging/client';
import { applyTheme } from '../utils/theme';
import '../styles/app.css';
import './popup.css';

interface TabInfo {
  id: number;
  url: string;
  title: string;
}

function App() {
  const [tab, setTab] = useState<TabInfo>();
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState('未配置');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([
      chrome.tabs.query({ active: true, currentWindow: true }),
      getSettings(),
      getProviders(),
    ])
      .then(async ([tabs, settings, providers]) => {
        applyTheme(settings.theme);
        const active = tabs[0];
        if (active?.id && active.url) {
          const info = { id: active.id, url: active.url, title: active.title ?? '' };
          setTab(info);
          const response = await sendRuntime<{ enabled: boolean }>({
            type: 'GET_TAB_STATUS',
            tabId: info.id,
            url: info.url,
          });
          setEnabled(Boolean(response.data?.enabled));
        }
        const current = providers.find((item) => item.id === settings.activeProviderId);
        if (current)
          setProvider(`${current.name}${current.model ? ` · ${current.model}` : ' · 未填写模型'}`);
      })
      .catch(() => setStatus('无法读取当前标签页'));
  }, []);

  const supported = Boolean(tab?.url.startsWith('http://') || tab?.url.startsWith('https://'));

  const toggle = async () => {
    if (!tab) return;
    setBusy(true);
    setStatus('');
    try {
      const response = await sendRuntime({
        type: 'SET_SITE_PERMISSION',
        tabId: tab.id,
        url: tab.url,
        enabled: !enabled,
      });
      if (!response.ok) throw new Error(response.error);
      setEnabled(!enabled);
      setStatus(!enabled ? '已在当前网站启用' : '已撤销当前网站权限，刷新后生效');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '权限操作失败');
    } finally {
      setBusy(false);
    }
  };

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
          <span className="label">当前网站</span>
          <span className="badge">{enabled ? '已启用' : '未授权'}</span>
        </div>
        <p className="site">{tab ? safeHostname(tab.url) : '无法读取'}</p>
        {supported ? (
          <button
            className={`button ${enabled ? 'danger' : 'primary'}`}
            disabled={busy}
            onClick={() => void toggle()}
          >
            {enabled ? '在此网站停用' : '在此网站启用悬浮工具栏'}
          </button>
        ) : (
          <p className="muted small">Chrome 内部页和商店页不支持注入工具栏。</p>
        )}
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
