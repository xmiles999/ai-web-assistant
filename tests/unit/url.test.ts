import { describe, expect, it } from 'vitest';
import {
  buildChatEndpoint,
  buildModelsEndpoint,
  originPattern,
  validateProvider,
} from '../../src/providers/url';
import { DEFAULT_PROVIDER } from '../../src/storage/defaults';

describe('provider URL validation', () => {
  it('does not duplicate the v1 path', () => {
    expect(buildChatEndpoint({ ...DEFAULT_PROVIDER, baseUrl: 'https://api.example.com/v1' })).toBe(
      'https://api.example.com/v1/chat/completions',
    );
  });

  it('only permits HTTP local endpoints', () => {
    expect(
      validateProvider({
        ...DEFAULT_PROVIDER,
        baseUrl: 'http://localhost:11434/v1',
        model: 'local',
      }).valid,
    ).toBe(true);
    expect(
      validateProvider({ ...DEFAULT_PROVIDER, baseUrl: 'http://example.com/v1', model: 'local' })
        .valid,
    ).toBe(false);
  });

  it('creates a least-specific origin pattern for site permissions', () => {
    expect(originPattern('https://example.com/article?id=1')).toBe('https://example.com/*');
  });

  it('reports invalid fields and builds Azure endpoints', () => {
    const invalid = validateProvider({
      ...DEFAULT_PROVIDER,
      name: '',
      model: '',
      baseUrl: 'ftp://user:pass@example.com/v1?x=1#hash',
      temperature: 3,
      maxOutputTokens: 0,
      timeoutMs: 1,
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThanOrEqual(7);
    const azure = {
      ...DEFAULT_PROVIDER,
      protocol: 'azure-openai' as const,
      baseUrl: 'https://resource.openai.azure.com',
      model: 'deployment-model',
      azureDeployment: 'my deployment',
      apiVersion: '2024-10-21',
    };
    expect(buildChatEndpoint(azure)).toContain(
      '/openai/deployments/my%20deployment/chat/completions?api-version=2024-10-21',
    );
    expect(buildModelsEndpoint(azure)).toBeUndefined();
    expect(() => originPattern('chrome://settings')).toThrow('不支持扩展注入');
  });
});
