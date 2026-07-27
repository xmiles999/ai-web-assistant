export interface SSEEvent {
  event?: string;
  data: string;
}

export class SSEParser {
  private buffer = '';

  push(chunk: string): SSEEvent[] {
    this.buffer += chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const events: SSEEvent[] = [];
    let boundary = this.buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const block = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const event = parseBlock(block);
      if (event) events.push(event);
      boundary = this.buffer.indexOf('\n\n');
    }
    return events;
  }

  finish(): SSEEvent[] {
    const block = this.buffer;
    this.buffer = '';
    const event = parseBlock(block);
    return event ? [event] : [];
  }
}

function parseBlock(block: string): SSEEvent | undefined {
  if (!block.trim()) return undefined;
  const data: string[] = [];
  let event: string | undefined;
  for (const line of block.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator < 0 ? line : line.slice(0, separator);
    const value = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '');
    if (field === 'data') data.push(value);
    if (field === 'event') event = value;
  }
  if (data.length === 0) return undefined;
  return { event, data: data.join('\n') };
}

export function extractOpenAIDelta(data: string): { done: boolean; text: string } {
  if (data.trim() === '[DONE]') return { done: true, text: '' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new Error('AI 服务返回了无效的 SSE JSON');
  }
  if (!parsed || typeof parsed !== 'object') return { done: false, text: '' };
  const choices = (parsed as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return { done: false, text: '' };
  const first = choices[0] as
    | { delta?: { content?: unknown }; finish_reason?: unknown }
    | undefined;
  const content = first?.delta?.content;
  return {
    done: first?.finish_reason != null,
    text: typeof content === 'string' ? content : '',
  };
}
