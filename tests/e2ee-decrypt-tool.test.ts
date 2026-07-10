import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../src/config/env.js';
import { generateE2EEKeyPairLocal } from '../src/crypto/e2ee-local.js';
import * as e2eeDecryptCrypto from '../src/crypto/e2ee-decrypt.js';
import { extractLetterResultsWithIds } from '../src/client/letter-results.js';
import { pathsForMainDir } from '../src/profile/paths.js';
import { writePassphrase } from '../src/profile/passphrase.js';
import type { Runtime } from '../src/tools/runtime.js';

vi.mock('../src/tools/guard.js', () => ({
  requireGate: vi.fn(),
}));

import { e2eeDecryptLetters } from '../src/tools/e2ee-decrypt.js';

const slug = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const passphrase = 'sixteen-characters-min';

const stubDecrypted: e2eeDecryptCrypto.DecryptedLetter = {
  letter_id: '',
  subject: '',
  body_plain: '',
  body_html: '',
  from: '',
  to: [],
  message_id: '',
  thread_id: undefined,
  folder: undefined,
  in_reply_to: '',
  references: [],
  timestamp: 0,
  sender: { display_name: '', avatar_url: '', avatar_base64: '', avatar_color: '', emoji_avatar: '', emoji_status: '' },
  recipients: {},
  decrypted: false,
  attachments: [],
};

const stubDecryptedOk: e2eeDecryptCrypto.DecryptedLetter = {
  ...stubDecrypted,
  decrypted: true,
  letter_id: 'is-abc123',
  subject: 'Test Subject',
};

async function setupRuntime(postImpl: Runtime['client']['post']): Promise<Runtime> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmail-e2ee-decrypt-'));
  const mainDir = path.join(dir, '.tmail');
  const paths = pathsForMainDir(dir, mainDir, slug);
  fs.mkdirSync(paths.dir, { recursive: true, mode: 0o700 });

  const keys = await generateE2EEKeyPairLocal(passphrase);
  fs.writeFileSync(
    paths.e2eeFile,
    JSON.stringify({ ...keys, registered: true }),
    { mode: 0o644 },
  );
  await writePassphrase(paths, passphrase, true);

  const cfg: Config = {
    projectRoot: dir,
    apiUrl: 'http://localhost',
    mainDirRel: '.tmail',
    mainDir,
    bindInvite: '',
    e2eePassphrase: '',
    mcpToken: '',
    redactPaths: false,
    skipGitignoreCheck: true,
  };

  return {
    cfg,
    paths,
    client: { post: postImpl } as unknown as Runtime['client'],
  };
}

function parseResult(out: { content: [{ type: 'text'; text: string }] }): Record<string, unknown> {
  return JSON.parse(out.content[0].text) as Record<string, unknown>;
}

function isToolError(out: { content: [{ type: 'text'; text: string }] }): boolean {
  return 'isError' in out && out.isError === true;
}

// ============================================================
// Unit tests for extractLetterResultsWithIds
// ============================================================
describe('extractLetterResultsWithIds', () => {
  it('preserves letter_id from results[].letter_id', () => {
    const { results, letter_ids } = extractLetterResultsWithIds({
      results: [{ letter_id: 'is-aaa' }, { letter_id: 'is-bbb' }],
    });
    expect(results).toHaveLength(2);
    expect(letter_ids).toEqual(['is-aaa', 'is-bbb']);
  });

  it('falls back to letters field', () => {
    const { results, letter_ids } = extractLetterResultsWithIds({
      letters: [{ letter_id: 'is-ccc' }],
    });
    expect(results).toHaveLength(1);
    expect(letter_ids).toEqual(['is-ccc']);
  });

  it('returns empty when fields are absent', () => {
    const { results, letter_ids } = extractLetterResultsWithIds({});
    expect(results).toEqual([]);
    expect(letter_ids).toEqual([]);
  });
});

