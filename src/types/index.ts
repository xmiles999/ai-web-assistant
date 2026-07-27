export type ProviderProtocol = 'openai-compatible' | 'azure-openai';
export type SecretStorageMode = 'session' | 'encrypted';
export type ThemeMode = 'system' | 'light' | 'dark';
export type ActionId = string;

export interface EncryptedSecret {
  version: 1;
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface ProviderProfile {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  model: string;
  apiKeyRequired: boolean;
  secretStorage: SecretStorageMode;
  encryptedSecret?: EncryptedSecret;
  azureDeployment?: string;
  apiVersion?: string;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExtensionSettings {
  activeProviderId: string;
  sendPageTitle: boolean;
  sendPageUrl: boolean;
  historyEnabled: boolean;
  retentionDays: number;
  targetLanguage: string;
  maxSelectionCharacters: number;
  theme: ThemeMode;
}

export interface PromptAction {
  id: ActionId;
  name: string;
  description: string;
  promptTemplate: string;
  systemPrompt?: string;
  iconKey: string;
  enabled: boolean;
  order: number;
  builtIn: boolean;
  providerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SelectionContext {
  selectedText: string;
  pageTitle: string;
  pageUrl: string;
  timestamp: string;
  frameUrl?: string;
}

export interface PendingTask {
  requestId: string;
  actionId: ActionId;
  selection: SelectionContext;
  userInput?: string;
  createdAt: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface Conversation {
  id: string;
  providerId: string;
  model: string;
  actionId: ActionId;
  pageTitle?: string;
  pageUrl?: string;
  selectedText: string;
  userInput?: string;
  responseText: string;
  status: 'completed' | 'cancelled' | 'error';
  createdAt: string;
  updatedAt: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
