import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Config } from '../src/config/env.js';
import { checkPaths, checkSelector, formatGateActionError } from '../src/gate/gate.js';
import { pathsForMainDir, pathsForSlug } from '../src/profile/paths.js';

function testGateCfg(dir: string, apiUrl: string, bindInvite: string): Config {
  return {
    projectRoot: dir,
    apiUrl,
    bindInvite,
    mainDirRel: '.tmail',
    mainDir: path.join(dir, '.tmail'),
    e2eePassphrase: '',
    mcpToken: '',
    redactPaths: true,
    skipGitignoreCheck: false,
  };
}

function mkdirAll(p: string): void {
  fs.mkdirSync(p, { recursive: true, mode: 0o755 });
}

function writeFile(p: string, content: string): void {
  mkdirAll(path.dirname(p));
  fs.writeFileSync(p, content, { mode: 0o644 });
}

describe('gate', () => {
  it('WAIT_ENV_BIND when API URL empty (first install)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmail-gate-'));
    const cfg = testGateCfg(dir, '', '');
    const res = await checkSelector(cfg, {});
    expect(res.status).toBe('WAIT_ENV_BIND');
    expect(res.messages.some((m) => m.includes('TMAIL_API_URL'))).toBe(true);
  });

  it('WAIT_ENV_BIND without bind invite', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmail-gate-'));
    const cfg = testGateCfg(dir, 'http://localhost', '');
    const res = await checkSelector(cfg, {});
    expect(res.status).toBe('WAIT_ENV_BIND');
  });

  it('SETUP_BIND when bind invite set', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmail-gate-'));
    const cfg = testGateCfg(dir, 'http://localhost', 'tmail_i_test');
    const res = await checkSelector(cfg, {});
    expect(res.status).toBe('SETUP_BIND');
    expect(res.messages.some((m) => m.includes('tmail_generate_payload'))).toBe(true);
  });

  it('WAIT_ENV_BIND when URL empty but bind invite set', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmail-gate-'));
    const cfg = testGateCfg(dir, '', 'tmail_i_test');
    const res = await checkSelector(cfg, {});
    expect(res.status).toBe('WAIT_ENV_BIND');
    expect(res.messages.some((m) => m.includes('TMAIL_API_URL'))).toBe(true);
  });

  it('legacy _pending warns but allows SETUP_BIND', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmail-gate-'));
    writeFile(
      path.join(dir, '.tmail', '_pending', 'profile', 'session.json'),
      '{"api_key":"tmail_s_x.y"}',
    );
    const cfg = testGateCfg(dir, 'http://localhost', 'tmail_i_test');
    const res = await checkSelector(cfg, {});
    expect(res.status).toBe('SETUP_BIND');
    expect(res.warnings?.some((w) => w.includes('_pending'))).toBe(true);
  });

  it('SETUP_FINISH when session exists but e2ee missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmail-gate-'));
    const slug = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const profileDir = path.join(dir, '.tmail', slug, 'profile');
    mkdirAll(profileDir);
    writeFile(path.join(dir, '.gitignore'), '.tmail/\n');
    writeFile(path.join(profileDir, 'session.json'), '{"api_key":"tmail_s_x.y","sub_address":"0:abc"}');
    writeFile(
      path.join(profileDir, 'meta.json'),
      '{"wallet_address":"0:abc","sub_address":"0:abc","default_mailbox":"x@mail.ton"}',
    );
    const cfg = testGateCfg(dir, 'http://localhost', '');
    const res = checkPaths(cfg, pathsForSlug(cfg, slug));
    expect(res.status).toBe('SETUP_FINISH');
  });

  it('READY when all §10 checks pass', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmail-gate-'));
    const slug = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const profileDir = path.join(dir, '.tmail', slug, 'profile');
    mkdirAll(profileDir);
    writeFile(path.join(dir, '.gitignore'), '.tmail/\n');
    writeFile(path.join(profileDir, 'session.json'), '{"api_key":"tmail_s_x.y","sub_address":"0:abc"}');
    writeFile(
      path.join(profileDir, 'meta.json'),
      '{"wallet_address":"0:abc","sub_address":"0:abc","default_mailbox":"x@mail.ton"}',
    );
    writeFile(path.join(profileDir, 'e2ee.json'), '{"registered":true}');
    const cfg = testGateCfg(dir, 'http://localhost', '');
    const res = checkPaths(cfg, pathsForSlug(cfg, slug), 1);
    expect(res.status).toBe('READY');
    expect(res.messages.some((m) => m.includes('Profile:'))).toBe(false);
  });

  it('READY without gitignore but warns', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmail-gate-'));
    const slug = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const profileDir = path.join(dir, '.tmail', slug, 'profile');
    mkdirAll(profileDir);
    writeFile(path.join(profileDir, 'session.json'), '{"api_key":"tmail_s_x.y","sub_address":"0:abc"}');
    writeFile(
      path.join(profileDir, 'meta.json'),
      '{"wallet_address":"0:abc","sub_address":"0:abc","default_mailbox":"x@mail.ton"}',
    );
    writeFile(path.join(profileDir, 'e2ee.json'), '{"registered":true}');
    const cfg = testGateCfg(dir, 'http://localhost', '');
    const res = checkPaths(cfg, pathsForSlug(cfg, slug), 1);
    expect(res.status).toBe('READY');
    expect(res.warnings?.some((w) => w.includes('gitignore'))).toBe(true);
  });

  it('SETUP_FINISH for corrupt session (api_key without meta)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmail-gate-'));
    const slug = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const profileDir = path.join(dir, '.tmail', slug, 'profile');
    mkdirAll(profileDir);
    writeFile(path.join(profileDir, 'session.json'), '{"api_key":"tmail_s_x.y","sub_address":"0:abc"}');
    const cfg = testGateCfg(dir, 'http://localhost', 'tmail_i_test');
    const res = checkPaths(cfg, pathsForSlug(cfg, slug), 1);
    expect(res.status).toBe('SETUP_FINISH');
    expect(res.messages.some((m) => m.includes('Partial profile'))).toBe(true);
    expect(res.messages.some((m) => /\/(?:var|home|tmp|etc)\//.test(m))).toBe(false);
  });

  it('READY skips gitignore warn when mainDir outside project root', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmail-gate-'));
    const storageRoot = path.join(dir, 'external-storage', '.tmail');
    const slug = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const profileDir = path.join(storageRoot, slug, 'profile');
    mkdirAll(profileDir);
    writeFile(path.join(profileDir, 'session.json'), '{"api_key":"tmail_s_x.y","sub_address":"0:abc"}');
    writeFile(
      path.join(profileDir, 'meta.json'),
      '{"wallet_address":"0:abc","sub_address":"0:abc","default_mailbox":"x@mail.ton"}',
    );
    writeFile(path.join(profileDir, 'e2ee.json'), '{"registered":true}');
    const cfg: Config = {
      projectRoot: path.join(dir, 'workspace'),
      apiUrl: 'http://localhost',
      bindInvite: '',
      mainDirRel: '.tmail',
      mainDir: storageRoot,
      e2eePassphrase: '',
      mcpToken: '',
      redactPaths: true,
      skipGitignoreCheck: false,
    };
    fs.mkdirSync(cfg.projectRoot, { recursive: true });
    const res = checkPaths(cfg, pathsForMainDir(cfg.projectRoot, storageRoot, slug), 1);
    expect(res.status).toBe('READY');
    expect(res.warnings?.some((w) => w.includes('gitignore'))).toBeFalsy();
  });

  it('soft SETUP_FINISH for multi-wallet without slug', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmail-gate-'));
    const slugA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const slugB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    for (const slug of [slugA, slugB]) {
      const profileDir = path.join(dir, '.tmail', slug, 'profile');
      writeFile(path.join(profileDir, 'session.json'), `{"api_key":"tmail_s_x.y","sub_address":"0:${slug.slice(0, 3)}"}`);
    }
    const cfg = testGateCfg(dir, 'http://localhost', '');
    const res = await checkSelector(cfg, {});
    expect(res.status).toBe('SETUP_FINISH');
    expect(res.messages.some((m) => m.includes('Multiple bound wallets'))).toBe(true);
    expect(res.bound_count).toBe(2);
  });

  it('formatGateActionError returns actionable hints without gate ritual', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmail-gate-'));
    const cfg = testGateCfg(dir, '', '');
    const paths = pathsForMainDir(cfg.projectRoot, path.join(dir, '.tmail'), '');
    const res = checkPaths(cfg, paths, 0);
    expect(res.status).toBe('WAIT_ENV_BIND');
    const err = formatGateActionError(res);
    expect(err).toContain('TMAIL_API_URL');
    expect(err).not.toContain('tmail_gate_check');
  });
});
