import { describe, expect, it } from 'vitest';
import {
  getMcpHostSpec,
  isManualMcpHostId,
  listMcpHostIds,
  MCP_HOST_ALIASES,
  MCP_HOST_SPECS,
  MCP_OTHER_HOST_ID,
  normalizeMcpHostId,
} from '../src/config/mcp-by-agent.js';

describe('MCP host specs', () => {
  it('lists only verified hosts plus manual other fallback', () => {
    expect(listMcpHostIds()).toContain('vscode');
    expect(listMcpHostIds()).toContain(MCP_OTHER_HOST_ID);
    expect(MCP_HOST_SPECS.goose).toBeUndefined();
    expect(MCP_HOST_SPECS['aider-desk']).toBeUndefined();
    expect(MCP_HOST_SPECS[MCP_OTHER_HOST_ID]?.initWritable).toBe(false);
  });

  it('uses official paths for corrected hosts', () => {
    expect(MCP_HOST_SPECS.cline?.configPath).toBe('.cline_mcp_servers.json');
    expect(MCP_HOST_SPECS.amp?.configPath).toBe('.amp/settings.json');
    expect(MCP_HOST_SPECS.amp?.writer).toBe('json-amp');
    expect(MCP_HOST_SPECS.antigravity?.configPath).toBe('.agents/mcp_config.json');
    expect(MCP_HOST_SPECS['kimi-code-cli']?.configPath).toBe('.kimi-code/mcp.json');
    expect(MCP_HOST_SPECS.qoder?.configPath).toBe('.mcp.json');
    expect(MCP_HOST_SPECS.augment?.configPath).toBe('.augment/settings.json');
    expect(MCP_HOST_SPECS.forgecode?.configPath).toBe('.mcp.json');
    expect(MCP_HOST_SPECS.astrbot?.configPath).toBe('data/mcp_server.json');
    expect(MCP_HOST_SPECS.junie?.configPath).toBe('.junie/mcp/mcp.json');
    expect(MCP_HOST_SPECS['mistral-vibe']?.configPath).toBe('.vibe/config.toml');
  });

  it('keeps verified IDE hosts', () => {
    expect(MCP_HOST_SPECS.cursor?.configPath).toBe('.cursor/mcp.json');
    expect(getMcpHostSpec('github-copilot')?.configPath).toBe('.vscode/mcp.json');
    expect(MCP_HOST_SPECS.codex?.writer).toBe('toml-codex');
    expect(MCP_HOST_SPECS.opencode?.writer).toBe('json-opencode');
    expect(MCP_HOST_SPECS.zed?.writer).toBe('json-zed');
  });

  it('maps legacy aliases to canonical registry ids', () => {
    expect(normalizeMcpHostId('gemini')).toBe('gemini-cli');
    expect(normalizeMcpHostId('github-copilot')).toBe('vscode');
    expect(normalizeMcpHostId('openclaw')).toBe('claude-code');
    expect(MCP_HOST_ALIASES['trae-cn']).toBe('trae');
    expect(normalizeMcpHostId('zenflow')).toBe(MCP_OTHER_HOST_ID);
    expect(isManualMcpHostId('other')).toBe(true);
  });
});
