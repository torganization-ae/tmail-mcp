import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse as parseToml } from 'smol-toml';
import { getMcpHost } from '../src/config/hosts.js';
import { mergeTmailMcpConfig } from '../src/config/mcp-merge.js';

function writerFor(hostId: string) {
  return getMcpHost(hostId)!.writer;
}

describe('mergeTmailMcpConfig multi-format', () => {
  let tmpDir = '';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmail-merge-'));
  });

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('merges vscode servers JSON with stdio type', async () => {
    fs.mkdirSync(path.join(tmpDir, '.vscode'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.vscode', 'mcp.json'), JSON.stringify({ servers: {} }));
    await mergeTmailMcpConfig({
      projectRoot: tmpDir,
      configPath: '.vscode/mcp.json',
      rootKey: 'servers',
      writer: writerFor('vscode'),
      needsStdioType: true,
      apiUrl: 'https://api.example.test',
    });
    const mcp = JSON.parse(fs.readFileSync(path.join(tmpDir, '.vscode', 'mcp.json'), 'utf8')) as {
      servers: { tmail: { type?: string; env: Record<string, string> } };
    };
    expect(mcp.servers.tmail.type).toBe('stdio');
    expect(mcp.servers.tmail.env.TMAIL_API_URL).toBe('https://api.example.test');
  });

  it('merges codex TOML mcp_servers table', async () => {
    fs.mkdirSync(path.join(tmpDir, '.codex'), { recursive: true });
    await mergeTmailMcpConfig({
      projectRoot: tmpDir,
      configPath: '.codex/config.toml',
      rootKey: 'mcp_servers',
      writer: writerFor('codex'),
      apiUrl: 'https://api.example.test',
    });
    const parsed = parseToml(fs.readFileSync(path.join(tmpDir, '.codex', 'config.toml'), 'utf8')) as {
      mcp_servers: { tmail: { command: string; args: string[]; enabled: boolean; env: Record<string, string> } };
    };
    expect(parsed.mcp_servers.tmail.command).toBe('npx');
    expect(parsed.mcp_servers.tmail.args).toEqual(['-y', '@tmail/mcp']);
    expect(parsed.mcp_servers.tmail.enabled).toBe(true);
    expect(parsed.mcp_servers.tmail.env.TMAIL_API_URL).toBe('https://api.example.test');
  });

  it('merges opencode.json native mcp schema', async () => {
    await mergeTmailMcpConfig({
      projectRoot: tmpDir,
      configPath: 'opencode.json',
      rootKey: 'mcp',
      writer: writerFor('opencode'),
      apiUrl: 'https://api.example.test',
    });
    const cfg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'opencode.json'), 'utf8')) as {
      $schema: string;
      mcp: { tmail: { type: string; command: string[]; enabled: boolean; environment: Record<string, string> } };
    };
    expect(cfg.$schema).toContain('opencode.ai');
    expect(cfg.mcp.tmail.type).toBe('local');
    expect(cfg.mcp.tmail.command).toEqual(['npx', '-y', '@tmail/mcp']);
    expect(cfg.mcp.tmail.environment.TMAIL_MAIN_DIR).toBe('.tmail');
  });

  it('merges zed context_servers with source custom', async () => {
    fs.mkdirSync(path.join(tmpDir, '.zed'), { recursive: true });
    await mergeTmailMcpConfig({
      projectRoot: tmpDir,
      configPath: '.zed/settings.json',
      rootKey: 'context_servers',
      writer: writerFor('zed'),
      apiUrl: 'https://api.example.test',
    });
    const cfg = JSON.parse(fs.readFileSync(path.join(tmpDir, '.zed', 'settings.json'), 'utf8')) as {
      context_servers: { tmail: { source: string; command: string; args: string[]; env: Record<string, string> } };
    };
    expect(cfg.context_servers.tmail.source).toBe('custom');
    expect(cfg.context_servers.tmail.args).toEqual(['-y', '@tmail/mcp']);
    expect(cfg.context_servers.tmail.env.TMAIL_BIND_INVITE).toBe('');
  });

  it('merges cline project MCP file', async () => {
    await mergeTmailMcpConfig({
      projectRoot: tmpDir,
      configPath: '.cline_mcp_servers.json',
      rootKey: 'mcpServers',
      writer: writerFor('cline'),
      apiUrl: 'https://api.example.test',
    });
    const cfg = JSON.parse(fs.readFileSync(path.join(tmpDir, '.cline_mcp_servers.json'), 'utf8')) as {
      mcpServers: { tmail: { env: Record<string, string> } };
    };
    expect(cfg.mcpServers.tmail.env.TMAIL_API_URL).toBe('https://api.example.test');
  });

  it('merges amp nested mcpServers', async () => {
    fs.mkdirSync(path.join(tmpDir, '.amp'), { recursive: true });
    await mergeTmailMcpConfig({
      projectRoot: tmpDir,
      configPath: '.amp/settings.json',
      rootKey: 'mcpServers',
      writer: writerFor('amp'),
      apiUrl: 'https://api.example.test',
    });
    const cfg = JSON.parse(fs.readFileSync(path.join(tmpDir, '.amp', 'settings.json'), 'utf8')) as {
      amp: { mcpServers: { tmail: { env: Record<string, string> } } };
    };
    expect(cfg.amp.mcpServers.tmail.env.TMAIL_API_URL).toBe('https://api.example.test');
  });

  it('rejects config path outside project root without --force', async () => {
    await expect(
      mergeTmailMcpConfig({
        projectRoot: tmpDir,
        configPath: '../outside/mcp.json',
        rootKey: 'mcpServers',
        writer: 'json-root',
      }),
    ).rejects.toThrow(/must be inside project root/);
  });
});
