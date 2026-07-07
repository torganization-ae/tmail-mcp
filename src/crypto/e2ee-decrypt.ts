import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { execSync } from 'node:child_process';
import nacl from 'tweetnacl';
import { unlockPrivateKey, verifyPrivateKeyMatchesPub } from './e2ee-local.js';

const AES_NONCE_SIZE = 12;
const SECRETBOX_NONCE_SIZE = 24;
const CTR1_PREFIX = Buffer.from('CTR1');

export interface EncryptedData {
  uuid?: string;
  version?: string;
  data: {
    subject?: string;
    plainText?: string;
    htmlText?: string;
    from?: string;
    to?: string[];
    messagesID?: string;
    message_id?: string;
    [key: string]: unknown;
  };
  toList: Record<string, string>;
}

export interface AttachmentMeta {
  name?: string;
  mime?: string;
  size?: number;
  content_id?: string;
}

export interface DecryptedAttachment extends AttachmentMeta {
  content_base64: string;
  decrypt_ok: boolean;
  decrypt_error?: string;
}

export interface DecryptedLetter {
  subject: string;
  body_plain: string;
  body_html: string;
  from: string;
  to: string[];
  message_id: string;
  thread_id?: string;
  folder?: string;
  decrypted: boolean;
  decrypt_error?: string;
  attachments: DecryptedAttachment[];
}

/** Parse SECEML binary format → EncryptedData. */
export function parseSeceml(secemlBase64: string): EncryptedData {
  const buf = Buffer.from(secemlBase64, 'base64');
  if (buf.length < 52) {
    throw new Error('SECEML: too short (min 52 bytes)');
  }
  const magic = buf.subarray(0, 6).toString('ascii');
  if (magic !== 'SECEML') {
    throw new Error(`SECEML: bad magic "${magic}"`);
  }
  // buf[6] = version (uint8, currently 0x01)
  const kind = buf[7];
  // bytes 8..47 reserved
  const bodyLen = buf.readUInt32BE(48);
  if (52 + bodyLen > buf.length) {
    throw new Error(`SECEML: body length ${bodyLen} exceeds buffer size (${buf.length - 52} available)`);
  }
  const body = buf.subarray(52, 52 + bodyLen);
  if (kind !== 1) {
    throw new Error(`SECEML: unexpected kind ${kind} (expected 1 for encrypted)`);
  }
  return JSON.parse(body.toString('utf8')) as EncryptedData;
}

/** Extract EncryptedData from a letter response (handles both seceml_base64 and encrypted_data paths). */
export function extractEncryptedData(letter: Record<string, unknown>): EncryptedData {
  const seceml = letter.seceml_base64;
  if (typeof seceml === 'string' && seceml.length > 0) {
    return parseSeceml(seceml);
  }
  const ed = letter.encrypted_data;
  if (ed && typeof ed === 'object' && !Array.isArray(ed)) {
    const raw = ed as Record<string, unknown>;
    if (raw.toList && raw.data) {
      return raw as unknown as EncryptedData;
    }
    throw new Error('encrypted_data missing toList or data');
  }
  throw new Error('no seceml_base64 or encrypted_data in letter — is letter encrypted?');
}

/** Strip "is-" or "bs-" prefix from message ID for use as PBKDF2 salt. */
function cleanMessageId(messageId: string): string {
  if (messageId.startsWith('is-') || messageId.startsWith('bs-')) {
    return messageId.slice(3);
  }
  return messageId;
}

/**
 * Unwrap the per-letter AES key from the toList entry.
 *
 * Protocol (from tmail-e2ee SKILL.md §7):
 * 1. Get entry = toList[myPubKeyBase64]
 * 2. Decode base64, split by "<:>" → ephemeralPubB64, encAesSharedB64
 * 3. NaCl box.before(ephemeralPub, myPrivateKey) → shared secret
 * 4. cleanMessageId = strip "is-"/"bs-" from uuid/messageId
 * 5. PBKDF2-HMAC-SHA256(shared, cleanMessageId, 10000, 32) → derived key
 * 6. NaCl SecretBox open on encAesSharedB64 with derived key
 * 7. SecretBox plaintext is base64-encoded 32-byte AES key
 */
