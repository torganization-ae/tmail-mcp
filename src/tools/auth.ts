import path from 'node:path';
import { checkPaths } from '../gate/gate.js';
import { listBoundWallets } from '../profile/bound-wallets.js';
import { ERR_PROOF_SUB_MISMATCH, ERR_SELECTOR_CONFLICT, newResolveError } from '../profile/errors.js';
import { writeJsonAtomic } from '../profile/jsonfields.js';
import { ensureWalletProfile } from '../profile/migrate.js';
import { pathsForSlug, profileDirForSlug } from '../profile/paths.js';
import { walletSlugFromSubAddress } from '../profile/tonaddr.js';
import { loadSessionData, writeSession } from '../profile/session.js';
import { mapFlatToAPI, parseFlatProof, subAddressMatchesProof, type FlatProof } from '../tonproof/map-proof.js';
import { requireGate, sanitizeGateResult, sanitizeWalletSummaries } from './guard.js';
import { sanitizeForTool, withProfileContext } from './sanitize.js';
import {
  optionalString,
  textError,
  textResult,
  type Runtime,
} from './runtime.js';
import { ApiError } from '../client/api-client.js';

export async function gateCheck(_rt: Runtime): Promise<ReturnType<typeof textResult>> {
  const res = checkPaths(_rt.cfg, _rt.paths);
  const wallets = await listBoundWallets(_rt.paths.mainDir);
  return textResult({ ...sanitizeGateResult(res), bound_count: wallets.length });
}

export async function listWalletsTool(rt: Runtime): Promise<ReturnType<typeof textResult>> {
  const wallets = await listBoundWallets(rt.paths.mainDir);
  return textResult({
    wallets: sanitizeWalletSummaries(wallets),
    bound_count: wallets.length,
    resolved_slug: rt.paths.walletSlug,
  });
}

export async function authStatus(rt: Runtime): Promise<ReturnType<typeof textResult>> {
  requireGate(rt, 'setup_auth');
  if (!rt.paths.dir) {
    return textResult({
      authenticated: false,
      error: 'no bound wallet profile on disk',
      action: 'Run tmail_sub_bind or tmail_sub_login for this wallet',
    });
  }
  const { session, error } = loadSessionData(rt.paths.dir);
  if (!session) {
    return textResult({
      authenticated: false,
      error: error ?? 'no session',
      action: 'Run tmail_sub_bind or tmail_sub_login for this wallet',
    });
  }
  try {
    const out = await rt.client.get<Record<string, unknown>>('/api/tbox/limits');
    return textResult(sanitizeForTool('tmail_auth_status', out));
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return textResult({
        authenticated: false,
        error: err.message,
        action: 'API key revoked or invalid — follow tmail-recovery skill',
      });
    }
    throw err;
  }
}

export async function generatePayload(rt: Runtime): Promise<ReturnType<typeof textResult>> {
  requireGate(rt, 'setup_auth');
  const out = await rt.client.post<Record<string, unknown>>('/api/auth/generate-payload', {});
  return textResult(sanitizeForTool('tmail_generate_payload', out));
}

function validateAuthResponse(flat: FlatProof, rt: Runtime, out: Record<string, unknown>): void {
  const subAddr = typeof out.sub_address === 'string' ? out.sub_address : '';
  if (!subAddr.trim()) {
    throw new Error(`${ERR_PROOF_SUB_MISMATCH}: API response missing sub_address`);
  }
  try {
    subAddressMatchesProof(flat.address, subAddr);
  } catch (err) {
    throw new Error(
      `${ERR_PROOF_SUB_MISMATCH}: ${err instanceof Error ? err.message : String(err)} — re-run @ton/mcp generate_ton_proof for this wallet`,
    );
  }
  if (rt.paths.walletSlug) {
    const expectedSlug = walletSlugFromSubAddress(subAddr);
    if (rt.paths.walletSlug !== expectedSlug) {
      throw new Error(
        `${ERR_SELECTOR_CONFLICT}: resolved wallet_slug "${rt.paths.walletSlug}" does not match API sub_address slug "${expectedSlug}"`,
      );
    }
  }
}

async function writeMetaJson(rt: Runtime, profileDir: string, subAddress: string): Promise<void> {
  const mailboxesOut = await rt.client.post<Record<string, unknown>>('/api/tbox/mailboxes', {
    offset: 0,
    limit: 20,
  });
  const fm = mailboxesOut.free_mailbox as Record<string, unknown> | undefined;
  const defaultMB = typeof fm?.web3_address === 'string' ? fm.web3_address : '';
  if (!defaultMB.trim()) {
    throw new Error('mailboxes API returned empty free_mailbox.web3_address');
  }
  await writeJsonAtomic(path.join(profileDir, 'meta.json'), {
    wallet_address: subAddress,
    sub_address: subAddress,
    default_mailbox: defaultMB,
  });
}

