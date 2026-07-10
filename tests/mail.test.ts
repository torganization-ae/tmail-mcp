import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Config } from '../src/config/env.js';
import { pathsForMainDir } from '../src/profile/paths.js';
import type { Runtime } from '../src/tools/runtime.js';

vi.mock('../src/tools/guard.js', () => ({
  requireGate: vi.fn(),
  requireHumanOnly: vi.fn(),
}));

import { fetchThread, sendLetter } from '../src/tools/mail.js';

const slug = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function makeRuntime(postImpl: Runtime['client']['post']): Runtime {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmail-mail-'));
  const mainDir = path.join(dir, '.tmail');
  const paths = pathsForMainDir(dir, mainDir, slug);
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
// fetchThread — client-side pagination
// ============================================================
describe('fetchThread pagination', () => {
  it('returns full thread when offset/limit omitted', async () => {
    const letters = Array.from({ length: 5 }, (_, i) => ({ letter_id: `l-${i}` }));
    const post = vi.fn().mockResolvedValue({
      results: letters,
      letter_ids: letters.map((l) => l.letter_id),
      thread_id: 't-1',
    });
    const rt = makeRuntime(post);

    const out = await fetchThread(rt, { thread_id: 't-1' });
    const body = parseResult(out);
    const results = body.results as Array<Record<string, unknown>>;

    expect(post).toHaveBeenCalledOnce();
    expect(results).toHaveLength(5);
    expect(body.letter_ids).toEqual(['l-0', 'l-1', 'l-2', 'l-3', 'l-4']);
    expect(body.total).toBe(5);
    expect(body.offset).toBe(0);
    expect(body.limit).toBe(0);
    expect(body.has_more).toBe(false);
  });

  it('slices a page from offset with limit', async () => {
    const letters = Array.from({ length: 5 }, (_, i) => ({ letter_id: `l-${i}` }));
    const ids = letters.map((l) => l.letter_id);
    const post = vi.fn().mockResolvedValue({
      results: letters,
      letter_ids: ids,
      thread_id: 't-1',
    });
    const rt = makeRuntime(post);

    const out = await fetchThread(rt, { thread_id: 't-1', offset: 1, limit: 2 });
    const body = parseResult(out);
    const results = body.results as Array<Record<string, unknown>>;

    expect(results).toHaveLength(2);
    expect(results[0].letter_id).toBe('l-1');
    expect(results[1].letter_id).toBe('l-2');
    expect(body.letter_ids).toEqual(['l-1', 'l-2']);
    expect(body.total).toBe(5);
    expect(body.offset).toBe(1);
    expect(body.limit).toBe(2);
    expect(body.has_more).toBe(true);
  });

  it('returns empty page when offset beyond total', async () => {
    const post = vi.fn().mockResolvedValue({
      results: [{ letter_id: 'l-0' }],
      letter_ids: ['l-0'],
      thread_id: 't-1',
    });
    const rt = makeRuntime(post);

    const out = await fetchThread(rt, { thread_id: 't-1', offset: 5 });
    const body = parseResult(out);

    expect(body.results).toEqual([]);
    expect(body.letter_ids).toEqual([]);
    expect(body.total).toBe(1);
    expect(body.offset).toBe(5);
    expect(body.has_more).toBe(false);
  });

  it('returns last page with has_more=false', async () => {
    const letters = Array.from({ length: 5 }, (_, i) => ({ letter_id: `l-${i}` }));
    const post = vi.fn().mockResolvedValue({
      results: letters,
      letter_ids: letters.map((l) => l.letter_id),
      thread_id: 't-1',
    });
    const rt = makeRuntime(post);

    const out = await fetchThread(rt, { thread_id: 't-1', offset: 3, limit: 10 });
    const body = parseResult(out);
    const results = body.results as Array<Record<string, unknown>>;

    expect(results).toHaveLength(2);
    expect(body.letter_ids).toEqual(['l-3', 'l-4']);
    expect(body.total).toBe(5);
    expect(body.has_more).toBe(false);
  });

  it('derives letter_ids from results when API omits them', async () => {
    const post = vi.fn().mockResolvedValue({
      results: [{ letter_id: 'a' }, { letter_id: 'b' }],
      thread_id: 't-1',
    });
    const rt = makeRuntime(post);

    const out = await fetchThread(rt, { thread_id: 't-1', limit: 1 });
    const body = parseResult(out);

    expect(body.letter_ids).toEqual(['a']);
    expect(body.has_more).toBe(true);
  });

  it('clamps negative limit to 0 (returns full thread)', async () => {
    const letters = Array.from({ length: 3 }, (_, i) => ({ letter_id: `l-${i}` }));
    const post = vi.fn().mockResolvedValue({
      results: letters,
      letter_ids: letters.map((l) => l.letter_id),
      thread_id: 't-1',
    });
    const rt = makeRuntime(post);

    const out = await fetchThread(rt, { thread_id: 't-1', limit: -1 });
    const body = parseResult(out);
    const results = body.results as Array<Record<string, unknown>>;

    expect(results).toHaveLength(3);
    expect(body.limit).toBe(0);
    expect(body.has_more).toBe(false);
  });

  it('requires thread_id', async () => {
    const post = vi.fn();
    const rt = makeRuntime(post);

    const out = await fetchThread(rt, {});

    expect(isToolError(out)).toBe(true);
    expect(out.content[0].text).toContain('thread_id is required');
    expect(post).not.toHaveBeenCalled();
  });
});

// ============================================================
// sendLetter — early validation (no network call on failure)
// ============================================================
describe('sendLetter early validation', () => {
  it('rejects missing recipients without eml_base64 (no network call)', async () => {
    const post = vi.fn();
    const rt = makeRuntime(post);

    const out = await sendLetter(rt, { subject: 'hi', body_html: '<p>hi</p>' });

    expect(isToolError(out)).toBe(true);
    expect(out.content[0].text).toContain('to or to_list is required');
    expect(post).not.toHaveBeenCalled();
  });

  it('rejects missing body without eml_base64 (no network call)', async () => {
    const post = vi.fn();
    const rt = makeRuntime(post);

    const out = await sendLetter(rt, { to: 'a@b.com' });

    expect(isToolError(out)).toBe(true);
    expect(out.content[0].text).toContain('body_html or body_plain is required');
    expect(post).not.toHaveBeenCalled();
  });

  it('rejects empty to_list without eml_base64 (no network call)', async () => {
    const post = vi.fn();
    const rt = makeRuntime(post);

    const out = await sendLetter(rt, { to_list: [], body_plain: 'hi' });

    expect(isToolError(out)).toBe(true);
    expect(out.content[0].text).toContain('to or to_list is required');
    expect(post).not.toHaveBeenCalled();
  });

  it('passes eml_base64 without to/body (EML path bypasses field requirements)', async () => {
    const post = vi.fn().mockResolvedValue({ message_id: 'm-1', accepted: true });
    const rt = makeRuntime(post);

    const out = await sendLetter(rt, { eml_base64: 'ZW1s' });
    const body = parseResult(out);

    expect(post).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith('/api/tbox/letters', { eml_base64: 'ZW1s' });
    expect(isToolError(out)).toBe(false);
    expect(body.message_id).toBe('m-1');
  });

  it('omits structured subject/body fields when eml_base64 is set', async () => {
    const post = vi.fn().mockResolvedValue({ message_id: 'm-eml', accepted: true });
    const rt = makeRuntime(post);

    await sendLetter(rt, {
      eml_base64: 'ZW1s',
      subject: 'ignored',
      body_html: '<p>ignored</p>',
      body_plain: 'ignored',
      thread_id: 't-1',
    });

    expect(post).toHaveBeenCalledWith('/api/tbox/letters', {
      eml_base64: 'ZW1s',
      thread_id: 't-1',
    });
  });

  it('sends to_list when provided (array wins over single to)', async () => {
    const post = vi.fn().mockResolvedValue({ message_id: 'm-2', accepted: true });
    const rt = makeRuntime(post);

    const out = await sendLetter(rt, {
      to: 'single@b.com',
      to_list: ['a@b.com', 'c@b.com'],
      subject: 's',
      body_plain: 'b',
    });

    expect(post).toHaveBeenCalledWith('/api/tbox/letters', expect.objectContaining({
      to: ['a@b.com', 'c@b.com'],
    }));
    expect(isToolError(out)).toBe(false);
  });

  it('sends single to as array when to_list omitted', async () => {
    const post = vi.fn().mockResolvedValue({ message_id: 'm-3', accepted: true });
    const rt = makeRuntime(post);

    await sendLetter(rt, { to: 'single@b.com', body_plain: 'b' });

    expect(post).toHaveBeenCalledWith('/api/tbox/letters', expect.objectContaining({
      to: ['single@b.com'],
    }));
  });

  it('rejects invalid attachments_json (no network call)', async () => {
    const post = vi.fn();
    const rt = makeRuntime(post);

    const out = await sendLetter(rt, {
      to: 'a@b.com',
      body_plain: 'b',
      attachments_json: '{not json',
    });

    expect(isToolError(out)).toBe(true);
    expect(out.content[0].text).toContain('attachments_json must be a JSON array');
    expect(post).not.toHaveBeenCalled();
  });
});
