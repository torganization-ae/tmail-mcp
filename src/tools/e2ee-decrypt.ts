import fs from 'node:fs';
import { requireGate } from './guard.js';
import { sanitizeForTool, withProfileContext } from './sanitize.js';
import { resolvePassphrase, migrateLegacyPassphraseInJson } from '../profile/passphrase.js';
import {
  optionalBool,
  optionalString,
  optionalInt,
  requireStringArray,
  textError,
  textResult,
  type Runtime,
} from './runtime.js';
import {
  safeDecryptLetter,
  type DecryptedLetter,
} from '../crypto/e2ee-decrypt.js';
import {
  extractFailedLetterIds,
  extractLetterResults,
} from '../client/letter-results.js';

async function loadE2EEProfile(rt: Runtime): Promise<{
  pubKeyBase64: string;
  encPrivKeyBase64: string;
  pbkdf2Salt: string;
  pbkdf2Iterations: number;
  passphrase: string;
}> {
  await migrateLegacyPassphraseInJson(rt.paths);

  const resolved = await resolvePassphrase(rt.paths, {
    envFallback: rt.cfg.e2eePassphrase,
    autoGenerate: false,
  });

  let profile: Record<string, unknown>;
  try {
    profile = JSON.parse(await fs.promises.readFile(rt.paths.e2eeFile, 'utf8')) as Record<string, unknown>;
  } catch {
    throw new Error('e2ee.json not found — run tmail_e2ee_generate_local first for this wallet');
  }

  const pubKeyBase64 = typeof profile.pub_key_base64 === 'string' ? profile.pub_key_base64 : '';
  const encPrivKeyBase64 = typeof profile.enc_priv_key_base64 === 'string' ? profile.enc_priv_key_base64 : '';
  const pbkdf2Salt = typeof profile.pbkdf2_salt === 'string' ? profile.pbkdf2_salt : '';
  const pbkdf2Iterations = typeof profile.pbkdf2_iterations === 'number' ? profile.pbkdf2_iterations : 600_000;
  const registered = profile.registered === true;

  if (!pubKeyBase64 || !encPrivKeyBase64 || !pbkdf2Salt) {
    throw new Error('e2ee.json missing pub_key_base64, enc_priv_key_base64, or pbkdf2_salt — run tmail_e2ee_generate_local first');
  }

  if (!registered) {
    throw new Error('E2EE key not registered — run tmail_e2ee_register first for this wallet');
  }

  return {
    pubKeyBase64,
    encPrivKeyBase64,
    pbkdf2Salt,
    pbkdf2Iterations,
    passphrase: resolved.passphrase,
  };
}

interface FetchResult {
  letters: Record<string, unknown>[];
  total: number;
  fetch_error?: string;
  failed_letter_ids?: string[];
}

function emptyFetchErrorMessage(hasLetterIds: boolean, failedLetterIds?: string[]): string {
  let msg = hasLetterIds
    ? 'fetch returned empty results[] for requested letter_ids'
    : 'fetch returned empty results[] for requested thread_id';
  if (failedLetterIds?.length) {
    msg += `: failed_letter_ids=${failedLetterIds.join(', ')}`;
  }
  return msg;
}

