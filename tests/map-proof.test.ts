import { describe, expect, it } from 'vitest';
import { mapFlatToAPI, parseFlatProof, PROOF_MAX_AGE_SEC } from '../src/tonproof/map-proof.js';

const nowSec = Math.floor(Date.now() / 1000);

function flatProof(overrides: Record<string, unknown> = {}) {
  return {
    address: '0:fc6155b81a4e18cb83a104bffce9ba207e6d60d1bdf9224f3bef6b9838bdef96',
    domainValue: '127.0.0.1',
    domainLengthBytes: 9,
    timestamp: nowSec,
    signature: 'sig==',
    walletStateInit: 'te6cckEC',
    payload: 'abc123',
    ...overrides,
  };
}

describe('parseFlatProof', () => {
  it('accepts flat @ton/mcp proof', () => {
    const flat = parseFlatProof(JSON.stringify(flatProof()));
    expect(flat.domainValue).toBe('127.0.0.1');
    expect(flat.timestamp).toBe(nowSec);
  });

  it('unwraps { proof: flat } wrapper from @ton/mcp response', () => {
    const inner = flatProof();
    const flat = parseFlatProof(JSON.stringify({ proof: inner }));
    expect(flat.address).toBe(inner.address);
    expect(flat.domainValue).toBe('127.0.0.1');
  });

  it('converts REST nested proof to flat and maps to API', () => {
    const nested = {
      address: '0:fc6155b81a4e18cb83a104bffce9ba207e6d60d1bdf9224f3bef6b9838bdef96',
      proof: {
        timestamp: nowSec,
        domain: { lengthBytes: 9, value: '127.0.0.1' },
        payload: 'abc123',
        signature: 'sig==',
        state_init: 'te6cckEC',
      },
    };
    const flat = parseFlatProof(JSON.stringify(nested));
    expect(flat.domainValue).toBe('127.0.0.1');
    expect(flat.walletStateInit).toBe('te6cckEC');
    expect(flat.timestamp).toBe(nowSec);
    const api = mapFlatToAPI(flat);
    expect(api.proof.domain.value).toBe('127.0.0.1');
    expect(api.proof.state_init).toBe('te6cckEC');
  });

  it('rejects zero timestamp (typical nested-mapped-by-mistake symptom)', () => {
    expect(() => parseFlatProof(JSON.stringify(flatProof({ timestamp: 0 })))).toThrow(/zero timestamp/);
  });

  it('rejects expired timestamp', () => {
    expect(() =>
      parseFlatProof(JSON.stringify(flatProof({ timestamp: nowSec - PROOF_MAX_AGE_SEC - 60 }))),
    ).toThrow(/expired/);
  });
});
