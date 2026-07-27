import type { ChatMessage, ProviderProfile } from '../types';
import { buildChatEndpoint, buildModelsEndpoint, validateProvider } from './url';
import { extractOpenAIDelta, SSEParser } from './sse';

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable = false,
  ) {
    super(message);
  }
}

function friendlyStatus(status: number): ProviderError {
  if (status === 401) return new ProviderError('认证失败，请检查 API Key。', 'unauthorized');
  if (status === 403) return new ProviderError('接口拒绝访问，请检查权限和账户状态。', 'forbidden');
  if (status === 404)
    return new ProviderError('接口或模型不存在，请检查 Base URL、Deployment 和模型。', 'not-found');
  if (status === 429)
    return new ProviderError('请求过于频繁或额度不足，请稍后重试。', 'rate-limit', true);
  if (status >= 500)
    return new ProviderError('AI 服务暂时不可用，请稍后重试。', 'server-error', true);
  return new ProviderError(`AI 服务返回 HTTP ${status}。`, 'http-error');
}

function headersFor(profile: ProviderProfile, apiKey: string): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    if (profile.protocol === 'azure-openai') headers['api-key'] = apiKey;
    else headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

export async function streamChat(
  profile: ProviderProfile,
  apiKey: string,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const validation = validateProvider(profile);
  if (!validation.valid) throw new ProviderError(validation.errors.join('；'), 'invalid-config');
  if (profile.apiKeyRequired && !apiKey)
    throw new ProviderError('API Key 尚未配置或解锁。', 'locked');

  let attempt = 0;
  let emitted = false;
  while (attempt < 2) {
    attempt += 1;
    try {
      await streamAttempt(
        profile,
        apiKey,
        messages,
        (text) => {
          emitted = emitted || Boolean(text);
          onDelta(text);
        },
        signal,
      );
      return;
    } catch (error) {
      if (
        attempt >= 2 ||
        emitted ||
        signal.aborted ||
        !(error instanceof ProviderError) ||
        !error.retryable
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 350 + Math.random() * 250));
    }
  }
}

async function streamAttempt(
  profile: ProviderProfile,
  apiKey: string,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  externalSignal: AbortSignal,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), profile.timeoutMs);
  const cancel = () => controller.abort('cancelled');
  externalSignal.addEventListener('abort', cancel, { once: true });
  try {
    const response = await fetch(buildChatEndpoint(profile), {
      method: 'POST',
      headers: headersFor(profile, apiKey),
      body: JSON.stringify({
        model: profile.model,
        messages,
        stream: true,
        temperature: profile.temperature,
        max_tokens: profile.maxOutputTokens,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw friendlyStatus(response.status);
    if (!response.body) throw new ProviderError('AI 服务没有返回可读取的响应。', 'empty-response');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SSEParser();
    let done = false;
    while (!done) {
      const result = await reader.read();
      if (result.done) break;
      const events = parser.push(decoder.decode(result.value, { stream: true }));
      for (const event of events) {
        const delta = extractOpenAIDelta(event.data);
        if (delta.text) onDelta(delta.text);
        if (delta.done) {
          done = true;
          break;
        }
      }
    }
    for (const event of parser.finish()) {
      const delta = extractOpenAIDelta(event.data);
      if (delta.text) onDelta(delta.text);
    }
  } catch (error) {
    if (externalSignal.aborted) throw new ProviderError('请求已取消。', 'cancelled');
    if (controller.signal.aborted)
      throw new ProviderError('请求超时，请检查网络或增大超时时间。', 'timeout');
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      '无法连接 AI 服务，请检查网络、接口地址和站点权限。',
      'network-error',
      true,
    );
  } finally {
    clearTimeout(timer);
    externalSignal.removeEventListener('abort', cancel);
  }
}

export async function listModels(
  profile: ProviderProfile,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const endpoint = buildModelsEndpoint(profile);
  if (!endpoint)
    throw new ProviderError('Azure OpenAI 不支持通过此入口自动读取部署列表。', 'unsupported');
  const response = await fetch(endpoint, { headers: headersFor(profile, apiKey), signal });
  if (!response.ok) throw friendlyStatus(response.status);
  const payload = (await response.json()) as { data?: Array<{ id?: unknown }> };
  if (!Array.isArray(payload.data))
    throw new ProviderError('模型列表返回格式不兼容。', 'invalid-response');
  return payload.data
    .map((item) => item.id)
    .filter((id): id is string => typeof id === 'string')
    .sort();
}
