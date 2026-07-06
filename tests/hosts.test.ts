import { describe, expect, it } from 'vitest';
import { MCP_OTHER_HOST_ID, normalizeMcpHostId } from '../src/config/mcp-by-agent.js';
import {
  getMcpHost,
  listInitWritableHosts,
  MCP_HOSTS,
} from '../src/config/hosts.js';

describe('MCP host registry', () => {
  it('lists hosts with detect hooks', () => {
    expect(MCP_HOSTS.length).toBeGreaterThan(10);
    expect(MCP_HOSTS.every((h) => h.label && h.rootKey && h.format)).toBe(true);
    expect(MCP_HOSTS.every((h) => (h.initWritable ? h.configPath : true))).toBe(true);
    expect(MCP_HOSTS.every((h) => typeof h.detectInstalled === 'function')).toBe(true);
  });

  it('documents verified hosts and a manual other fallback', () => {
    expect(getMcpHost('cursor')).toBeDefined();
    expect(getMcpHost('goose')).toBeUndefined();
    expect(getMcpHost(MCP_OTHER_HOST_ID)).toMatchObject({
      initWritable: false,
      label: 'Other (manual setup)',
    });
  });

  it('has no duplicate project config paths among init-writable hosts', () => {
    const paths = listInitWritableHosts().map((h) => h.configPath);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('documents product-specific paths and writers', () => {
    expect(getMcpHost('cursor')).toMatchObject({
      configPath: '.cursor/mcp.json',
      rootKey: 'mcpServers',
      writer: 'json-root',
      initWritable: true,
    });
    expect(getMcpHost('codex')).toMatchObject({
      format: 'toml',
      writer: 'toml-codex',
      initWritable: true,
    });
    expect(getMcpHost('opencode')).toMatchObject({
      writer: 'json-opencode',
      initWritable: true,
    });
    expect(getMcpHost('zed')).toMatchObject({
      writer: 'json-zed',
      initWritable: true,
    });
  });

  it('normalizes legacy host ids', () => {
    expect(normalizeMcpHostId('gemini')).toBe('gemini-cli');
    expect(normalizeMcpHostId('github-copilot')).toBe('vscode');
    expect(normalizeMcpHostId('trae-cn')).toBe('trae');
  });

  it('dedupes init-writable hosts by shared config path', () => {
    const writable = MCP_HOSTS.filter((h) => h.initWritable);
    const paths = listInitWritableHosts().map((h) => h.configPath);
    expect(new Set(paths).size).toBe(paths.length);
    expect(writable.length).toBeGreaterThan(listInitWritableHosts().length);
  });
});