export function unwrapLetterKey(
  toList: Record<string, string>,
  myPubKeyBase64: string,
  privateKey: Uint8Array,
  messageId: string,
): Buffer {
  const entry = toList[myPubKeyBase64];
  if (!entry) {
    throw new Error(`my public key not found in toList (${myPubKeyBase64.slice(0, 16)}...)`);
  }

  const decoded = Buffer.from(entry, 'base64').toString('utf8');
  const splitIdx = decoded.indexOf('<:>');
  if (splitIdx === -1) {
    throw new Error("toList[myPub]: missing '<:>' separator");
  }
  const ephemeralPubB64 = decoded.slice(0, splitIdx);
  const encAesSharedB64 = decoded.slice(splitIdx + 3);

  const ephemeralPub = Buffer.from(ephemeralPubB64, 'base64');
  if (ephemeralPub.length !== 32) {
    throw new Error(`ephemeral pub key wrong size: ${ephemeralPub.length} (expected 32)`);
  }

  const shared = nacl.box.before(ephemeralPub, privateKey);
  if (!shared || shared.length !== 32) {
    throw new Error('box.before returned invalid shared key');
  }

  const salt = cleanMessageId(messageId);
  const derived = pbkdf2Sync(shared, Buffer.from(salt, 'utf8'), 10000, 32, 'sha256');

  const encBytes = Buffer.from(encAesSharedB64, 'base64');
  const nonce = encBytes.subarray(0, SECRETBOX_NONCE_SIZE);
  const ciphertext = encBytes.subarray(SECRETBOX_NONCE_SIZE);

  const opened = nacl.secretbox.open(ciphertext, nonce, derived);
  if (!opened) {
    throw new Error('secretbox.open failed — wrong key or corrupted wrapper');
  }

  // The plaintext is a base64-encoded 32-byte AES key
  const aesKeyB64 = Buffer.from(opened).toString('utf8');
  const aesKey = Buffer.from(aesKeyB64, 'base64');
  if (aesKey.length !== 32) {
    throw new Error(`unwrapped AES key wrong size: ${aesKey.length} (expected 32)`);
  }
  return aesKey;
}

/**
 * Decrypt a single encrypted field.
 *
 * Protocol (§8):
 * 1. base64_decode → raw bytes
 * 2. nonce = first 12 bytes
 * 3. AES-256-GCM decrypt (AAD=nil)
 * 4. Try gzip decompress; fallback to plaintext
 * 5. UTF-8 decode
 */
function decryptFieldCore(encryptedBase64: string, aesKey: Buffer): string {
  const raw = Buffer.from(encryptedBase64, 'base64');
  if (raw.length < AES_NONCE_SIZE + 16) {
    throw new Error(`field ciphertext too short: ${raw.length} bytes (min ${AES_NONCE_SIZE + 16})`);
  }
  const nonce = raw.subarray(0, AES_NONCE_SIZE);
  const authTag = raw.subarray(raw.length - 16);
  const encData = raw.subarray(AES_NONCE_SIZE, raw.length - 16);

  const decipher = createDecipheriv('aes-256-gcm', aesKey, nonce);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encData), decipher.final()]);

  try {
    return gunzipSync(decrypted).toString('utf8');
  } catch {
    return decrypted.toString('utf8');
  }
}

/**
 * Decrypt an attachment.
 *
 * Primary format (§9): CTR1 (4 bytes) + IV (16 bytes) + ciphertext → AES-CTR decrypt → zstd decompress
 * Fallback: AES-GCM: nonce (12 bytes) + ciphertext
 */
