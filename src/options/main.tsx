import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { clearConversations, exportHistory, listConversations } from '../storage/history';
import { BUILT_IN_PROMPTS, DEFAULT_PROVIDER, DEFAULT_SETTINGS } from '../storage/defaults';
import {
  clearSessionSecret,
  getPrompts,
  getProviders,
  getSessionSecret,
  getSettings,
  savePrompts,
  saveProviders,
  saveSettings,
  setSessionSecret,
} from '../storage/settings';
import { decryptSecret, encryptSecret } from '../security/crypto';
import { findUnknownVariables } from '../prompts/template';
import { listModels } from '../providers/openai';
import { originPattern, validateProvider } from '../providers/url';
import type { ExtensionSettings, PromptAction, ProviderProfile } from '../types';
import { sendRuntime } from '../messaging/client';
import { applyTheme } from '../utils/theme';
import '../styles/app.css';

type SectionId = 'providers' | 'prompts' | 'privacy' | 'sites' | 'about';

function App() {
  const [section, setSection] = useState<SectionId>('providers');
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [providers, setProviders] = useState<ProviderProfile[]>([]);
  const [prompts, setPrompts] = useState<PromptAction[]>([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    void Promise.all([getSettings(), getProviders(), getPrompts()]).then(
      ([nextSettings, nextProviders, nextPrompts]) => {
        setSettings(nextSettings);
        setProviders(nextProviders);
        setPrompts(nextPrompts);
      },
    );
  }, []);

  useEffect(() => applyTheme(settings.theme), [settings.theme]);

  const persistSettings = async (next: ExtensionSettings) => {
    setSettings(next);
    await saveSettings(next);
    setStatus('设置已保存');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">AI</span>
          <span>AI 网页助手设置</span>
        </div>
        <span className="muted small">数据默认仅保存在本机</span>
      </header>
      <div className="workspace">
        <nav className="sidebar" aria-label="设置分类">
          {(
            [
              ['providers', '服务配置'],
              ['prompts', 'AI 操作'],
              ['privacy', '隐私与历史'],
              ['sites', '网站权限'],
              ['about', '关于'],
            ] as Array<[SectionId, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              aria-current={section === id ? 'page' : undefined}
              onClick={() => {
                setSection(id);
                setStatus('');
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <main className="main">
          <div className="main-inner">
            {section === 'providers' && (
              <ProvidersSection
                settings={settings}
                providers={providers}
                onSettings={persistSettings}
                onProviders={async (next) => {
                  setProviders(next);
                  await saveProviders(next);
                }}
                setStatus={setStatus}
              />
            )}
            {section === 'prompts' && (
              <PromptsSection prompts={prompts} setPrompts={setPrompts} setStatus={setStatus} />
            )}
            {section === 'privacy' && (
              <PrivacySection
                settings={settings}
                onSettings={persistSettings}
                setStatus={setStatus}
              />
            )}
            {section === 'sites' && (
              <SitesSection
                settings={settings}
                onSettings={persistSettings}
                setStatus={setStatus}
              />
            )}
            {section === 'about' && <AboutSection />}
            <div className="status" role="status">
              {status}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function ProvidersSection({
  settings,
  providers,
  onSettings,
  onProviders,
  setStatus,
}: {
  settings: ExtensionSettings;
  providers: ProviderProfile[];
  onSettings: (settings: ExtensionSettings) => Promise<void>;
  onProviders: (providers: ProviderProfile[]) => Promise<void>;
  setStatus: (status: string) => void;
}) {
  const [editing, setEditing] = useState<ProviderProfile>();
  const [apiKey, setApiKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [unlockValues, setUnlockValues] = useState<Record<string, string>>({});
  const [models, setModels] = useState<string[]>([]);

  const newProvider = () => {
    const now = new Date().toISOString();
    setEditing({
      ...DEFAULT_PROVIDER,
      id: crypto.randomUUID(),
      name: '新服务配置',
      baseUrl: '',
      model: '',
      createdAt: now,
      updatedAt: now,
    });
    setApiKey('');
    setPassphrase('');
    setModels([]);
  };

  const editProvider = (profile: ProviderProfile) => {
    setEditing({ ...profile });
    setApiKey('');
    setPassphrase('');
    setModels([]);
  };

  const save = async () => {
    if (!editing) return;
    const validation = validateProvider(editing);
    if (!validation.valid) {
      setStatus(validation.errors.join('；'));
      return;
    }
    if (
      editing.apiKeyRequired &&
      !apiKey &&
      !editing.encryptedSecret &&
      !(await getSessionSecret(editing.id))
    ) {
      setStatus('请填写 API Key');
      return;
    }
    try {
      const pattern = originPattern(editing.baseUrl);
      const granted = await chrome.permissions.request({ origins: [pattern] });
      if (!granted) throw new Error('必须授权访问该 API 域名才能发送请求');
      let profile = { ...editing, updatedAt: new Date().toISOString() };
      if (apiKey) {
        if (profile.secretStorage === 'encrypted') {
          profile = { ...profile, encryptedSecret: await encryptSecret(apiKey, passphrase) };
        } else {
          delete profile.encryptedSecret;
        }
        await setSessionSecret(profile.id, apiKey);
      }
      const next = providers.some((item) => item.id === profile.id)
        ? providers.map((item) => (item.id === profile.id ? profile : item))
        : [...providers, profile];
      await onProviders(next);
      if (!settings.activeProviderId || providers.length === 0)
        await onSettings({ ...settings, activeProviderId: profile.id });
      setEditing(undefined);
      setApiKey('');
      setPassphrase('');
      setStatus('服务配置已保存');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存失败');
    }
  };

  const unlock = async (profile: ProviderProfile) => {
    if (!profile.encryptedSecret) return;
    try {
      const secret = await decryptSecret(profile.encryptedSecret, unlockValues[profile.id] ?? '');
      await setSessionSecret(profile.id, secret);
      setUnlockValues((values) => ({ ...values, [profile.id]: '' }));
      setStatus(`${profile.name} 已解锁到当前浏览器会话`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '解锁失败');
    }
  };

  const loadModels = async () => {
    if (!editing) return;
    try {
      const key = apiKey || (await getSessionSecret(editing.id));
      setModels(await listModels(editing, key));
      setStatus('模型列表已更新');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '读取模型失败');
    }
  };

  const remove = async (profile: ProviderProfile) => {
    if (!confirm(`确定删除“${profile.name}”？`)) return;
    await clearSessionSecret(profile.id);
    const next = providers.filter((item) => item.id !== profile.id);
    await onProviders(
      next.length
        ? next
        : [
            {
              ...DEFAULT_PROVIDER,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
    );
    if (settings.activeProviderId === profile.id)
      await onSettings({ ...settings, activeProviderId: next[0]?.id ?? DEFAULT_PROVIDER.id });
    setStatus('服务配置已删除');
  };

  const testProvider = async (profile: ProviderProfile) => {
    if (!confirm('连接测试会向服务发送一条最小生成请求，可能产生少量费用。继续吗？')) return;
    setStatus('正在测试连接…');
    const response = await sendRuntime<string>({ type: 'TEST_PROVIDER', providerId: profile.id });
    setStatus(
      response.ok ? `连接成功：${response.data || '服务已响应'}` : response.error || '连接失败',
    );
  };

  return (
    <>
      <section className="section">
        <div className="split">
          <div>
            <h1>服务配置</h1>
            <p className="muted">
              配置 OpenAI Chat Completions 兼容接口或 Azure OpenAI。模型名称由服务商决定。
            </p>
          </div>
          <button className="button primary" onClick={newProvider}>
            新增配置
          </button>
        </div>
        <div className="notice">
          自定义服务会收到你主动提交的选中文字。请只使用可信接口，远程地址必须使用 HTTPS。
        </div>
        <div className="list">
          {providers.map((profile) => (
            <div className="list-row" key={profile.id}>
              <div>
                <div className="inline">
                  <strong>{profile.name}</strong>
                  {settings.activeProviderId === profile.id && <span className="badge">当前</span>}
                </div>
                <div className="muted small">
                  {profile.model || '未填写模型'} · {profile.baseUrl}
                </div>
              </div>
              <div className="actions">
                {profile.secretStorage === 'encrypted' && profile.encryptedSecret && (
                  <>
                    <input
                      className="input"
                      type="password"
                      aria-label={`${profile.name} 解锁口令`}
                      placeholder="输入解锁口令"
                      value={unlockValues[profile.id] ?? ''}
                      onChange={(event) =>
                        setUnlockValues((values) => ({
                          ...values,
                          [profile.id]: event.target.value,
                        }))
                      }
                    />
                    <button className="button" onClick={() => void unlock(profile)}>
                      解锁
                    </button>
                  </>
                )}
                <button
                  className="button"
                  disabled={settings.activeProviderId === profile.id}
                  onClick={() => void onSettings({ ...settings, activeProviderId: profile.id })}
                >
                  设为当前
                </button>
                <button className="button" onClick={() => void testProvider(profile)}>
                  测试
                </button>
                <button className="button" onClick={() => editProvider(profile)}>
                  编辑
                </button>
                <button className="button danger" onClick={() => void remove(profile)}>
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
      {editing && (
        <section className="section">
          <h2>{providers.some((item) => item.id === editing.id) ? '编辑服务' : '新增服务'}</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="provider-name">名称</label>
              <input
                id="provider-name"
                className="input"
                value={editing.name}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="protocol">协议</label>
              <select
                id="protocol"
                className="select"
                value={editing.protocol}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    protocol: event.target.value as ProviderProfile['protocol'],
                  })
                }
              >
                <option value="openai-compatible">OpenAI 兼容</option>
                <option value="azure-openai">Azure OpenAI</option>
              </select>
            </div>
            <div className="field full">
              <label htmlFor="base-url">Base URL</label>
              <input
                id="base-url"
                className="input"
                type="url"
                placeholder="https://api.openai.com/v1"
                value={editing.baseUrl}
                onChange={(event) => setEditing({ ...editing, baseUrl: event.target.value })}
              />
            </div>
            {editing.protocol === 'azure-openai' && (
              <>
                <div className="field">
                  <label htmlFor="deployment">Deployment</label>
                  <input
                    id="deployment"
                    className="input"
                    value={editing.azureDeployment ?? ''}
                    onChange={(event) =>
                      setEditing({ ...editing, azureDeployment: event.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="api-version">api-version</label>
                  <input
                    id="api-version"
                    className="input"
                    value={editing.apiVersion ?? ''}
                    onChange={(event) => setEditing({ ...editing, apiVersion: event.target.value })}
                  />
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="model">模型</label>
              <input
                id="model"
                className="input"
                list="known-models"
                value={editing.model}
                onChange={(event) => setEditing({ ...editing, model: event.target.value })}
              />
              <datalist id="known-models">
                {models.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="api-key">
                API Key {editing.encryptedSecret || apiKey ? '' : '（必填）'}
              </label>
              <input
                id="api-key"
                className="input"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="secret-mode">密钥保存方式</label>
              <select
                id="secret-mode"
                className="select"
                value={editing.secretStorage}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    secretStorage: event.target.value as ProviderProfile['secretStorage'],
                  })
                }
              >
                <option value="session">仅当前浏览器会话</option>
                <option value="encrypted">使用口令加密后持久保存</option>
              </select>
            </div>
            {editing.secretStorage === 'encrypted' && apiKey && (
              <div className="field">
                <label htmlFor="passphrase">解锁口令（至少 10 个字符）</label>
                <input
                  id="passphrase"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="temperature">Temperature</label>
              <input
                id="temperature"
                className="input"
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={editing.temperature}
                onChange={(event) =>
                  setEditing({ ...editing, temperature: Number(event.target.value) })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="tokens">最大输出 Token</label>
              <input
                id="tokens"
                className="input"
                type="number"
                min="1"
                max="100000"
                value={editing.maxOutputTokens}
                onChange={(event) =>
                  setEditing({ ...editing, maxOutputTokens: Number(event.target.value) })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="timeout">超时（秒）</label>
              <input
                id="timeout"
                className="input"
                type="number"
                min="5"
                max="300"
                value={editing.timeoutMs / 1000}
                onChange={(event) =>
                  setEditing({ ...editing, timeoutMs: Number(event.target.value) * 1000 })
                }
              />
            </div>
            <label className="inline">
              <input
                type="checkbox"
                checked={editing.apiKeyRequired}
                onChange={(event) =>
                  setEditing({ ...editing, apiKeyRequired: event.target.checked })
                }
              />
              此接口需要 API Key
            </label>
          </div>
          <div className="actions">
            <button className="button primary" onClick={() => void save()}>
              保存
            </button>
            <button className="button" onClick={() => void loadModels()}>
              获取模型
            </button>
            <button className="button" onClick={() => setEditing(undefined)}>
              取消
            </button>
          </div>
        </section>
      )}
    </>
  );
}

function PromptsSection({
  prompts,
  setPrompts,
  setStatus,
}: {
  prompts: PromptAction[];
  setPrompts: (prompts: PromptAction[]) => void;
  setStatus: (status: string) => void;
}) {
  const [editing, setEditing] = useState<PromptAction>();
  const persist = async (next: PromptAction[]) => {
    setPrompts(next);
    await savePrompts(next);
    await chrome.runtime.sendMessage({ type: 'REFRESH_CONTEXT_MENUS' });
  };
  const create = () => {
    const now = new Date().toISOString();
    setEditing({
      id: crypto.randomUUID(),
      name: '',
      description: '',
      promptTemplate: '{{selection}}',
      iconKey: 'custom',
      enabled: true,
      order: prompts.length,
      builtIn: false,
      createdAt: now,
      updatedAt: now,
    });
  };
  const save = async () => {
    if (!editing?.name.trim() || !editing.promptTemplate.trim()) {
      setStatus('名称和 Prompt 不能为空');
      return;
    }
    const unknown = [
      ...findUnknownVariables(editing.promptTemplate),
      ...findUnknownVariables(editing.systemPrompt ?? ''),
    ];
    if (unknown.length) {
      setStatus(`存在未知变量：${[...new Set(unknown)].join('、')}`);
      return;
    }
    const nextAction = { ...editing, updatedAt: new Date().toISOString() };
    await persist(
      prompts.some((item) => item.id === editing.id)
        ? prompts.map((item) => (item.id === editing.id ? nextAction : item))
        : [...prompts, nextAction],
    );
    setEditing(undefined);
    setStatus('AI 操作已保存');
  };
  const move = async (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= prompts.length) return;
    const next = [...prompts];
    [next[index], next[target]] = [next[target]!, next[index]!];
    await persist(next.map((item, order) => ({ ...item, order })));
  };
  return (
    <>
      <section className="section">
        <div className="split">
          <div>
            <h1>AI 操作</h1>
            <p className="muted">
              管理悬浮工具栏和右键菜单中的 Prompt。选中文字始终按不可信数据处理。
            </p>
          </div>
          <button className="button primary" onClick={create}>
            新增操作
          </button>
        </div>
        <div className="list">
          {prompts.map((prompt, index) => (
            <div className="list-row" key={prompt.id}>
              <div>
                <div className="inline">
                  <strong>{prompt.name}</strong>
                  {prompt.builtIn && <span className="badge">内置</span>}
                  {!prompt.enabled && <span className="badge">已停用</span>}
                </div>
                <div className="muted small">{prompt.description}</div>
              </div>
              <div className="actions">
                <button
                  className="button"
                  aria-label="上移"
                  disabled={index === 0}
                  onClick={() => void move(index, -1)}
                >
                  ↑
                </button>
                <button
                  className="button"
                  aria-label="下移"
                  disabled={index === prompts.length - 1}
                  onClick={() => void move(index, 1)}
                >
                  ↓
                </button>
                <button
                  className="button"
                  onClick={() =>
                    void persist(
                      prompts.map((item) =>
                        item.id === prompt.id ? { ...item, enabled: !item.enabled } : item,
                      ),
                    )
                  }
                >
                  {prompt.enabled ? '停用' : '启用'}
                </button>
                <button
                  className="button"
                  onClick={() =>
                    setEditing(
                      prompt.builtIn
                        ? {
                            ...prompt,
                            id: crypto.randomUUID(),
                            name: `${prompt.name}副本`,
                            builtIn: false,
                            createdAt: new Date().toISOString(),
                          }
                        : { ...prompt },
                    )
                  }
                >
                  {prompt.builtIn ? '复制' : '编辑'}
                </button>
                {!prompt.builtIn && (
                  <button
                    className="button danger"
                    onClick={() =>
                      confirm(`删除“${prompt.name}”？`) &&
                      void persist(prompts.filter((item) => item.id !== prompt.id))
                    }
                  >
                    删除
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
      {editing && (
        <section className="section">
          <h2>编辑自定义操作</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="action-name">名称</label>
              <input
                id="action-name"
                className="input"
                value={editing.name}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="action-description">说明</label>
              <input
                id="action-description"
                className="input"
                value={editing.description}
                onChange={(event) => setEditing({ ...editing, description: event.target.value })}
              />
            </div>
            <div className="field full">
              <label htmlFor="action-system">附加 System Prompt</label>
              <textarea
                id="action-system"
                className="textarea"
                value={editing.systemPrompt ?? ''}
                onChange={(event) => setEditing({ ...editing, systemPrompt: event.target.value })}
              />
            </div>
            <div className="field full">
              <label htmlFor="action-template">Prompt 模板</label>
              <textarea
                id="action-template"
                className="textarea"
                value={editing.promptTemplate}
                onChange={(event) => setEditing({ ...editing, promptTemplate: event.target.value })}
              />
              <span className="muted small">
                可用变量：&#123;&#123;selection&#125;&#125;、&#123;&#123;userInput&#125;&#125;、&#123;&#123;title&#125;&#125;、&#123;&#123;url&#125;&#125;、&#123;&#123;targetLanguage&#125;&#125;
              </span>
            </div>
          </div>
          <div className="actions">
            <button className="button primary" onClick={() => void save()}>
              保存
            </button>
            <button className="button" onClick={() => setEditing(undefined)}>
              取消
            </button>
          </div>
        </section>
      )}
    </>
  );
}

function PrivacySection({
  settings,
  onSettings,
  setStatus,
}: {
  settings: ExtensionSettings;
  onSettings: (settings: ExtensionSettings) => Promise<void>;
  setStatus: (status: string) => void;
}) {
  const update = (patch: Partial<ExtensionSettings>) => void onSettings({ ...settings, ...patch });
  const exportLocalHistory = async () => {
    const history = await listConversations();
    const blob = new Blob([exportHistory(history)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ai-web-assistant-history.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="section">
      <h1>隐私与历史</h1>
      <p className="muted">默认只把选中文字发送给当前服务。历史记录默认关闭。</p>
      <div className="list">
        <label className="list-row">
          <span>
            <strong>发送网页标题</strong>
            <span className="muted small">仅在 Prompt 使用 title 变量时有意义</span>
          </span>
          <input
            type="checkbox"
            checked={settings.sendPageTitle}
            onChange={(event) => update({ sendPageTitle: event.target.checked })}
          />
        </label>
        <label className="list-row">
          <span>
            <strong>发送网页 URL</strong>
            <span className="muted small">URL 可能包含敏感参数，谨慎开启</span>
          </span>
          <input
            type="checkbox"
            checked={settings.sendPageUrl}
            onChange={(event) => update({ sendPageUrl: event.target.checked })}
          />
        </label>
        <label className="list-row">
          <span>
            <strong>保存本地历史</strong>
            <span className="muted small">选中文字和回答将保存到 IndexedDB</span>
          </span>
          <input
            type="checkbox"
            checked={settings.historyEnabled}
            onChange={(event) => update({ historyEnabled: event.target.checked })}
          />
        </label>
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="retention">历史保留天数</label>
          <input
            id="retention"
            className="input"
            type="number"
            min="1"
            max="3650"
            value={settings.retentionDays}
            onChange={(event) => update({ retentionDays: Number(event.target.value) })}
          />
        </div>
        <div className="field">
          <label htmlFor="selection-limit">最大选择字符数</label>
          <input
            id="selection-limit"
            className="input"
            type="number"
            min="100"
            max="100000"
            value={settings.maxSelectionCharacters}
            onChange={(event) => update({ maxSelectionCharacters: Number(event.target.value) })}
          />
        </div>
        <div className="field">
          <label htmlFor="target-language">默认翻译语言</label>
          <input
            id="target-language"
            className="input"
            value={settings.targetLanguage}
            onChange={(event) => update({ targetLanguage: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="theme">主题</label>
          <select
            id="theme"
            className="select"
            value={settings.theme}
            onChange={(event) =>
              update({ theme: event.target.value as ExtensionSettings['theme'] })
            }
          >
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </div>
      </div>
      <div className="actions">
        <button className="button" onClick={() => void exportLocalHistory()}>
          导出历史
        </button>
        <button
          className="button danger"
          onClick={() => {
            if (confirm('确定彻底删除全部本地历史？'))
              void clearConversations().then(() => setStatus('历史记录已删除'));
          }}
        >
          删除全部历史
        </button>
      </div>
    </section>
  );
}

function SitesSection({
  settings,
  onSettings,
  setStatus,
}: {
  settings: ExtensionSettings;
  onSettings: (settings: ExtensionSettings) => Promise<void>;
  setStatus: (status: string) => void;
}) {
  const revoke = async (pattern: string) => {
    const response = await sendRuntime({
      type: 'SET_SITE_PERMISSION',
      tabId: 0,
      url: pattern,
      enabled: false,
    });
    if (!response.ok) {
      setStatus(response.error ?? '撤销失败');
      return;
    }
    await onSettings({
      ...settings,
      sitePatterns: settings.sitePatterns.filter((item) => item !== pattern),
    });
    setStatus('网站权限已撤销');
  };
  return (
    <section className="section">
      <h1>网站权限</h1>
      <p className="muted">只有下列网站会自动注入选区悬浮工具栏。右键菜单不依赖这些授权。</p>
      {settings.sitePatterns.length ? (
        <div className="list">
          {settings.sitePatterns.map((pattern) => (
            <div className="list-row" key={pattern}>
              <code>{pattern}</code>
              <button className="button danger" onClick={() => void revoke(pattern)}>
                撤销
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="notice">尚未授权任何网站。请从扩展弹窗为当前网站启用。</div>
      )}
    </section>
  );
}

function AboutSection() {
  return (
    <section className="section">
      <h1>关于</h1>
      <p>AI 网页助手 0.1.0</p>
      <p className="muted">Manifest V3 · 数据隐私优先 · MIT License</p>
      <div className="notice">
        本扩展不会运营中转服务器。你选择的文本只会发送到当前配置的 AI 服务。普通 Chrome
        扩展无法提供操作系统级秘密存储；持久密钥依赖用户口令加密。
      </div>
      <button
        className="button"
        onClick={() => void chrome.storage.local.set({ prompts: BUILT_IN_PROMPTS })}
      >
        恢复内置 Prompt（覆盖 Prompt 列表）
      </button>
    </section>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
