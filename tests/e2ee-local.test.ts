import { describe, expect, it } from 'vitest';
import { generateE2EEKeyPairLocal } from '../src/crypto/e2ee-local.js';

describe('e2ee-local', () => {
  it('generates key pair with required fields', async () => {
    const out = await generateE2EEKeyPairLocal('sixteen-characters-min');
    for (const key of ['pub_key_base64', 'enc_priv_key_base64', 'pbkdf2_salt', 'pbkdf2_iterations']) {
      expect(out[key]).toBeTruthy();
    }
    expect(out.registered).toBe(false);
    expect(out.pbkdf2_iterations).toBe(600_000);
  });

  it('rejects short passphrase', async () => {
    await expect(generateE2EEKeyPairLocal('short')).rejects.toThrow(/16/);
  });
});
