import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultDetectCtx,
  detectExistingProjectMcpConfigs,
  detectInstalledMcpHosts,
  readHostLock,
  resolveMcpInitTargets,
  writeHostLock,
} from '../src/config/hosts.js';
import { resolveStorageLayout } from '../src/config/env.js';

describe('MCP host detection', () => {
  let tmpDir = '';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmail-hosts-'));
  });

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects existing project MCP configs', () => {
    fs.mkdirSync(path.join(tmpDir, '.vscode'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.vscode', 'mcp.json'), '{}');
    const found = detectExistingProjectMcpConfigs(tmpDir);
    expect(found.map((t) => t.id)).toEqual(['vscode']);
  });

  it('does not infer hosts from marker directories alone', () => {
    fs.mkdirSync(path.join(tmpDir, '.cursor'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.vscode'), { recursive: true });
    const targets = resolveMcpInitTargets(tmpDir);
    expect(targets).toEqual([]);
  });

  it('resolveMcpInitTargets prefers existing configs', () => {
    fs.mkdirSync(path.join(tmpDir, '.cursor'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.vscode'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.vscode', 'mcp.json'), '{}');
    const targets = resolveMcpInitTargets(tmpDir);
    expect(targets.map((t) => t.id)).toEqual(['vscode']);
  });

  it('resolveMcpInitTargets uses host-lock when no mcp.json exists', () => {
    writeHostLock(tmpDir, ['cursor']);
    const targets = resolveMcpInitTargets(tmpDir);
    expect(targets.map((t) => t.id)).toEqual(['cursor']);
    expect(readHostLock(tmpDir)?.hosts).toEqual(['cursor']);
  });

  it('writeHostLock skips manual-only host ids', () => {
    writeHostLock(tmpDir, ['other']);
    expect(readHostLock(tmpDir)).toBeUndefined();
    writeHostLock(tmpDir, ['cursor', 'other']);
    expect(readHostLock(tmpDir)?.hosts).toEqual(['cursor']);
  });

  it('writeHostLock clears stale manual-only lock file', () => {
    const lockPath = path.join(tmpDir, '.tmail', 'host-lock.json');
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, `${JSON.stringify({ hosts: ['other'] }, null, 2)}\n`);
    expect(readHostLock(tmpDir)?.hosts).toEqual(['other']);
    writeHostLock(tmpDir, ['other']);
    expect(readHostLock(tmpDir)).toBeUndefined();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('detectInstalledMcpHosts checks registry detectInstalled', () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tmail-home-'));
    fs.mkdirSync(path.join(fakeHome, '.cursor'), { recursive: true });
    const ctx = defaultDetectCtx();
    ctx.home = fakeHome;
    ctx.configHome = path.join(fakeHome, '.config');
    const found = detectInstalledMcpHosts(ctx);
    expect(found.map((h) => h.id)).toContain('cursor');
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });
});

describe('resolveStorageLayout', () => {
  it('joins relative .tmail to project root', () => {
    const layout = resolveStorageLayout('.tmail', '/home/proj');
    expect(layout.projectRoot).toBe('/home/proj');
    expect(layout.mainDir).toBe(path.join('/home/proj', '.tmail'));
    expect(layout.mainDirRel).toBe('.tmail');
  });

  it('uses absolute TMAIL_MAIN_DIR as storage root', () => {
    const layout = resolveStorageLayout('/var/agent/.tmail');
    expect(layout.mainDir).toBe('/var/agent/.tmail');
    expect(layout.projectRoot).toBe('/var/agent');
    expect(layout.mainDirRel).toBe('.tmail');
  });
});