// ============================================================
// Unit tests for safeDecryptLetter (uses deriveLetterAesKey + decryptLetterFields)
// ============================================================
describe('safeDecryptLetter', () => {
  it('returns fallback with "not found in toList" when unwrapLetterKey throws', () => {
    // Verify that FALLBACK_LETTER has all required fields
    expect(e2eeDecryptCrypto.FALLBACK_LETTER.decrypted).toBe(false);
    expect(e2eeDecryptCrypto.FALLBACK_LETTER.sender).toBeDefined();
    expect(e2eeDecryptCrypto.FALLBACK_LETTER.sender.display_name).toBe('');
    expect(e2eeDecryptCrypto.FALLBACK_LETTER.recipients).toEqual({});
    expect(e2eeDecryptCrypto.FALLBACK_LETTER.in_reply_to).toBe('');
    expect(e2eeDecryptCrypto.FALLBACK_LETTER.references).toEqual([]);
    expect(e2eeDecryptCrypto.FALLBACK_LETTER.timestamp).toBe(0);
    expect(e2eeDecryptCrypto.FALLBACK_LETTER.letter_id).toBe('');
    expect(e2eeDecryptCrypto.FALLBACK_LETTER.attachments).toEqual([]);
  });

  it('returns fallback on any failure (invalid letter)', () => {
    const result = e2eeDecryptCrypto.safeDecryptLetter({
      letter: {},
      myPubKeyBase64: 'pub_xxx',
      encPrivKeyBase64: 'enc_priv_xxx',
      pbkdf2SaltBase64: 'salt_xxx',
      pbkdf2Iterations: 600_000,
      passphrase: 'test',
    });

    expect(result.decrypted).toBe(false);
    expect(result.decrypt_error).toBeTruthy();
    expect(result.sender).toBeDefined();
    expect(result.letter_id).toBe('');
    expect(result.subject).toBe('');
    expect(result.body_plain).toBe('');
    expect(result.body_html).toBe('');
    expect(result.from).toBe('');
    expect(result.to).toEqual([]);
    expect(result.in_reply_to).toBe('');
    expect(result.references).toEqual([]);
    expect(result.timestamp).toBe(0);
    expect(result.attachments).toEqual([]);
  });
});