function decryptAttachmentCore(encryptedBase64: string, aesKey: Buffer): Buffer {
  const raw = Buffer.from(encryptedBase64, 'base64');

  // Check for CTR1 format (need header 4 + IV 16 = minimum 20 bytes)
  if (raw.length >= 20 && raw.subarray(0, 4).equals(CTR1_PREFIX)) {
    const iv = raw.subarray(4, 20);
    const ciphertext = raw.subarray(20);
    const decipher = createDecipheriv('aes-256-ctr', aesKey, iv);
    decipher.setAutoPadding(false);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    try {
      return execSync('zstd -d', { input: decrypted, timeout: 10000 });
    } catch {
      try {
        // Fallback: try gzip
        return gunzipSync(decrypted);
      } catch {
        // Return raw decrypted bytes as last resort
        return decrypted;
      }
    }
  }

  // GCM fallback format
  if (raw.length < AES_NONCE_SIZE + 16) {
    throw new Error(`attachment ciphertext too short: ${raw.length} bytes (min ${AES_NONCE_SIZE + 16})`);
  }
  const nonce = raw.subarray(0, AES_NONCE_SIZE);
  const authTag = raw.subarray(raw.length - 16);
  const encData = raw.subarray(AES_NONCE_SIZE, raw.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', aesKey, nonce);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encData), decipher.final()]);
}

/** Decrypt string field, returning null on failure. */
function safeDecryptField(val: unknown, aesKey: Buffer): string | null {
  if (typeof val !== 'string' || !val) return null;
  try {
    return decryptFieldCore(val, aesKey);
  } catch {
    return null;
  }
}

/** Pick the message ID from EncryptedData (uuid or data.messagesID or data.message_id). */
function resolveMessageId(ed: EncryptedData): string {
  if (typeof ed.uuid === 'string' && ed.uuid) return ed.uuid;
  if (typeof ed.data.messagesID === 'string' && ed.data.messagesID) return ed.data.messagesID;
  if (typeof ed.data.message_id === 'string' && ed.data.message_id) return ed.data.message_id;
  throw new Error('no uuid or message_id in EncryptedData');
}

export interface DecryptLetterInput {
  letter: Record<string, unknown>;
  myPubKeyBase64: string;
  encPrivKeyBase64: string;
  pbkdf2SaltBase64: string;
  pbkdf2Iterations: number;
  passphrase: string;
  decryptAttachments?: boolean;
}

/** Full decrypt of a single letter. */
export function decryptLetter(input: DecryptLetterInput): DecryptedLetter {
  const {
    letter,
    myPubKeyBase64,
    encPrivKeyBase64,
    pbkdf2SaltBase64,
    pbkdf2Iterations,
    passphrase,
    decryptAttachments = false,
  } = input;

  // Extract encrypted data
  const ed = extractEncryptedData(letter);

  // Unlock private key
  const privateKey = unlockPrivateKey(encPrivKeyBase64, pbkdf2SaltBase64, pbkdf2Iterations, passphrase);
  if (privateKey.length !== 32) {
    throw new Error(`unlocked private key wrong size: ${privateKey.length} (expected 32)`);
  }
  // §4 step 7: verify unlocked key matches stored pub_key_base64
  if (!verifyPrivateKeyMatchesPub(privateKey, myPubKeyBase64)) {
    privateKey.fill(0);
    throw new Error('unlocked private key does not match pub_key_base64 — wrong passphrase or corrupted e2ee.json');
  }

  try {
    // Unwrap letter AES key
    const messageId = resolveMessageId(ed);
    const aesKey = unwrapLetterKey(ed.toList, myPubKeyBase64, privateKey, messageId);

    try {
      // Decrypt fields
      const subject = safeDecryptField(ed.data.subject, aesKey) ?? '';
      const bodyPlain = safeDecryptField(ed.data.plainText, aesKey) ?? '';
      const bodyHtml = safeDecryptField(ed.data.htmlText, aesKey) ?? '';
      const from = safeDecryptField(ed.data.from, aesKey) ?? '';

      let toList: string[] = [];
      if (Array.isArray(ed.data.to)) {
        toList = ed.data.to
          .map((t) => (typeof t === 'string' ? (safeDecryptField(t, aesKey) ?? t) : String(t)))
          .filter(Boolean);
      }

      // Decrypt attachments
      const attachments: DecryptedAttachment[] = [];
      if (decryptAttachments) {
        const rawAttachments = letter.attachments;
        if (Array.isArray(rawAttachments)) {
          for (const att of rawAttachments) {
            if (!att || typeof att !== 'object') continue;
            const a = att as Record<string, unknown>;
            const meta: AttachmentMeta = {
              name: typeof a.name === 'string' ? a.name : undefined,
              mime: typeof a.mime === 'string' ? a.mime : undefined,
              size: typeof a.size === 'number' ? a.size : undefined,
              content_id: typeof a.content_id === 'string' ? a.content_id : undefined,
            };
            const encContent =
              typeof a.encrypted_content_base64 === 'string'
                ? a.encrypted_content_base64
                : typeof a.content_base64 === 'string'
                  ? a.content_base64
                  : '';

            if (encContent) {
              try {
                const decContent = decryptAttachmentCore(encContent, aesKey);
                attachments.push({
                  ...meta,
                  content_base64: decContent.toString('base64'),
                  decrypt_ok: true,
                });
              } catch (err) {
                attachments.push({
                  ...meta,
                  content_base64: '',
                  decrypt_ok: false,
                  decrypt_error: err instanceof Error ? err.message : String(err),
                });
              }
            } else {
              attachments.push({ ...meta, content_base64: '', decrypt_ok: false, decrypt_error: 'no encrypted content' });
            }
          }
        }
      }

      return {
        subject,
        body_plain: bodyPlain,
        body_html: bodyHtml,
        from,
        to: toList,
        message_id: ed.data.message_id as string || ed.data.messagesID as string || ed.uuid || '',
        thread_id: typeof letter.thread_id === 'string' ? letter.thread_id : undefined,
        folder: typeof letter.folder === 'string' ? letter.folder : undefined,
        decrypted: true,
        attachments,
      };
    } finally {
      aesKey.fill(0);
    }
  } finally {
    privateKey.fill(0);
  }
}

/**
 * Try to decrypt but return a partial result on failure (per failure matrix).
 * Never throws — always returns a DecryptedLetter.
 */
export function safeDecryptLetter(input: DecryptLetterInput): DecryptedLetter {
  try {
    return decryptLetter(input);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // If the error mentions toList/missing pub, mark as encrypted-not-decryptable
    if (errMsg.includes('not found in toList')) {
      return {
        subject: '',
        body_plain: '',
        body_html: '',
        from: '',
        to: [],
        message_id: '',
        decrypted: false,
        decrypt_error: 'encrypted-not-decryptable-for-this-identity — my pub key not in toList',
        attachments: [],
      };
    }
    return {
      subject: '',
      body_plain: '',
      body_html: '',
      from: '',
      to: [],
      message_id: '',
      decrypted: false,
      decrypt_error: errMsg,
      attachments: [],
    };
  }
}
