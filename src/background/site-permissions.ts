import { originPattern } from '../providers/url';
import { getSettings, saveSettings } from '../storage/settings';

function registrationId(pattern: string): string {
  let hash = 0;
  for (const character of pattern) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `site-${hash.toString(36)}`;
}

export async function hasSitePermission(url: string): Promise<boolean> {
  try {
    return chrome.permissions.contains({ origins: [originPattern(url)] });
  } catch {
    return false;
  }
}

export async function enableSite(tabId: number, url: string): Promise<string> {
  const pattern = originPattern(url);
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) throw new Error('未获得当前网站权限');
  const id = registrationId(pattern);
  await chrome.scripting.unregisterContentScripts({ ids: [id] }).catch(() => undefined);
  await chrome.scripting.registerContentScripts([
    {
      id,
      matches: [pattern],
      js: ['content-script.js'],
      runAt: 'document_idle',
      persistAcrossSessions: true,
      allFrames: true,
    },
  ]);
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ['content-script.js'],
  });
  const settings = await getSettings();
  if (!settings.sitePatterns.includes(pattern)) {
    await saveSettings({ ...settings, sitePatterns: [...settings.sitePatterns, pattern] });
  }
  return pattern;
}

export async function disableSite(url: string): Promise<string> {
  const pattern = originPattern(url);
  await chrome.scripting
    .unregisterContentScripts({ ids: [registrationId(pattern)] })
    .catch(() => undefined);
  await chrome.permissions.remove({ origins: [pattern] });
  const settings = await getSettings();
  await saveSettings({
    ...settings,
    sitePatterns: settings.sitePatterns.filter((item) => item !== pattern),
  });
  return pattern;
}

export async function reconcileSiteRegistrations(): Promise<void> {
  const settings = await getSettings();
  const registrations = await chrome.scripting.getRegisteredContentScripts();
  const knownIds = new Set(registrations.map((item) => item.id));
  for (const pattern of settings.sitePatterns) {
    const allowed = await chrome.permissions.contains({ origins: [pattern] });
    const id = registrationId(pattern);
    if (allowed && !knownIds.has(id)) {
      await chrome.scripting.registerContentScripts([
        {
          id,
          matches: [pattern],
          js: ['content-script.js'],
          runAt: 'document_idle',
          persistAcrossSessions: true,
          allFrames: true,
        },
      ]);
    }
  }
}