// ============================================================
// Main integration tests for e2eeDecryptLetters tool handler
// ============================================================
describe('e2eeDecryptLetters', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses results[] and runs decrypt loop (two-phase)', async () => {
    const post = vi.fn().mockResolvedValue({
      results: [{ letter_id: 'x', seceml_base64: 'invalid' }],
    });

    // Mock the two-phase functions
    const deriveSpy = vi.spyOn(e2eeDecryptCrypto, 'deriveLetterAesKey')
      .mockReturnValue({
        aesKey: Buffer.alloc(32, 0x01),
        ed: { toList: {}, data: {} },
        messageId: 'test-id',
      });
    const decryptFieldsSpy = vi.spyOn(e2eeDecryptCrypto, 'decryptLetterFields')
      .mockReturnValue(stubDecryptedOk);

    const rt = await setupRuntime(post);

    const out = await e2eeDecryptLetters(rt, { letter_ids: ['x'] });

    expect(post).toHaveBeenCalledOnce();
    expect(deriveSpy).toHaveBeenCalledTimes(1);
    expect(decryptFieldsSpy).toHaveBeenCalledTimes(1);
    expect(isToolError(out)).toBe(false);
    const body = parseResult(out);
    expect(body.total).toBe(1);
    expect(body.decrypted_letters).toHaveLength(1);
  });

  it('falls back to legacy letters field', async () => {
    const post = vi.fn().mockResolvedValue({
      letters: [{ letter_id: 'y', seceml_base64: 'invalid' }],
    });
    const rt = await setupRuntime(post);

    vi.spyOn(e2eeDecryptCrypto, 'deriveLetterAesKey')
      .mockReturnValue({
        aesKey: Buffer.alloc(32, 0x01),
        ed: { toList: {}, data: {} },
        messageId: 'test-id',
      });
    vi.spyOn(e2eeDecryptCrypto, 'decryptLetterFields')
      .mockReturnValue(stubDecryptedOk);

    const out = await e2eeDecryptLetters(rt, { letter_ids: ['y'] });
    const body = parseResult(out);
    expect(body.total).toBe(1);
  });

  it('returns error when letter_ids fetch yields empty results', async () => {
    const post = vi.fn().mockResolvedValue({ results: [] });
    const rt = await setupRuntime(post);

    const out = await e2eeDecryptLetters(rt, { letter_ids: ['id1'] });

    expect(isToolError(out)).toBe(true);
    expect(out.content[0].text).toContain('empty results[]');
    expect(out.content[0].text).toContain('letter_ids');
  });

  it('allows empty thread success', async () => {
    const post = vi.fn().mockResolvedValue({ results: [] });
    const rt = await setupRuntime(post);

    const out = await e2eeDecryptLetters(rt, { thread_id: 'thread-1' });

    expect(isToolError(out)).toBe(false);
    const body = parseResult(out);
    expect(body.total).toBe(0);
    expect(body.decrypted_letters).toEqual([]);
  });

  it('returns error when failed_letter_ids present with empty results', async () => {
    const post = vi.fn().mockResolvedValue({
      results: [],
      failed_letter_ids: ['missing-id'],
    });
    const rt = await setupRuntime(post);

    const out = await e2eeDecryptLetters(rt, { thread_id: 'thread-1' });

    expect(isToolError(out)).toBe(true);
    expect(out.content[0].text).toContain('failed_letter_ids=missing-id');
  });

  it('handles decryption error in the two-phase loop', async () => {
    const post = vi.fn().mockResolvedValue({
      results: [{ letter_id: 'x', seceml_base64: 'invalid' }],
    });
    const rt = await setupRuntime(post);

    vi.spyOn(e2eeDecryptCrypto, 'deriveLetterAesKey')
      .mockImplementation(() => { throw new Error('bad data'); });

    const out = await e2eeDecryptLetters(rt, { letter_ids: ['x'] });

    expect(isToolError(out)).toBe(false);
    const body = parseResult(out);
    expect(body.decrypted_count).toBe(0);
    expect(body.failed_count).toBe(1);
  });

  it('fetches and decrypts attachment content when decrypt_attachments=true', async () => {
    const mockAesKey = Buffer.alloc(32, 0x02);

    // First call: fetch letters
    const postFn = vi.fn()
      .mockResolvedValueOnce({
        results: [{ letter_id: 'is-xyz', seceml_base64: 'invalid' }],
      })
      // Second call: fetch attachments
      .mockResolvedValueOnce({
        results: [{ file_id: 'file-1', encrypted_content_base64: 'CTR1AAAA' }],
      });

    const rt = await setupRuntime(postFn);

    vi.spyOn(e2eeDecryptCrypto, 'deriveLetterAesKey')
      .mockReturnValue({
        aesKey: mockAesKey,
        ed: { toList: {}, data: {} },
        messageId: 'test-id',
      });

    vi.spyOn(e2eeDecryptCrypto, 'decryptLetterFields')
      .mockReturnValue({
        ...stubDecryptedOk,
        letter_id: 'is-xyz',
        attachments: [{ file_id: 'file-1', content_base64: '', decrypt_ok: false }],
      });

    const decryptAttSpy = vi.spyOn(e2eeDecryptCrypto, 'decryptAttachmentCore')
      .mockReturnValue(Buffer.from('hello'));

    const out = await e2eeDecryptLetters(rt, { letter_ids: ['is-xyz'], decrypt_attachments: true });

    expect(isToolError(out)).toBe(false);
    expect(postFn).toHaveBeenCalledTimes(2);
    expect(decryptAttSpy).toHaveBeenCalledWith('CTR1AAAA', mockAesKey);
    const body = parseResult(out);
    const letters = body.decrypted_letters as Array<Record<string, unknown>>;
    const atts = letters[0].attachments as Array<Record<string, unknown>>;
    expect(atts[0].content_base64).toBe('aGVsbG8=');
    expect(atts[0].decrypt_ok).toBe(true);
  });

  it('handles attachment API error gracefully (preserves decrypted fields)', async () => {
    const postFn = vi.fn()
      .mockResolvedValueOnce({
        results: [{ letter_id: 'is-xyz', seceml_base64: 'invalid' }],
      })
      // Attachment API fails
      .mockRejectedValueOnce(new Error('network error'));

    const rt = await setupRuntime(postFn);

    vi.spyOn(e2eeDecryptCrypto, 'deriveLetterAesKey')
      .mockReturnValue({
        aesKey: Buffer.alloc(32, 0x03),
        ed: { toList: {}, data: {} },
        messageId: 'test-id',
      });

    vi.spyOn(e2eeDecryptCrypto, 'decryptLetterFields')
      .mockReturnValue({
        ...stubDecryptedOk,
        letter_id: 'is-xyz',
        attachments: [{ file_id: 'file-1', content_base64: '', decrypt_ok: false }],
      });

    const out = await e2eeDecryptLetters(rt, { letter_ids: ['is-xyz'], decrypt_attachments: true });

    expect(isToolError(out)).toBe(false);
    const body = parseResult(out);
    expect(body.decrypted_count).toBe(1); // letter decrypted OK
    const letters = body.decrypted_letters as Array<Record<string, unknown>>;
    const atts = letters[0].attachments as Array<Record<string, unknown>>;
    expect(atts[0].decrypt_error).toContain('attachment fetch failed: network error');
  });
});