async function fetchLettersForDecrypt(rt: Runtime, args: Record<string, unknown>): Promise<FetchResult> {
  let ids: string[];
  try {
    ids = requireStringArray(args, 'letter_ids');
  } catch {
    return { letters: [], total: 0, fetch_error: 'letter_ids is required' };
  }
  if (ids.length > 100) {
    return { letters: [], total: 0, fetch_error: 'letter_ids max 100' };
  }

  const body: Record<string, unknown> = {
    letter_ids: ids,
    as_seceml: true,
  };
  const mailbox = optionalString(args, 'mailbox');
  if (mailbox) body.mailbox = mailbox;
  if (typeof args.mark_read === 'boolean') body.mark_read = args.mark_read;

  try {
    const out = await rt.client.post<Record<string, unknown>>('/api/tbox/letters/fetch', body);
    const letters = extractLetterResults(out);
    return { letters, total: letters.length, failed_letter_ids: extractFailedLetterIds(out) };
  } catch (err) {
    return {
      letters: [],
      total: 0,
      fetch_error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function fetchThreadForDecrypt(rt: Runtime, args: Record<string, unknown>): Promise<FetchResult> {
  const threadId = optionalString(args, 'thread_id');
  if (!threadId) {
    return { letters: [], total: 0, fetch_error: 'thread_id is required' };
  }

  const body: Record<string, unknown> = {
    thread_id: threadId,
    as_seceml: true,
  };
  const mailbox = optionalString(args, 'mailbox');
  if (mailbox) body.mailbox = mailbox;
  if (typeof args.mark_read === 'boolean') body.mark_read = args.mark_read;

  try {
    const out = await rt.client.post<Record<string, unknown>>('/api/tbox/threads/letters', body);
    const letters = extractLetterResults(out);
    return { letters, total: letters.length, failed_letter_ids: extractFailedLetterIds(out) };
  } catch (err) {
    return {
      letters: [],
      total: 0,
      fetch_error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function e2eeDecryptLetters(rt: Runtime, args: Record<string, unknown>) {
  requireGate(rt, 'mail_ops');

  // Validate that at least one of letter_ids or thread_id is provided
  const hasLetterIds = Array.isArray(args.letter_ids) && (args.letter_ids as unknown[]).length > 0;
  const hasThreadId = typeof args.thread_id === 'string' && args.thread_id.trim().length > 0;
  if (!hasLetterIds && !hasThreadId) {
    return textError('either letter_ids (array) or thread_id (string) is required');
  }

  // Load e2ee profile + passphrase
  let e2ee: Awaited<ReturnType<typeof loadE2EEProfile>>;
  try {
    e2ee = await loadE2EEProfile(rt);
  } catch (err) {
    return textError(err instanceof Error ? err.message : String(err));
  }

  const decryptAttachments = optionalBool(args, 'decrypt_attachments');
  const limit = optionalInt(args, 'limit', 0);

  // Fetch letters (by IDs or by thread_id)
  let fetchResult: FetchResult;
  if (hasThreadId) {
    fetchResult = await fetchThreadForDecrypt(rt, args);
  } else {
    fetchResult = await fetchLettersForDecrypt(rt, args);
  }

  if (fetchResult.fetch_error) {
    return textError(fetchResult.fetch_error);
  }

  if (fetchResult.total === 0) {
    if (fetchResult.failed_letter_ids?.length) {
      return textError(emptyFetchErrorMessage(hasLetterIds && !hasThreadId, fetchResult.failed_letter_ids));
    }
    if (hasLetterIds && !hasThreadId) {
      return textError(emptyFetchErrorMessage(true));
    }
    const sanitized = sanitizeForTool('tmail_e2ee_decrypt_letters', {
      decrypted_letters: [],
      total: 0,
      decrypted_count: 0,
      failed_count: 0,
    }) as Record<string, unknown>;
    return textResult(
      withProfileContext(rt.paths.walletSlug, rt.paths.dir, sanitized, rt.cfg.redactPaths),
    );
  }

  // Decrypt each letter
  const decryptedList: DecryptedLetter[] = [];
  let decryptedCount = 0;
  let failedCount = 0;
  const max = limit > 0 ? Math.min(limit, fetchResult.letters.length) : fetchResult.letters.length;

  for (let i = 0; i < max; i++) {
    const letter = fetchResult.letters[i];
    const result = safeDecryptLetter({
      letter,
      myPubKeyBase64: e2ee.pubKeyBase64,
      encPrivKeyBase64: e2ee.encPrivKeyBase64,
      pbkdf2SaltBase64: e2ee.pbkdf2Salt,
      pbkdf2Iterations: e2ee.pbkdf2Iterations,
      passphrase: e2ee.passphrase,
      decryptAttachments,
    });
    if (result.decrypted) {
      decryptedCount++;
    } else {
      failedCount++;
    }
    decryptedList.push(result);
  }

  const summary: Record<string, unknown> = {
    decrypted_letters: decryptedList,
    total: fetchResult.total,
    returned: decryptedList.length,
    decrypted_count: decryptedCount,
    failed_count: failedCount,
  };

  const sanitized = sanitizeForTool('tmail_e2ee_decrypt_letters', summary) as Record<string, unknown>;

  return textResult(
    withProfileContext(rt.paths.walletSlug, rt.paths.dir, sanitized, rt.cfg.redactPaths),
  );
}
