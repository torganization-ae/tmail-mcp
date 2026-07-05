import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toolInputSchemas } from '../src/schemas/tools.zod.js';

const coverage = JSON.parse(
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../subagent-coverage.json'), 'utf8'),
) as { tools: Array<{ mcp_tool: string; path?: string; disposition?: string }> };

describe('subagent-coverage.json', () => {
  it('catalog lists blocked server-side E2EE generate', () => {
    const entry = coverage.tools.find((t) => t.mcp_tool === 'tmail_e2ee_generate');
    expect(entry?.disposition).toBe('mcp_tool_blocked');
    expect(entry?.path).toBe('/api/tbox/keys/generate');
  });

  it('local keygen maps to PUT /api/tbox/keys', () => {
    const entry = coverage.tools.find((t) => t.mcp_tool === 'tmail_e2ee_generate_local');
    expect(entry?.path).toBe('/api/tbox/keys');
  });
});

describe('tool schemas', () => {
  it('every registered MCP tool has a zod input schema', async () => {
    const { TOOL_SPECS } = await import('../src/tools/registry.js');
    for (const spec of TOOL_SPECS) {
      expect(toolInputSchemas[spec.name], spec.name).toBeDefined();
    }
  });
});

describe('registry', () => {
  it('exposes 27 MCP tools', async () => {
    const { TOOL_SPECS } = await import('../src/tools/registry.js');
    expect(TOOL_SPECS.length).toBe(27);
  });

  it('does not register tmail_e2ee_generate', async () => {
    const { TOOL_SPECS } = await import('../src/tools/registry.js');
    expect(TOOL_SPECS.some((t) => t.name === 'tmail_e2ee_generate')).toBe(false);
  });
});
