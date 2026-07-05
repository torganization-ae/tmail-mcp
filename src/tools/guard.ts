import type { GateResult } from '../gate/gate.js';
import { checkPaths, formatGateActionError, type GateStatus } from '../gate/gate.js';
import { countBoundWalletsSync } from '../profile/bound-wallets.js';
import type { Runtime } from './runtime.js';

export type GateCategory = 'local' | 'setup_auth' | 'mail_ops' | 'human_only';

export const HUMAN_ONLY_ERROR =
  '403 human_required: run e2ee-passphrase CLI as operator (sudo -u tmail-mcp npx @tmail/mcp e2ee-passphrase ...)';

/** Redact absolute filesystem paths from agent-visible gate text. */
const ABS_PATH_PATTERN = /(?:^|[\s'"`(=])(\/(?:[\w.-]+\/)+[\w.-]+)/g;

export function redactAbsolutePaths(text: string): string {
  return text.replace(ABS_PATH_PATTERN, (match, p: string) => match.replace(p, '[redacted-path]'));
}

function gateAllowsSetupAuth(status: GateStatus): boolean {
  return ['READY', 'WAIT_ENV_BIND', 'AUTH_NEEDS_LOGIN', 'SETUP_BIND', 'SETUP_FINISH'].includes(status);
}

function gateCheckResult(rt: Runtime): GateResult {
  const boundCount = countBoundWalletsSync(rt.paths.mainDir);
  return checkPaths(rt.cfg, rt.paths, boundCount);
}

export function requireHumanOnly(): never {
  throw new Error(HUMAN_ONLY_ERROR);
}

export function requireGate(rt: Runtime, cat: GateCategory): void {
  if (cat === 'human_only') {
    requireHumanOnly();
  }
  if (cat === 'local') return;
  const res = gateCheckResult(rt);
  if (cat === 'setup_auth') {
    if (!gateAllowsSetupAuth(res.status)) {
      throw new Error(formatGateActionError(res));
    }
    return;
  }
  if (cat === 'mail_ops') {
    if (res.status !== 'READY') {
      throw new Error(formatGateActionError(res));
    }
  }
}

export function sanitizeGateMessages(messages: string[]): string[] {
  return messages.map((m) => {
    let out = m;
    if (out.startsWith('Profile:')) out = 'Profile: [redacted]';
    else if (out.startsWith('Main:')) out = 'Main: [redacted]';
    return redactAbsolutePaths(out);
  });
}

export function sanitizeGateWarnings(warnings: string[] | undefined): string[] | undefined {
  if (!warnings?.length) return warnings;
  return warnings.map((w) => redactAbsolutePaths(w));
}

export function sanitizeGateResult(res: GateResult): Record<string, unknown> {
  return {
    status: res.status,
    messages: sanitizeGateMessages(res.messages),
    warnings: sanitizeGateWarnings(res.warnings),
    wallet_slug: res.wallet_slug,
    bound_count: res.bound_count,
  };
}

export function sanitizeWalletSummaries(
  wallets: Array<{ wallet_slug: string; sub_address?: string; api_key_prefix?: string; profile_dir?: string }>,
): Array<{ wallet_slug: string; sub_address?: string; api_key_prefix?: string }> {
  return wallets.map(({ wallet_slug, sub_address, api_key_prefix }) => ({
    wallet_slug,
    sub_address,
    api_key_prefix,
  }));
}
