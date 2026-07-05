import { describe, expect, it } from 'vitest';
import {
  buildE2EEGenerateBody,
  e2eeRegisterBody,
  generateE2EEKeyPairLocal,
  validateE2EEGenerateBody,
} from '../src/crypto/e2ee-local.js';
import { toolContracts } from '../src/schemas/tools.zod.js';

describe('contract', () => {
  it('tool contracts matrix', () => {
    const contracts = toolContracts();
    expect(contracts.length).toBe(23);
    const seen = Object.fromEntries(contracts.map((c) => [c.name, c.path]));
    expect(seen.tmail_e2ee_generate).toBe('/api/tbox/keys/generate');
    expect(seen.tmail_e2ee_generate_local).toBe('/api/tbox/keys');
  });

  it('build E2EE generate body', () => {
    const body = buildE2EEGenerateBody('my-secure-passphrase-16', true);
    expect(body.acknowledge_server_side_risk).toBe(true);
    expect(body.register).toBe(true);
    expect(() => validateE2EEGenerateBody('short', true)).toThrow();
  });

  it('E2EE register body mapping', () => {
    const pub = 'dGVzdC1wdWJsaWMta2V5LXRlc3Qta2V5LXRlc3Q=';
    const body = e2eeRegisterBody(pub);
    expect(body.pub_key_e2e).toBe(pub);
    expect(body).not.toHaveProperty('pub_key_base64');
  });
});

describe('tools.lock.json alignment', () => {
  it('registry exposes 27 MCP tools', async () => {
    const { TOOL_SPECS } = await import('../src/tools/registry.js');
    expect(TOOL_SPECS.length).toBe(27);
  });

  it('tmail_e2ee_generate is not registered as MCP tool', async () => {
    const { TOOL_SPECS } = await import('../src/tools/registry.js');
    expect(TOOL_SPECS.some((t) => t.name === 'tmail_e2ee_generate')).toBe(false);
  });
});
