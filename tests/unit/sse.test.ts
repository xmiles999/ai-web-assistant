import { describe, expect, it } from 'vitest';
import { extractOpenAIDelta, SSEParser } from '../../src/providers/sse';

describe('SSEParser', () => {
  it('supports events split across arbitrary network chunks', () => {
    const parser = new SSEParser();
    expect(parser.push('data: {"choices":[{"delta":{"con')).toEqual([]);
    expect(parser.push('tent":"你好"}}]}\n\n')).toEqual([
      { data: '{"choices":[{"delta":{"content":"你好"}}]}' },
    ]);
    expect(extractOpenAIDelta('[DONE]')).toEqual({ done: true, text: '' });
  });

  it('joins multiline data fields and ignores comments', () => {
    const parser = new SSEParser();
    expect(parser.push(': ping\ndata: first\ndata: second\n\n')).toEqual([
      { data: 'first\nsecond' },
    ]);
  });

  it('flushes a final event and handles empty or non-choice payloads', () => {
    const parser = new SSEParser();
    expect(parser.push('event: message\ndata: {"ok":true}')).toEqual([]);
    expect(parser.finish()).toEqual([{ event: 'message', data: '{"ok":true}' }]);
    expect(new SSEParser().finish()).toEqual([]);
    expect(extractOpenAIDelta('null')).toEqual({ done: false, text: '' });
    expect(extractOpenAIDelta('{}')).toEqual({ done: false, text: '' });
    expect(extractOpenAIDelta('{"choices":[{}]}')).toEqual({ done: false, text: '' });
    expect(() => extractOpenAIDelta('not-json')).toThrow('无效的 SSE JSON');
  });
});
