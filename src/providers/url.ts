import type { ProviderProfile, ValidationResult } from '../types';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function validateProvider(profile: ProviderProfile): ValidationResult {
  const errors: string[] = [];
  let parsed: URL | undefined;
  try {
    parsed = new URL(normalizeBaseUrl(profile.baseUrl));
  } catch {
    errors.push('Base URL 不是有效网址');
  }
  if (parsed) {
    const localHttp = parsed.protocol === 'http:' && LOCAL_HOSTS.has(parsed.hostname);
    if (parsed.protocol !== 'https:' && !localHttp) errors.push('远程接口必须使用 HTTPS');
    if (parsed.username || parsed.password) errors.push('Base URL 不能包含用户名或密码');
    if (parsed.search || parsed.hash) errors.push('Base URL 不能包含查询参数或片段');
  }
  if (!profile.name.trim()) errors.push('配置名称不能为空');
  if (!profile.model.trim()) errors.push('模型不能为空');
  if (profile.temperature < 0 || profile.temperature > 2)
    errors.push('Temperature 必须在 0 到 2 之间');
  if (profile.maxOutputTokens < 1 || profile.maxOutputTokens > 100_000)
    errors.push('最大输出 Token 必须在 1 到 100000 之间');
  if (profile.timeoutMs < 5_000 || profile.timeoutMs > 300_000)
    errors.push('超时时间必须在 5 到 300 秒之间');
  if (profile.protocol === 'azure-openai') {
    if (!profile.azureDeployment?.trim()) errors.push('Azure Deployment 不能为空');
    if (!profile.apiVersion?.trim()) errors.push('Azure api-version 不能为空');
  }
  return { valid: errors.length === 0, errors };
}

export function buildChatEndpoint(profile: ProviderProfile): string {
  const base = normalizeBaseUrl(profile.baseUrl);
  if (profile.protocol === 'azure-openai') {
    const deployment = encodeURIComponent(profile.azureDeployment ?? '');
    const version = encodeURIComponent(profile.apiVersion ?? '');
    return `${base}/openai/deployments/${deployment}/chat/completions?api-version=${version}`;
  }
  return `${base}/chat/completions`;
}

export function buildModelsEndpoint(profile: ProviderProfile): string | undefined {
  if (profile.protocol === 'azure-openai') return undefined;
  return `${normalizeBaseUrl(profile.baseUrl)}/models`;
}
