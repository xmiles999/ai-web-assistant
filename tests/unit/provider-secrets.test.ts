import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROVIDER } from '../../src/storage/defaults';
import { saveProvider } from '../../src/storage/provider-secrets';
import {
  clearSessionSecret,
  getProviders,
  getProviderSecret,
  initializeStorage,
  saveProviders,
  setSessionSecret,
} from '../../src/storage/settings';
import { decryptSecret } from '../../src/security/crypto';
import type { ProviderProfile } from '../../src/types';

describe('provider credential persistence', () => {
  let local: Record<string, unknown>;
  let session: Record<string, unknown>;
  let localArea: ReturnType<typeof area>;

  function area(data: Record<string, unknown>) {
    return {
      setAccessLevel: vi.fn(() => Promise.resolve()),
      get: vi.fn((keys: string | string[]) =>
        Promise.resolve(
          structuredClone(
            Object.fromEntries(
              (Array.isArray(keys) ? keys : [keys]).map((key) => [key, data[key]]),
            ),
          ),
        ),
      ),
      set: vi.fn((values: Record<string, unknown>) =>
        Promise.resolve(Object.assign(data, structuredClone(values))),
      ),
      remove: vi.fn((key: string) => {
        delete data[key];
        return Promise.resolve();
      }),
    };
  }

  const restartSession = () => {
    for (const key of Object.keys(session)) delete session[key];
  };
  const current = async () => (await getProviders())[0]!;
  const save = async (mode: ProviderProfile['secretStorage'], key = '', passphrase = '') => {
    await saveProvider({ ...(await current()), secretStorage: mode }, key, passphrase);
    return current();
  };

  beforeEach(() => {
    local = {};
    session = {};
    localArea = area(local);
    vi.stubGlobal('chrome', { storage: { local: localArea, session: area(session) } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('remembers a new key after the session is cleared and storage is initialized again', async () => {
    expect(DEFAULT_PROVIDER.secretStorage).toBe('local');
    await initializeStorage();
    await save('local', 'test-only-key');
    restartSession();
    await initializeStorage();
    await expect(getProviderSecret(await current())).resolves.toBe('test-only-key');
    expect(localArea.setAccessLevel).toHaveBeenCalledWith({
      accessLevel: 'TRUSTED_CONTEXTS',
    });
    expect(localArea.setAccessLevel).toHaveBeenCalledBefore(localArea.set);
  });

  it('does not silently persist legacy session credentials', async () => {
    await saveProviders([{ ...DEFAULT_PROVIDER, secretStorage: 'session' }]);
    await setSessionSecret(DEFAULT_PROVIDER.id, 'test-session-key');
    await initializeStorage();
    expect(await current()).not.toHaveProperty('localSecret');
    restartSession();
    await expect(getProviderSecret(await current())).resolves.toBe('');
  });

  it('migrates an existing session key only on explicit local save', async () => {
    await save('session', 'test-session-key');
    await save('local');
    restartSession();
    await expect(getProviderSecret(await current())).resolves.toBe('test-session-key');
  });

  it('preserves an existing local key when an edit leaves the key blank', async () => {
    await save('local', 'test-only-key');
    await saveProvider({ ...(await current()), name: 'Renamed' }, '', '');
    expect((await current()).name).toBe('Renamed');
    await expect(getProviderSecret(await current())).resolves.toBe('test-only-key');
  });

  it('replaces a remembered key and does not use an obsolete session key', async () => {
    await save('local', 'test-old-key');
    await setSessionSecret(DEFAULT_PROVIDER.id, 'test-stale-key');
    await save('local', 'test-new-key');
    restartSession();
    await expect(getProviderSecret(await current())).resolves.toBe('test-new-key');
  });

  it('removes the persisted key when switching back to session storage', async () => {
    await save('local', 'test-only-key');
    const profile = await save('session');
    expect(profile).not.toHaveProperty('localSecret');
    await expect(getProviderSecret(profile)).resolves.toBe('test-only-key');
    restartSession();
    await expect(getProviderSecret(profile)).resolves.toBe('');
  });

  it('encrypts an existing local key on mode change and no longer persists plaintext', async () => {
    await save('local', 'test-only-key');
    const profile = await save('encrypted', '', 'test-only-passphrase');
    expect(profile).not.toHaveProperty('localSecret');
    expect(JSON.stringify(local)).not.toContain('test-only-key');
    await expect(decryptSecret(profile.encryptedSecret!, 'test-only-passphrase')).resolves.toBe(
      'test-only-key',
    );
    restartSession();
    await expect(getProviderSecret(profile)).resolves.toBe('');
  });

  it('keeps the previous key if encryption fails', async () => {
    await save('local', 'test-only-key');
    await expect(save('encrypted', '', 'short')).rejects.toThrow('至少');
    await expect(getProviderSecret(await current())).resolves.toBe('test-only-key');
    expect((await current()).secretStorage).toBe('local');
  });

  it('preserves a locked encrypted key on unrelated edits', async () => {
    const profile = await save('encrypted', 'test-only-key', 'test-only-passphrase');
    restartSession();
    const edited = await save('encrypted');
    expect(edited.encryptedSecret).toEqual(profile.encryptedSecret);
    expect(edited).not.toHaveProperty('localSecret');
  });

  it('requires unlocking or re-entering a key before leaving encrypted storage', async () => {
    await save('encrypted', 'test-only-key', 'test-only-passphrase');
    restartSession();
    await expect(save('local')).rejects.toThrow('先解锁');
    expect((await current()).secretStorage).toBe('encrypted');
    await setSessionSecret(DEFAULT_PROVIDER.id, 'test-only-key');
    const profile = await save('local');
    expect(profile).not.toHaveProperty('encryptedSecret');
    restartSession();
    await expect(getProviderSecret(profile)).resolves.toBe('test-only-key');
  });

  it('removes credentials when deleting the provider', async () => {
    await save('local', 'test-only-key');
    await clearSessionSecret(DEFAULT_PROVIDER.id);
    await saveProviders([]);
    expect(JSON.stringify(local)).not.toContain('test-only-key');
    await expect(getProviderSecret(await current())).resolves.toBe('');
  });

  it('rejects missing required keys but allows unauthenticated local services', async () => {
    await expect(save('local')).rejects.toThrow('请填写');
    const next = await saveProvider({ ...DEFAULT_PROVIDER, apiKeyRequired: false }, '', '');
    expect(next[0]).not.toHaveProperty('localSecret');
  });

  it('does not write any key if restricting local storage access fails', async () => {
    localArea.setAccessLevel.mockRejectedValueOnce(new Error('denied'));
    await expect(saveProvider(DEFAULT_PROVIDER, 'test-only-key', '')).rejects.toThrow('denied');
    expect(local).toEqual({});
    expect(session).toEqual({});
  });
});
