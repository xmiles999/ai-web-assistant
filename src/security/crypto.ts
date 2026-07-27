import type { EncryptedSecret } from '../types';

const ITERATIONS = 310_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const safeSalt = new Uint8Array(new ArrayBuffer(salt.byteLength));
  safeSalt.set(salt);
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: safeSalt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptSecret(secret: string, passphrase: string): Promise<EncryptedSecret> {
  if (!secret) throw new Error('API Key 不能为空');
  if (passphrase.length < 10) throw new Error('解锁口令至少需要 10 个字符');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(secret),
  );
  return {
    version: 1,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA-256',
    iterations: ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptSecret(payload: EncryptedSecret, passphrase: string): Promise<string> {
  try {
    if (payload.version !== 1 || payload.iterations !== ITERATIONS) throw new Error('格式不受支持');
    const key = await deriveKey(passphrase, fromBase64(payload.salt));
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(payload.iv) },
      key,
      fromBase64(payload.ciphertext),
    );
    return decoder.decode(plaintext);
  } catch {
    throw new Error('解锁失败，请检查口令');
  }
}
