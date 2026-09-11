import type { ExtensionSettings, PromptAction, ProviderProfile } from '../types';
import { BUILT_IN_PROMPTS, DEFAULT_PROVIDER, DEFAULT_SETTINGS } from './defaults';

const KEYS = {
  settings: 'settings',
  providers: 'providers',
  prompts: 'prompts',
  pendingTask: 'pendingTask',
} as const;

export async function initializeStorage(): Promise<void> {
  await protectStorage();
  const values = await chrome.storage.local.get([KEYS.settings, KEYS.providers, KEYS.prompts]);
  const changes: Record<string, unknown> = {};
  if (!values[KEYS.settings]) changes[KEYS.settings] = DEFAULT_SETTINGS;
  if (!values[KEYS.providers]) changes[KEYS.providers] = [DEFAULT_PROVIDER];
  if (!values[KEYS.prompts]) changes[KEYS.prompts] = BUILT_IN_PROMPTS;
  if (Object.keys(changes).length > 0) await chrome.storage.local.set(changes);
}

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(KEYS.settings);
  return {
    ...DEFAULT_SETTINGS,
    ...(result[KEYS.settings] as Partial<ExtensionSettings> | undefined),
  };
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [KEYS.settings]: settings });
}

export async function getProviders(): Promise<ProviderProfile[]> {
  await protectStorage();
  const result = await chrome.storage.local.get(KEYS.providers);
  const profiles = result[KEYS.providers] as ProviderProfile[] | undefined;
  return profiles?.length ? profiles : [DEFAULT_PROVIDER];
}

export async function saveProviders(providers: ProviderProfile[]): Promise<void> {
  await protectStorage();
  await chrome.storage.local.set({ [KEYS.providers]: providers });
}

export async function protectStorage(): Promise<void> {
  await Promise.all([
    chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
    chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  ]);
}

export async function getProviderSecret(profile: ProviderProfile): Promise<string> {
  if (profile.secretStorage === 'local') return profile.localSecret ?? '';
  return getSessionSecret(profile.id);
}

export async function getPrompts(): Promise<PromptAction[]> {
  const result = await chrome.storage.local.get(KEYS.prompts);
  const prompts = result[KEYS.prompts] as PromptAction[] | undefined;
  return (prompts?.length ? prompts : BUILT_IN_PROMPTS).slice().sort((a, b) => a.order - b.order);
}

export async function savePrompts(prompts: PromptAction[]): Promise<void> {
  await chrome.storage.local.set({ [KEYS.prompts]: prompts });
}

export async function setSessionSecret(providerId: string, secret: string): Promise<void> {
  await chrome.storage.session.set({ [`providerSecret:${providerId}`]: secret });
}

export async function getSessionSecret(providerId: string): Promise<string> {
  const key = `providerSecret:${providerId}`;
  const result = await chrome.storage.session.get(key);
  return typeof result[key] === 'string' ? result[key] : '';
}

export async function clearSessionSecret(providerId: string): Promise<void> {
  await chrome.storage.session.remove(`providerSecret:${providerId}`);
}

export { KEYS };
