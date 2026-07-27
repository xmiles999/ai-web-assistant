import type { ExtensionSettings, PromptAction, ProviderProfile } from '../types';

const createdAt = '2026-01-01T00:00:00.000Z';

export const DEFAULT_PROVIDER: ProviderProfile = {
  id: 'default-openai',
  name: 'OpenAI 兼容接口',
  protocol: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  model: '',
  apiKeyRequired: true,
  secretStorage: 'session',
  temperature: 0.3,
  maxOutputTokens: 2048,
  timeoutMs: 60_000,
  enabled: true,
  createdAt,
  updatedAt: createdAt,
};

export const DEFAULT_SETTINGS: ExtensionSettings = {
  activeProviderId: DEFAULT_PROVIDER.id,
  sendPageTitle: false,
  sendPageUrl: false,
  historyEnabled: false,
  retentionDays: 30,
  targetLanguage: '简体中文',
  maxSelectionCharacters: 12_000,
  theme: 'system',
};

export const BUILT_IN_PROMPTS: PromptAction[] = [
  {
    id: 'ask',
    name: '询问 AI',
    description: '围绕选中内容回答问题',
    promptTemplate:
      '请根据选中内容回答用户问题。\n\n用户问题：{{userInput}}\n\n选中内容：\n{{selection}}',
    iconKey: 'ask',
    enabled: true,
    order: 0,
    builtIn: true,
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: 'translate',
    name: '翻译',
    description: '准确翻译并保留原有结构',
    promptTemplate:
      '请将选中内容翻译为{{targetLanguage}}。保留代码、数字、专有名词和 Markdown 结构，不添加原文没有的事实。\n\n{{selection}}',
    iconKey: 'translate',
    enabled: true,
    order: 1,
    builtIn: true,
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: 'summarize',
    name: '总结',
    description: '提炼主题、关键点与结论',
    promptTemplate:
      '请总结选中内容，依次给出主题、关键点和必要结论。保持准确，不虚构来源或事实。\n\n{{selection}}',
    iconKey: 'summarize',
    enabled: true,
    order: 2,
    builtIn: true,
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: 'explain',
    name: '解释',
    description: '解释定义、原理、上下文和例子',
    promptTemplate:
      '请解释选中内容，包括定义、基本原理、常见使用场景和一个简短例子。不确定的信息请明确说明。\n\n{{selection}}',
    iconKey: 'explain',
    enabled: true,
    order: 3,
    builtIn: true,
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: 'polish',
    name: '润色',
    description: '改善表达但保持原意',
    promptTemplate:
      '请以自然、准确、克制的方式润色选中内容，保持原意，不添加新事实。只输出润色后的文本。\n\n{{selection}}',
    iconKey: 'polish',
    enabled: true,
    order: 4,
    builtIn: true,
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: 'code-analysis',
    name: '代码分析',
    description: '分析用途、问题、安全风险和改进方向',
    promptTemplate:
      '请分析选中代码，说明用途、潜在缺陷、安全风险和可执行的改进建议。不要假设未提供的运行环境。\n\n{{selection}}',
    iconKey: 'code',
    enabled: true,
    order: 5,
    builtIn: true,
    createdAt,
    updatedAt: createdAt,
  },
];
