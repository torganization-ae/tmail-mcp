import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectExistingProjectMcpConfigs,
  inferMcpHostFromProjectMarkers,
  resolveMcpInitTargets,
} from '../src/config/hosts.js';
import { resolveStorageLayout } from '../src/config/env.js';

describe('MCP host auto-detect', () => {
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

  it('infers all hosts from multiple project marker directories', () => {
    fs.mkdirSync(path.join(tmpDir, '.cursor'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.vscode'), { recursive: true });
    const targets = resolveMcpInitTargets(tmpDir);
    expect(targets.map((t) => t.id).sort()).toEqual(['cursor', 'vscode']);
  });

  it('resolveMcpInitTargets prefers existing configs over inference', () => {
    fs.mkdirSync(path.join(tmpDir, '.cursor'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.vscode'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.vscode', 'mcp.json'), '{}');
    const targets = resolveMcpInitTargets(tmpDir);
    expect(targets.map((t) => t.id)).toEqual(['vscode']);
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

describe('runInit MCP auto-detect', () => {
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

  it('merges into existing .vscode/mcp.json with servers root key', async () => {
    const prevRoot = process.env.TMAIL_PROJECT_ROOT;
    delete process.env.TMAIL_PROJECT_ROOT;
    fs.mkdirSync(path.join(tmpDir, '.vscode'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.vscode', 'mcp.json'), JSON.stringify({ servers: {} }));
    try {
      const { runInit } = await import('../src/tools/local.js');
      await runInit(['https://api.example.test'], {});
      const mcp = JSON.parse(fs.readFileSync(path.join(tmpDir, '.vscode', 'mcp.json'), 'utf8')) as {
        servers: { tmail: { env: Record<string, string> } };
      };
      expect(mcp.servers.tmail.env.TMAIL_API_URL).toBe('https://api.example.test');
      expect(mcp.servers.tmail.env.TMAIL_PROJECT_ROOT).toBeUndefined();
      expect(mcp.servers.tmail.env.TMAIL_MAIN_DIR).toBe('.tmail');
      expect(fs.existsSync(path.join(tmpDir, '.cursor', 'mcp.json'))).toBe(false);
    } finally {
      if (prevRoot === undefined) delete process.env.TMAIL_PROJECT_ROOT;
      else process.env.TMAIL_PROJECT_ROOT = prevRoot;
    }
  });

  it('infers .vscode/mcp.json from .vscode/ marker when config missing', async () => {
    fs.mkdirSync(path.join(tmpDir, '.vscode'), { recursive: true });
    const { runInit } = await import('../src/tools/local.js');
    await runInit(['https://api.example.test'], {});
    expect(fs.existsSync(path.join(tmpDir, '.vscode', 'mcp.json'))).toBe(true);
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