describe('runInit MCP host selection', () => {
  let tmpDir = '';
  let prevCwd = '';

  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmail-init-'));
    prevCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(prevCwd);
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('merges into existing .vscode/mcp.json with servers root key and stdio type', async () => {
    const prevRoot = process.env.TMAIL_PROJECT_ROOT;
    delete process.env.TMAIL_PROJECT_ROOT;
    fs.mkdirSync(path.join(tmpDir, '.vscode'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.vscode', 'mcp.json'), JSON.stringify({ servers: {} }));
    try {
      const { runInit } = await import('../src/tools/local.js');
      await runInit(['https://api.example.test'], {});
      const mcp = JSON.parse(fs.readFileSync(path.join(tmpDir, '.vscode', 'mcp.json'), 'utf8')) as {
        servers: { tmail: { type?: string; env: Record<string, string> } };
      };
      expect(mcp.servers.tmail.env.TMAIL_API_URL).toBe('https://api.example.test');
      expect(mcp.servers.tmail.env.TMAIL_PROJECT_ROOT).toBeUndefined();
      expect(mcp.servers.tmail.env.TMAIL_MAIN_DIR).toBe('.tmail');
      expect(mcp.servers.tmail.type).toBe('stdio');
      expect(fs.existsSync(path.join(tmpDir, '.cursor', 'mcp.json'))).toBe(false);
    } finally {
      if (prevRoot === undefined) delete process.env.TMAIL_PROJECT_ROOT;
      else process.env.TMAIL_PROJECT_ROOT = prevRoot;
    }
  });

  it('writes selected host via --host without interactive prompt', async () => {
    fs.mkdirSync(path.join(tmpDir, '.vscode'), { recursive: true });
    const { runInit } = await import('../src/tools/local.js');
    await runInit(['https://api.example.test'], { host: 'cursor' });
    expect(fs.existsSync(path.join(tmpDir, '.cursor', 'mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.vscode', 'mcp.json'))).toBe(false);
    expect(readHostLock(tmpDir)).toBeUndefined();
  });

  it('uses host-lock on repeat init with -y', async () => {
    writeHostLock(tmpDir, ['cursor']);
    const { runInit } = await import('../src/tools/local.js');
    await runInit(['https://api.example.test'], { yes: true });
    expect(fs.existsSync(path.join(tmpDir, '.cursor', 'mcp.json'))).toBe(true);
  });

  it('skips merge for --host other', async () => {
    const { runInit } = await import('../src/tools/local.js');
    await runInit(['https://api.example.test'], { host: 'other' });
    expect(fs.existsSync(path.join(tmpDir, '.cursor', 'mcp.json'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, '.vscode', 'mcp.json'))).toBe(false);
  });

  it('skips merge for --host other with -y', async () => {
    const { runInit } = await import('../src/tools/local.js');
    await runInit(['https://api.example.test'], { host: 'other', yes: true });
    expect(fs.existsSync(path.join(tmpDir, '.cursor', 'mcp.json'))).toBe(false);
  });

  it('skips merge when host-lock contains only other and -y', async () => {
    const lockPath = path.join(tmpDir, '.tmail', 'host-lock.json');
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, `${JSON.stringify({ hosts: ['other'] }, null, 2)}\n`);
    const { runInit } = await import('../src/tools/local.js');
    await runInit(['https://api.example.test'], { yes: true });
    expect(fs.existsSync(path.join(tmpDir, '.cursor', 'mcp.json'))).toBe(false);
  });

  it('configure --host other prints manual setup hint', async () => {
    const stderr: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    const { runConfigure } = await import('../src/tools/local.js');
    await runConfigure([], { host: 'other' });
    expect(stderr.join('')).toContain('manual MCP setup');
  });

  it('skips mcp config with --skip-mcp-config', async () => {
    fs.mkdirSync(path.join(tmpDir, '.cursor'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.cursor', 'mcp.json'), '{}');
    const { runInit } = await import('../src/tools/local.js');
    await runInit(['https://api.example.test'], { 'skip-mcp-config': true });
    const raw = fs.readFileSync(path.join(tmpDir, '.cursor', 'mcp.json'), 'utf8');
    expect(raw).toBe('{}');
  });
});
