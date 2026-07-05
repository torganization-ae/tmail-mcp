import type { Config } from '../config/env.js';
import { ApiClient } from '../client/api-client.js';
import { ResolvePolicy, resolveValidated, type ProfileSelector } from '../profile/selector.js';
import { loadSessionData } from '../profile/session.js';
import { ERR_SESSION_MISSING, newResolveError } from '../profile/errors.js';
import type { ProfilePaths } from '../profile/paths.js';

export enum AuthMode {
  None = 0,
  Optional = 1,
  Required = 2,
}

export interface Runtime {
  cfg: Config;
  paths: ProfilePaths;
  client: ApiClient;
}

export async function newRuntime(
  cfg: Config,
  sel: ProfileSelector,
  policy: ResolvePolicy,
  authMode: AuthMode,
): Promise<Runtime> {
  if (!cfg.apiUrl) {
    throw new Error('TMAIL_API_URL is not set — add it to mcpServers.tmail.env and reload MCP host');
  }
  const res = await resolveValidated(cfg, sel, policy);
  const rt: Runtime = {
    cfg,
    paths: res.paths,
    client: new ApiClient(cfg.apiUrl),
  };
  if (authMode === AuthMode.None) {
    return rt;
  }
  if (res.session) {
    rt.client.setApiKey(res.session.apiKey);
    return rt;
  }
  if (authMode === AuthMode.Required) {
    throw newResolveError(ERR_SESSION_MISSING, 'session with api_key required', 'Run tmail_sub_bind or tmail_sub_login for this wallet');
  }
  const { session } = res.paths.dir ? loadSessionData(res.paths.dir) : { session: null };
  if (session) {
    rt.client.setApiKey(session.apiKey);
  }
  return rt;
}

export function textResult(v: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(v, null, 2) }] };
}

export function textError(msg: string): { content: [{ type: 'text'; text: string }]; isError: true } {
  return { content: [{ type: 'text', text: msg }], isError: true };
}

export function optionalString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === 'string' ? v : '';
}

export function optionalInt(args: Record<string, unknown>, key: string, def: number): number {
  const v = args[key];
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  return def;
}

export function optionalBool(args: Record<string, unknown>, key: string): boolean {
  return args[key] === true;
}

export function requireString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`${key} is required`);
  }
  return v;
}

export function requireStringArray(args: Record<string, unknown>, key: string): string[] {
  const v = args[key];
  if (!Array.isArray(v) || v.length === 0) {
    throw new Error(`${key} is required`);
  }
  return v.filter((x): x is string => typeof x === 'string');
}

export function requireBool(args: Record<string, unknown>, key: string): boolean {
  if (typeof args[key] !== 'boolean') {
    throw new Error(`${key} is required`);
  }
  return args[key] as boolean;
}

export function parseProfileSelector(args: Record<string, unknown>): ProfileSelector {
  return {
    walletSlug: optionalString(args, 'wallet_slug'),
    subAddress: optionalString(args, 'sub_address'),
    apiKeyPrefix: optionalString(args, 'api_key_prefix'),
  };
}

export function resolveErrorResult(re: InstanceType<typeof import('../profile/errors.js').ResolveError>) {
  const lines = [`STOP: ${re.code}: ${re.message}`];
  if (re.action) lines.push(re.action);
  for (const w of re.availableWallets) {
    lines.push(`  wallet_slug=${w.wallet_slug} sub_address=${w.sub_address ?? ''}`);
  }
  return textError(lines.join('\n'));
}
