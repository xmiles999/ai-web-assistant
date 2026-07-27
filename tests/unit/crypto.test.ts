import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '../../src/security/crypto';

describe('secret encryption', () => {
  it('round trips and rejects the wrong passphrase', async () => {
    const encrypted = await encryptSecret('test-secret', 'a sufficiently long passphrase');
    expect(encrypted.ciphertext).not.toContain('test-secret');
    await expect(decryptSecret(encrypted, 'a sufficiently long passphrase')).resolves.toBe(
      'test-secret',
    );
    await expect(decryptSecret(encrypted, 'wrong passphrase')).rejects.toThrow('解锁失败');
  });
});
