import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { execSync } from 'node:child_process';
import nacl from 'tweetnacl';
import { unlockPrivateKey, verifyPrivateKeyMatchesPub } from './e2ee-local.js';

const AES_NONCE_SIZE = 12;
const SECRETBOX_NONCE_SIZE = 24;
const CTR1_PREFIX = Buffer.from('CTR1');

// --- NEW interfaces for attachment metadata, sender/recipient profiles ---

export interface AttachmentMetaEncrypted {
  fileID?: string;       // plain
  filename?: string;     // AES-256-GCM
  contentType?: string;  // AES-256-GCM
  size?: string;         // plain, MB как строка
  cid?: string;          // plain
}

export interface SenderAdditionalInfoEncrypted {
  additionalInfoObject?: string;  // UsersAdditionalInfo → JSON → AES-256-GCM
  displayName?: string;
  logoAvatarUrl?: string;
  avatarBase64?: string;
  avatarColor?: string;
  emojiAvatar?: string;
  emojiStatus?: string;
}

export interface RecipientAdditionalInfoEncrypted {
  additionalInfoObject?: string;  // RecipientAdditionalInfo → JSON → AES-256-GCM
  profiles?: Record<string, Record<string, unknown>>;
}

// --- Core data structures ---

export interface EncryptedData {
  uuid?: string;
  version?: string;
  sign?: string;
  data: {
    subject?: string;
    plainText?: string;
    htmlText?: string;
    from?: string;
    to?: string[];
    messagesID?: string;
    message_id?: string;
    inReplyTo?: string;
    references?: string[];
    timestamp?: number;
    threadID?: string;
    attachments?: AttachmentMetaEncrypted[];
    senderAdditionalInfo?: SenderAdditionalInfoEncrypted;
    recipientAdditionalInfo?: RecipientAdditionalInfoEncrypted;
    [key: string]: unknown;
  };
  toList: Record<string, string>;
}

export interface AttachmentMeta {
  file_id: string;        // обязательное, из att.fileID
  name?: string;
  mime?: string;
  size?: string;          // было number → string (как на бэкенде)
  content_id?: string;
}

export interface DecryptedAttachment extends AttachmentMeta {
  content_base64: string;
  decrypt_ok: boolean;
  decrypt_error?: string;
}

// --- Decrypted result types ---

export interface SenderInfo {
  display_name: string;
  avatar_url: string;
  avatar_base64: string;
  avatar_color: string;
  emoji_avatar: string;
  emoji_status: string;
}

export interface RecipientProfiles {
  [address: string]: SenderInfo;
}