async function persistSessionFromResponse(
  rt: Runtime,
  out: Record<string, unknown>,
): Promise<string> {
  const apiKey = typeof out.api_key === 'string' ? out.api_key : '';
  const subAddr = typeof out.sub_address === 'string' ? out.sub_address : '';
  const prefix = typeof out.key_prefix === 'string' ? out.key_prefix : '';
  const access = typeof out.access_token === 'string' ? out.access_token : '';
  const refresh = typeof out.refresh_token === 'string' ? out.refresh_token : '';
  const keyIssue = typeof out.key_issue_error === 'string' ? out.key_issue_error : '';

  if (!apiKey.trim()) {
    if (keyIssue) throw new Error(`api_key not issued: ${keyIssue}`);
    throw new Error('api_key missing in bind/login response');
  }
  if (apiKey.trim().startsWith('tmail_o_')) {
    throw new Error('owner api_key (tmail_o_*) must not be persisted by sub-agent MCP');
  }
  if (apiKey.trim().startsWith('tmail_i_')) {
    throw new Error('bind invite key (tmail_i_*) must not be persisted as session api_key');
  }

  const slug = walletSlugFromSubAddress(subAddr);
  const mainDir = rt.paths.mainDir;
  await ensureWalletProfile(mainDir, subAddr);

  const profileDir = profileDirForSlug(mainDir, slug);
  const sessionPath = path.join(profileDir, 'session.json');
  await writeSession(sessionPath, {
    bound: true,
    subAddress: subAddr,
    apiKey,
    apiKeyPrefix: prefix,
    accessToken: access,
    refreshToken: refresh,
  });

  rt.client.setApiKey(apiKey);
  rt.paths = pathsForSlug(rt.cfg, slug);
  await writeMetaJson(rt, profileDir, subAddr);
  return slug;
}

export async function subBind(rt: Runtime, args: Record<string, unknown>): Promise<ReturnType<typeof textResult>> {
  requireGate(rt, 'setup_auth');
  let bindInvite = optionalString(args, 'bind_invite');
  if (!bindInvite.trim()) bindInvite = rt.cfg.bindInvite;
  if (!bindInvite) {
    return textError('bind_invite is required (tool arg or TMAIL_BIND_INVITE in tmail MCP env)');
  }
  const flatRaw = optionalString(args, 'ton_proof_json');
  if (!flatRaw) return textError('ton_proof_json is required (flat @ton/mcp generate_ton_proof JSON)');

  let flat: FlatProof;
  try {
    flat = parseFlatProof(flatRaw);
  } catch (err) {
    return textError(err instanceof Error ? err.message : String(err));
  }
  const apiProof = mapFlatToAPI(flat, optionalString(args, 'payload'));
  const body = {
    bind_invite: bindInvite,
    sub_proof: apiProof,
    name: optionalString(args, 'name'),
    lang_code: optionalString(args, 'lang_code'),
  };
  const out = await rt.client.post<Record<string, unknown>>('/api/subacc/auth/bind', body);
  validateAuthResponse(flat, rt, out);
  let slug: string;
  try {
    slug = await persistSessionFromResponse(rt, out);
  } catch (err) {
    return textError(`bind ok but session persist failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const sanitized = sanitizeForTool('tmail_sub_bind', out) as Record<string, unknown>;
  return textResult(withProfileContext(rt.paths.walletSlug, rt.paths.dir, { ...sanitized, wallet_slug: slug }, rt.cfg.redactPaths));
}

export async function subLogin(rt: Runtime, args: Record<string, unknown>): Promise<ReturnType<typeof textResult>> {
  requireGate(rt, 'setup_auth');
  const flatRaw = optionalString(args, 'ton_proof_json');
  if (!flatRaw) return textError('ton_proof_json is required');

  let flat: FlatProof;
  try {
    flat = parseFlatProof(flatRaw);
  } catch (err) {
    return textError(err instanceof Error ? err.message : String(err));
  }
  const apiProof = mapFlatToAPI(flat, optionalString(args, 'payload'));
  const body = {
    ...apiProof,
    name: optionalString(args, 'name'),
    lang_code: optionalString(args, 'lang_code'),
  };
  const out = await rt.client.post<Record<string, unknown>>('/api/subacc/auth/login', body);
  validateAuthResponse(flat, rt, out);
  let slug: string;
  try {
    slug = await persistSessionFromResponse(rt, out);
  } catch (err) {
    return textError(`login ok but session persist failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const sanitized = sanitizeForTool('tmail_sub_login', out) as Record<string, unknown>;
  return textResult(withProfileContext(rt.paths.walletSlug, rt.paths.dir, { ...sanitized, wallet_slug: slug }, rt.cfg.redactPaths));
}
