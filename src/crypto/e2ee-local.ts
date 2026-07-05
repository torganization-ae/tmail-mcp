import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'node:crypto';
import { x25519 } from '@noble/curves/ed25519';

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_KEY_LEN = 32;
const AES_NONCE_SIZE = 12;

export async function generateE2EEKeyPairLocal(passphrase: string): Promise<Record<string, unknown>> {
  if (passphrase.length < 16) {
    throw new Error('passphrase must be at least 16 characters');
  }

  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);

  const salt = randomBytes(16);
  const derivedKey = pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LEN, 'sha256');
  const nonce = randomBytes(AES_NONCE_SIZE);
  const cipher = createCipheriv('aes-256-gcm', derivedKey, nonce);
  const encrypted = Buffer.concat([cipher.update(privateKey), cipher.final(), cipher.getAuthTag()]);
  const ciphertext = Buffer.concat([nonce, encrypted]);

  privateKey.fill(0);

  return {
    pub_key_base64: Buffer.from(publicKey).toString('base64'),
    enc_priv_key_base64: ciphertext.toString('base64'),
    pbkdf2_salt: salt.toString('base64'),
    pbkdf2_iterations: PBKDF2_ITERATIONS,
    registered: false,
    warning:
      'Client-side generation: passphrase never sent to server. Store enc_priv_key_base64 and pbkdf2_salt securely.',
  };
}

export function buildE2EEGenerateBody(passphrase: string, register: boolean): Record<string, unknown> {
  return {
    passphrase,
    acknowledge_server_side_risk: true,
    register,
  };
}

export function validateE2EEGenerateBody(passphrase: string, register: boolean): void {
  if (passphrase.length < 16) {
    throw new Error('passphrase too short');
  }
  const body = buildE2EEGenerateBody(passphrase, register);
  if (body.acknowledge_server_side_risk !== true) {
    throw new Error('acknowledge_server_side_risk must be true');
  }
  if (!('register' in body)) {
    throw new Error('register missing');
  }
}

export function e2eeRegisterBody(pubKeyBase64: string): Record<string, unknown> {
  return { pub_key_e2e: pubKeyBase64 };
}

export function unlockPrivateKey(
  encPrivKeyBase64: string,
  saltBase64: string,
  iterations: number,
  passphrase: string,
): Uint8Array {
  const salt = Buffer.from(saltBase64, 'base64');
  const derivedKey = pbkdf2Sync(passphrase, salt, iterations, PBKDF2_KEY_LEN, 'sha256');
  const ciphertext = Buffer.from(encPrivKeyBase64, 'base64');
  const nonce = ciphertext.subarray(0, AES_NONCE_SIZE);
  const encrypted = ciphertext.subarray(AES_NONCE_SIZE);
  const authTag = encrypted.subarray(encrypted.length - 16);
  const encData = encrypted.subarray(0, encrypted.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', derivedKey, nonce);
  decipher.setAuthTag(authTag);
  const privateKey = Buffer.concat([decipher.update(encData), decipher.final()]);
  return new Uint8Array(privateKey);
}

export async function reencryptPrivateKey(
  privateKey: Uint8Array,
  newPassphrase: string,
): Promise<{ enc_priv_key_base64: string; pbkdf2_salt: string; pbkdf2_iterations: number }> {
  if (newPassphrase.length < 16) {
    throw new Error('passphrase must be at least 16 characters');
  }
  const salt = randomBytes(16);
  const derivedKey = pbkdf2Sync(newPassphrase, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LEN, 'sha256');
  const nonce = randomBytes(AES_NONCE_SIZE);
  const cipher = createCipheriv('aes-256-gcm', derivedKey, nonce);
  const encrypted = Buffer.concat([cipher.update(privateKey), cipher.final(), cipher.getAuthTag()]);
  const ciphertext = Buffer.concat([nonce, encrypted]);
  return {
    enc_priv_key_base64: ciphertext.toString('base64'),
    pbkdf2_salt: salt.toString('base64'),
    pbkdf2_iterations: PBKDF2_ITERATIONS,
  };
}

export function verifyPrivateKeyMatchesPub(
  privateKey: Uint8Array,
  pubKeyBase64: string,
): boolean {
  const derivedPub = x25519.getPublicKey(privateKey);
  const expected = Buffer.from(pubKeyBase64, 'base64');
  return Buffer.from(derivedPub).equals(expected);
}
