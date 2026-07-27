import type { RuntimeRequest, RuntimeResponse } from '../types/messages';

export async function sendRuntime<T = undefined>(
  message: RuntimeRequest,
): Promise<RuntimeResponse<T>> {
  const response: unknown = await chrome.runtime.sendMessage(message);
  return response as RuntimeResponse<T>;
}
