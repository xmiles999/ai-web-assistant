import type { ProviderProfile } from '../types';
import { encryptSecret } from '../security/crypto';
import {
  clearSessionSecret,
  getProviders,
  getProviderSecret,
  saveProviders,
  setSessionSecret,
} from './settings';

/** Only called by the trusted settings page after an explicit save. */
export async function saveProvider(
  editing: ProviderProfile,
  apiKey: string,
  passphrase: string,
): Promise<ProviderProfile[]> {
  const providers = await getProviders();
  const previous = providers.find((item) => item.id === editing.id);
  const secret = apiKey || (previous ? await getProviderSecret(previous) : '');
  const profile = { ...editing, updatedAt: new Date().toISOString() };
  const keepEncrypted =
    profile.secretStorage === 'encrypted' &&
    previous?.secretStorage === 'encrypted' &&
    previous.encryptedSecret &&
    !apiKey;

  if (profile.apiKeyRequired && !secret && !keepEncrypted)
    throw new Error('请填写 API Key，或先解锁原来的加密密钥再保存');

  delete profile.localSecret;
  delete profile.encryptedSecret;
  if (profile.secretStorage === 'local') {
    if (secret) profile.localSecret = secret;
  } else if (profile.secretStorage === 'encrypted') {
    if (keepEncrypted) profile.encryptedSecret = previous.encryptedSecret;
    else if (secret) profile.encryptedSecret = await encryptSecret(secret, passphrase);
  }

  const next = previous
    ? providers.map((item) => (item.id === profile.id ? profile : item))
    : [...providers, profile];
  // The mode and its persistent credential are replaced together.
  await saveProviders(next);
  if (profile.secretStorage === 'local') await clearSessionSecret(profile.id);
  else if (secret) await setSessionSecret(profile.id, secret);
  return next;
}
