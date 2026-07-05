import { normalizeAddress } from '../profile/tonaddr.js';

/** Server proof payload TTL (15 min). */
export const PROOF_MAX_AGE_SEC = 15 * 60;

export interface FlatProof {
  address: string;
  domainValue?: string;
  domainLengthBytes?: number;
  timestamp?: number;
  payload?: string;
  signature?: string;
  walletStateInit?: string;
}

export interface ApiProof {
  address: string;
  proof: {
    timestamp: number;
    domain: { lengthBytes: number; value: string };
    payload: string;
    signature: string;
    state_init: string;
  };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function isRestNestedProof(o: Record<string, unknown>): boolean {
  const proof = asRecord(o.proof);
  if (!proof) return false;
  return asRecord(proof.domain) !== null && !isFlatMcpProof(o) && !isFlatMcpProof(proof);
}

/** REST bind/login body shape: { address, proof: { domain, state_init, ... } }. */
function nestedRestToFlat(root: Record<string, unknown>): FlatProof {
  const proof = asRecord(root.proof);
  const domain = proof ? asRecord(proof.domain) : null;
  if (!proof || !domain) {
    throw new Error('invalid nested REST proof — expected { address, proof: { domain, timestamp, signature, state_init } }');
  }
  const address =
    typeof root.address === 'string'
      ? root.address
      : typeof proof.address === 'string'
        ? proof.address
        : '';
  return {
    address,
    domainValue: typeof domain.value === 'string' ? domain.value : undefined,
    domainLengthBytes: typeof domain.lengthBytes === 'number' ? domain.lengthBytes : undefined,
    timestamp: typeof proof.timestamp === 'number' ? proof.timestamp : undefined,
    payload: typeof proof.payload === 'string' ? proof.payload : undefined,
    signature: typeof proof.signature === 'string' ? proof.signature : undefined,
    walletStateInit:
      typeof proof.state_init === 'string'
        ? proof.state_init
        : typeof proof.walletStateInit === 'string'
          ? proof.walletStateInit
          : undefined,
  };
}

function isFlatMcpProof(o: Record<string, unknown>): boolean {
  return (
    typeof o.domainValue === 'string' ||
    typeof o.walletStateInit === 'string' ||
    (typeof o.domainLengthBytes === 'number' && o.domainValue !== undefined)
  );
}

function coerceFlatProof(o: Record<string, unknown>): FlatProof {
  return {
    address: typeof o.address === 'string' ? o.address : '',
    domainValue: typeof o.domainValue === 'string' ? o.domainValue : undefined,
    domainLengthBytes: typeof o.domainLengthBytes === 'number' ? o.domainLengthBytes : undefined,
    timestamp: typeof o.timestamp === 'number' ? o.timestamp : undefined,
    payload: typeof o.payload === 'string' ? o.payload : undefined,
    signature: typeof o.signature === 'string' ? o.signature : undefined,
    walletStateInit: typeof o.walletStateInit === 'string' ? o.walletStateInit : undefined,
  };
}

function validateFlatProof(flat: FlatProof): void {
  if (!flat.address.trim()) {
    throw new Error('ton_proof_json missing address — pass flat @ton/mcp generate_ton_proof output');
  }
  if (!flat.domainValue?.trim()) {
    throw new Error('ton_proof_json missing domainValue — pass @ton/mcp flat proof or valid nested REST sub_proof');
  }
  if (!flat.signature?.trim()) {
    throw new Error('ton_proof_json missing signature — pass complete flat @ton/mcp generate_ton_proof output');
  }
  if (!flat.walletStateInit?.trim()) {
    throw new Error('ton_proof_json missing walletStateInit — pass flat @ton/mcp generate_ton_proof output');
  }
  if (flat.timestamp === undefined || flat.timestamp <= 0) {
    throw new Error(
      'ton_proof_json missing or zero timestamp — nested REST format often causes this; pass flat @ton/mcp proof with top-level timestamp',
    );
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const ageSec = nowSec - flat.timestamp;
  if (ageSec > PROOF_MAX_AGE_SEC) {
    throw new Error(
      `proof timestamp expired (${Math.floor(ageSec / 60)} min old, max ${PROOF_MAX_AGE_SEC / 60} min) — run tmail_generate_payload → @ton/mcp generate_ton_proof → tmail_sub_bind immediately`,
    );
  }
  if (ageSec < -300) {
    throw new Error('proof timestamp is more than 5 min in the future — check system clock or regenerate proof');
  }
}

/**
 * Parse ton_proof_json for MCP bind/login.
 * Accepts: flat @ton/mcp proof, { proof: flat } wrapper, or nested REST { address, proof: { domain } } (auto-converted).
 */
export function parseFlatProof(raw: string): FlatProof {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`invalid ton_proof_json JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const root = asRecord(parsed);
  if (!root) {
    throw new Error('ton_proof_json must be a JSON object');
  }

  let flat: FlatProof;
  if (isRestNestedProof(root)) {
    flat = nestedRestToFlat(root);
  } else {
    let candidate: Record<string, unknown>;
    const wrapped = asRecord(root.proof);
    if (wrapped && isFlatMcpProof(wrapped)) {
      candidate = {
        ...wrapped,
        address: typeof wrapped.address === 'string' ? wrapped.address : root.address,
      };
    } else if (isFlatMcpProof(root)) {
      candidate = root;
    } else {
      throw new Error(
        'unrecognized ton_proof_json shape — pass flat @ton/mcp generate_ton_proof, { proof: flat }, or nested REST sub_proof',
      );
    }
    flat = coerceFlatProof(candidate);
  }
  validateFlatProof(flat);
  return flat;
}

export function mapFlatToAPI(flat: FlatProof, payloadOverride?: string): ApiProof {
  if (!flat.address) {
    throw new Error('mcp.address is required');
  }
  let payload = payloadOverride?.trim() || flat.payload?.trim() || '';
  if (!payload) {
    throw new Error('payload is required (from generate-payload or mcp)');
  }
  let raw: string;
  try {
    raw = normalizeAddress(flat.address).raw;
  } catch (err) {
    throw new Error(`mcp.address invalid: ${err instanceof Error ? err.message : String(err)}`);
  }
  return {
    address: raw,
    proof: {
      timestamp: flat.timestamp ?? 0,
      domain: {
        lengthBytes: flat.domainLengthBytes ?? 0,
        value: flat.domainValue ?? '',
      },
      payload,
      signature: flat.signature ?? '',
      state_init: flat.walletStateInit ?? '',
    },
  };
}

export function subAddressMatchesProof(proofAddress: string, subAddress: string): void {
  const rawA = normalizeAddress(proofAddress).raw;
  const rawB = normalizeAddress(subAddress).raw;
  if (rawA !== rawB) {
    throw new Error(`proof address ${rawA} does not match API sub_address ${rawB}`);
  }
}

export interface BindRequest {
  bind_invite: string;
  sub_proof: ApiProof;
  name?: string;
  lang_code?: string;
}

export interface LoginRequest extends ApiProof {
  name?: string;
  lang_code?: string;
}