export interface DecryptedLetter {
  letter_id: string;
  subject: string;
  body_plain: string;
  body_html: string;
  from: string;
  to: string[];
  message_id: string;
  thread_id?: string;
  folder?: string;
  in_reply_to: string;
  references: string[];
  timestamp: number;
  sender: SenderInfo;
  recipients: RecipientProfiles;
  decrypted: boolean;
  decrypt_error?: string;
  attachments: DecryptedAttachment[];
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

export interface DecryptLetterFieldsInput {
  letter: Record<string, unknown>;
  ed: EncryptedData;
  aesKey: Buffer;
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
export function decryptAttachmentCore(encryptedBase64: string, aesKey: Buffer): Buffer {
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

// ============================================================
// Two-phase decryption: derive key (phase 1) + decrypt fields (phase 2)
// The aesKey must NOT be zeroed inside these functions — the caller
// (tool handler) needs the same key to decrypt attachment binaries.
// ============================================================

/** Phase 1: parse SECEML, unlock private key, unwrap the per-letter AES key. */
export function deriveLetterAesKey(
  letter: Record<string, unknown>,
  myPubKeyBase64: string,
  encPrivKeyBase64: string,
  pbkdf2SaltBase64: string,
  pbkdf2Iterations: number,
  passphrase: string,
): { aesKey: Buffer; ed: EncryptedData; messageId: string } {
  const ed = extractEncryptedData(letter);

  const privateKey = unlockPrivateKey(encPrivKeyBase64, pbkdf2SaltBase64, pbkdf2Iterations, passphrase);
  if (privateKey.length !== 32) {
    throw new Error(`unlocked private key wrong size: ${privateKey.length} (expected 32)`);
  }
  if (!verifyPrivateKeyMatchesPub(privateKey, myPubKeyBase64)) {
    privateKey.fill(0);
    throw new Error('unlocked private key does not match pub_key_base64 — wrong passphrase or corrupted e2ee.json');
  }

  try {
    const messageId = resolveMessageId(ed);
    const aesKey = unwrapLetterKey(ed.toList, myPubKeyBase64, privateKey, messageId);
    return { aesKey, ed, messageId };
  } finally {
    privateKey.fill(0);
  }
}

// ============================================================
// Private helpers for decryptSenderInfo / decryptRecipientProfiles / buildAttachmentMetadata
// ============================================================

function decryptSenderInfo(encrypted: SenderAdditionalInfoEncrypted | undefined, aesKey: Buffer): SenderInfo {
  const empty: SenderInfo = { display_name: '', avatar_url: '', avatar_base64: '', avatar_color: '', emoji_avatar: '', emoji_status: '' };
  if (!encrypted?.additionalInfoObject) return empty;
  const dec = safeDecryptField(encrypted.additionalInfoObject, aesKey);
  if (!dec) return empty;
  try {
    const p = JSON.parse(dec);
    return {
      display_name: p.displayName ?? '',
      avatar_url: p.logoAvatarUrl ?? '',
      avatar_base64: p.avatarBase64 ?? '',
      avatar_color: p.avatarColor ?? '',
      emoji_avatar: p.emojiAvatar ?? '',
      emoji_status: p.emojiStatus ?? '',
    };
  } catch { return empty; }
}

function decryptRecipientProfiles(encrypted: RecipientAdditionalInfoEncrypted | undefined, aesKey: Buffer): RecipientProfiles {
  if (!encrypted?.additionalInfoObject) return {};
  const dec = safeDecryptField(encrypted.additionalInfoObject, aesKey);
  if (!dec) return {};
  try {
    const parsed = JSON.parse(dec);
    const profiles = parsed.profiles as Record<string, Record<string, unknown>> | undefined;
    if (!profiles) return {};
    const result: RecipientProfiles = {};
    for (const [addr, profile] of Object.entries(profiles)) {
      result[addr] = {
        display_name: (profile.displayName as string) ?? '',
        avatar_url: (profile.logoAvatarUrl as string) ?? '',
        avatar_base64: (profile.avatarBase64 as string) ?? '',
        avatar_color: (profile.avatarColor as string) ?? '',
        emoji_avatar: (profile.emojiAvatar as string) ?? '',
        emoji_status: (profile.emojiStatus as string) ?? '',
      };
    }
    return result;
  } catch { return {}; }
}

function buildAttachmentMetadata(raw: AttachmentMetaEncrypted[] | undefined, aesKey: Buffer): DecryptedAttachment[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map(att => ({
    file_id: att.fileID ?? '',
    name: safeDecryptField(att.filename, aesKey) ?? '',
    mime: safeDecryptField(att.contentType, aesKey) ?? '',
    size: att.size,
    content_id: att.cid ?? '',
    content_base64: '',
    decrypt_ok: false,
  }));
}

// ============================================================
// Phase 2: decrypt all letter fields (does NOT zero aesKey)
// ============================================================

/** Phase 2: decrypt every field in the letter + attachment metadata + sender/recipient profiles. */
export function decryptLetterFields(input: DecryptLetterFieldsInput): DecryptedLetter {
  const { letter, ed, aesKey } = input;

  // Текстовые поля (AES-256-GCM)
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

  // Plain поля (прямое чтение)
  const inReplyTo = typeof ed.data.inReplyTo === 'string' ? ed.data.inReplyTo : '';
  const references = Array.isArray(ed.data.references)
    ? ed.data.references.filter((r): r is string => typeof r === 'string')
    : [];
  const timestamp = typeof ed.data.timestamp === 'number' ? ed.data.timestamp : 0;
  const threadId = typeof ed.data.threadID === 'string' ? ed.data.threadID : undefined;

  // Расшифровка профилей
  const sender = decryptSenderInfo(ed.data.senderAdditionalInfo, aesKey);
  const recipients = decryptRecipientProfiles(ed.data.recipientAdditionalInfo, aesKey);

  // Attachment metadata (всегда)
  const attachments = buildAttachmentMetadata(ed.data.attachments, aesKey);

  return {
    letter_id: typeof letter.letter_id === 'string' ? letter.letter_id : '',
    subject, body_plain: bodyPlain, body_html: bodyHtml, from, to: toList,
    message_id: (ed.data.message_id || ed.data.messagesID || ed.uuid || '') as string,
    thread_id: threadId,
    folder: typeof letter.folder === 'string' ? letter.folder : undefined,
    in_reply_to: inReplyTo, references, timestamp, sender, recipients,
    decrypted: true, attachments,
  };
}

// ============================================================
// Fallback / safe wrapper
// ============================================================

export const FALLBACK_LETTER: DecryptedLetter = {
  letter_id: '',
  subject: '', body_plain: '', body_html: '', from: '', to: [],
  message_id: '', thread_id: undefined, folder: undefined,
  in_reply_to: '', references: [], timestamp: 0,
  sender: { display_name: '', avatar_url: '', avatar_base64: '', avatar_color: '', emoji_avatar: '', emoji_status: '' },
  recipients: {},
  decrypted: false,
  attachments: [],
};

/**
 * Try to decrypt but return a partial result on failure (per failure matrix).
 * Never throws — always returns a DecryptedLetter.
 * Wrapper over deriveLetterAesKey + decryptLetterFields. Zeroes aesKey in finally.
 */
export function safeDecryptLetter(input: DecryptLetterInput): DecryptedLetter {
  const { letter, myPubKeyBase64, encPrivKeyBase64, pbkdf2SaltBase64, pbkdf2Iterations, passphrase } = input;
  let aesKey: Buffer | null = null;
  try {
    const derived = deriveLetterAesKey(letter, myPubKeyBase64, encPrivKeyBase64, pbkdf2SaltBase64, pbkdf2Iterations, passphrase);
    aesKey = derived.aesKey;
    return decryptLetterFields({ letter, ed: derived.ed, aesKey });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('not found in toList')) {
      return { ...FALLBACK_LETTER, decrypt_error: 'encrypted-not-decryptable-for-this-identity — my pub key not in toList' };
    }
    return { ...FALLBACK_LETTER, decrypt_error: errMsg };
  } finally {
    if (aesKey) aesKey.fill(0);
  }
}
