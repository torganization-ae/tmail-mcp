import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../src/config/env.js';
import { generateE2EEKeyPairLocal } from '../src/crypto/e2ee-local.js';
import * as e2eeDecryptCrypto from '../src/crypto/e2ee-decrypt.js';
import { pathsForMainDir } from '../src/profile/paths.js';
import { writePassphrase } from '../src/profile/passphrase.js';
import type { Runtime } from '../src/tools/runtime.js';

vi.mock('../src/tools/guard.js', () => ({
  requireGate: vi.fn(),
}));

import { e2eeDecryptLetters } from '../src/tools/e2ee-decrypt.js';

const slug = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const passphrase = 'sixteen-characters-min';

const stubDecrypted = {
  subject: '',
  body_plain: '',
  body_html: '',
  from: '',
  to: [],
  message_id: '',
  decrypted: false,
  attachments: [] as e2eeDecryptCrypto.DecryptedAttachment[],
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

describe('e2eeDecryptLetters', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses results[] and runs decrypt loop', async () => {
    const post = vi.fn().mockResolvedValue({
      results: [{ letter_id: 'x', seceml_base64: 'invalid' }],
    });
    const rt = await setupRuntime(post);
    const spy = vi.spyOn(e2eeDecryptCrypto, 'safeDecryptLetter').mockReturnValue(stubDecrypted);

    const out = await e2eeDecryptLetters(rt, { letter_ids: ['x'] });

    expect(post).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledTimes(1);
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
    vi.spyOn(e2eeDecryptCrypto, 'safeDecryptLetter').mockReturnValue(stubDecrypted);

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
});
