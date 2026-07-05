import fs from 'node:fs';
import path from 'node:path';
import type { Config } from '../config/env.js';
import { jsonFieldNonempty } from '../profile/jsonfields.js';
import type { ProfilePaths } from '../profile/paths.js';
import { isBoundProfile, unboundPaths } from '../profile/paths.js';
import type { ProfileSelector } from '../profile/selector.js';
import { ResolvePolicy, resolveValidated } from '../profile/selector.js';
import {
  ERR_INVALID_WALLET_SLUG,
  ERR_MULTI_WALLET_AMBIGUOUS,
  ERR_WALLET_NOT_BOUND,
  ResolveError,
  type WalletSummary,
} from '../profile/errors.js';
import { listBoundWallets } from '../profile/bound-wallets.js';
import { absMainDir } from '../profile/paths.js';

function shouldCheckGitignore(cfg: Config, paths: ProfilePaths): boolean {
  if (cfg.skipGitignoreCheck) return false;
  const mainOutsideProject =
    path.isAbsolute(paths.mainDir) &&
    !paths.mainDir.startsWith(path.resolve(cfg.projectRoot) + path.sep) &&
    paths.mainDir !== path.resolve(cfg.projectRoot);
  return !mainOutsideProject;
}

function gitignoreWarningIfNeeded(cfg: Config, paths: ProfilePaths): string | null {
  if (!shouldCheckGitignore(cfg, paths)) return null;
  const mainDirRel = cfg.mainDirRel || '.tmail';
  return gitignoreWarning(cfg.projectRoot, mainDirRel);
}

export type GateStatus =
  | 'READY'
  | 'WAIT_ENV_BIND'
  | 'SETUP_BIND'
  | 'SETUP_FINISH'
  | 'AUTH_NEEDS_LOGIN'
  | 'STOP'
  | 'INVALID_SESSION';

export interface GateResult {
  status: GateStatus;
  messages: string[];
  warnings?: string[];
  wallet_slug: string;
  bound_count?: number;
  paths?: ProfilePaths;
}

function fileExists(p: string): boolean {
  if (!p.trim()) return false;
  try {
    fs.statSync(p);
    return true;
  } catch {
    return false;
  }
}

function e2eeRegistered(filePath: string): boolean {
  if (!filePath.trim()) return false;
  try {
    const b = fs.readFileSync(filePath, 'utf8');
    return b.includes('"registered"') && b.includes('true');
  } catch {
    return false;
  }
}

function gitignoreHas(gitignorePath: string, entry: string): boolean {
  try {
    const lines = fs.readFileSync(gitignorePath, 'utf8').split('\n');
    return lines.some((line) => line.trim() === entry);
  } catch {
    return false;
  }
}

/** Legacy pre-bind folder — warn only; do not block first install. */
function legacyPendingWarning(_mainDir: string): string | null {
  const pendingDir = path.join(_mainDir, '_pending', 'profile');
  const sessionFile = path.join(pendingDir, 'session.json');
  if (!fileExists(path.dirname(sessionFile))) return null;
  if (jsonFieldNonempty(sessionFile, 'api_key')) {
    return 'Obsolete _pending/ profile with session.json — safe cleanup: remove _pending/ under storage root (operator only)';
  }
  if (fileExists(pendingDir)) {
    return 'Obsolete empty _pending/ — safe cleanup: remove _pending/ under storage root (operator only)';
  }
  return null;
}

function gitignoreWarning(projectRoot: string, mainDirRel: string): string | null {
  const ok =
    gitignoreHas(path.join(projectRoot, '.gitignore'), `${mainDirRel}/`) ||
    gitignoreHas(path.join(projectRoot, '.gitignore'), '.tmail/');
  if (ok) return null;
  return 'Add .tmail/ to .gitignore in project root (recommended before commit)';
}

function profileNeedsRebind(p: ProfilePaths): boolean {
  if (!isBoundProfile(p)) return false;
  if (!jsonFieldNonempty(p.sessionFile, 'api_key')) return false;
  return !fileExists(p.metaFile);
}

function checkReady10(p: ProfilePaths): boolean {
  if (!isBoundProfile(p)) return false;
  if (!jsonFieldNonempty(p.sessionFile, 'api_key')) return false;
  if (!jsonFieldNonempty(p.metaFile, 'wallet_address')) return false;
  if (!jsonFieldNonempty(p.metaFile, 'sub_address')) return false;
  if (!jsonFieldNonempty(p.metaFile, 'default_mailbox')) return false;
  if (!e2eeRegistered(p.e2eeFile)) return false;
  return true;
}

function setupFinishHints(p: ProfilePaths, cfg: Config): string[] {
  const hints: string[] = [];
  if (!isBoundProfile(p)) {
    hints.push('No bound wallet — run tmail_sub_bind or tmail_sub_login via MCP');
    return hints;
  }
  if (profileNeedsRebind(p)) {
    hints.push(
      `Partial profile for wallet ${p.walletSlug}: delete session.json in profile dir and re-run tmail_sub_bind or tmail_sub_login`,
    );
  }
  if (
    !jsonFieldNonempty(p.metaFile, 'wallet_address') ||
    !jsonFieldNonempty(p.metaFile, 'sub_address') ||
    !jsonFieldNonempty(p.metaFile, 'default_mailbox')
  ) {
    hints.push('Missing meta.json fields — re-run tmail_sub_bind or tmail_sub_login via MCP');
  }
  if (!e2eeRegistered(p.e2eeFile)) {
    hints.push('Use MCP: tmail_e2ee_generate_local (register=true)');
  }
  const gi = gitignoreWarningIfNeeded(cfg, p);
  if (gi) hints.push(gi);
  if (hints.length === 0) {
    hints.push('See tmail-agent-setup for bootstrap steps');
  }
  return hints;
}

function readyMessages(p: ProfilePaths, mainDir: string): string[] {
  void mainDir;
  return ['READY', `Wallet: ${p.walletSlug}`];
}

function collectWarnings(cfg: Config, paths: ProfilePaths): string[] {
  const warnings: string[] = [];
  const legacy = legacyPendingWarning(paths.mainDir);
  if (legacy) warnings.push(legacy);
  const gi = gitignoreWarningIfNeeded(cfg, paths);
  if (gi) warnings.push(gi);
  return warnings;
}

function waitEnvBindMessages(apiURL: string, bindInvite: string): string[] {
  const msgs = ['WAIT_ENV_BIND'];
  if (!apiURL) {
    msgs.push('Set TMAIL_API_URL in mcpServers.tmail.env (or .env.tmail for CLI gate)');
    msgs.push('CLI note: npx @tmail/mcp gate does not read .cursor/mcp.json — export env or use .env.tmail');
  }
  if (!bindInvite) {
    msgs.push('Fill TMAIL_BIND_INVITE (tmail_i_* from owner bundle) in mcpServers.tmail.env');
  }
  msgs.push('Reload MCP host after changes, then reply "ready"');
  msgs.push('Bind via MCP: tmail_generate_payload → @ton/mcp → tmail_sub_bind');
  msgs.push('No profile folder until bind succeeds (.tmail/<wallet_slug>/profile)');
  return msgs;
}

function setupBindMessages(): string[] {
  return [
    'SETUP_BIND',
    'Env ready — first bind pending (no on-disk profile until tmail_sub_bind succeeds)',
    'Use MCP: tmail_generate_payload (do not curl POST /api/auth/generate-payload)',
    'Then: @ton/mcp generate_ton_proof → tmail_sub_bind',
    'After bind: tmail_e2ee_generate_local → tmail_e2ee_register until READY',
  ];
}

function firstInstallResult(
  cfg: Config,
  paths: ProfilePaths,
  warnings: string[],
  boundCount: number,
): GateResult {
  const apiURL = cfg.apiUrl.trim();
  const bindInvite = cfg.bindInvite.trim();
  if (!apiURL || !bindInvite) {
    return {
      status: 'WAIT_ENV_BIND',
      wallet_slug: paths.walletSlug,
      messages: waitEnvBindMessages(apiURL, bindInvite),
      warnings,
      paths,
      bound_count: boundCount,
    };
  }
  return {
    status: 'SETUP_BIND',
    wallet_slug: paths.walletSlug,
    messages: setupBindMessages(),
    warnings,
    paths,
    bound_count: boundCount,
  };
}

function resolveErrorResult(cfg: Config, re: ResolveError, boundCount: number): GateResult {
  const mainDir = absMainDir(cfg);
  const warnings = collectWarnings(cfg, unboundPaths(cfg.projectRoot, mainDir));

  if (re.code === ERR_MULTI_WALLET_AMBIGUOUS) {
    const msgs = [
      'Multiple bound wallets — pass wallet_slug (or sub_address) to this tool',
      re.action,
    ];
    for (const w of re.availableWallets) {
      msgs.push(`  wallet_slug=${w.wallet_slug} sub_address=${w.sub_address ?? ''}`);
    }
    return {
      status: 'SETUP_FINISH',
      messages: msgs,
      warnings,
      wallet_slug: '',
      bound_count: boundCount,
      paths: unboundPaths(cfg.projectRoot, mainDir),
    };
  }

  if (re.code === ERR_WALLET_NOT_BOUND && boundCount === 0) {
    return firstInstallResult(cfg, unboundPaths(cfg.projectRoot, mainDir), warnings, boundCount);
  }

  if (re.code === ERR_INVALID_WALLET_SLUG) {
    const msgs = [re.message, re.action];
    if (boundCount === 0) {
      return firstInstallResult(cfg, unboundPaths(cfg.projectRoot, mainDir), [...warnings, re.message], boundCount);
    }
    return {
      status: 'SETUP_FINISH',
      messages: msgs,
      warnings,
      wallet_slug: '',
      bound_count: boundCount,
      paths: unboundPaths(cfg.projectRoot, mainDir),
    };
  }

  const msgs = [`STOP: ${re.code}: ${re.message}`];
  if (re.action) msgs.push(re.action);
  for (const w of re.availableWallets) {
    msgs.push(`  wallet_slug=${w.wallet_slug} sub_address=${w.sub_address ?? ''}`);
  }
  return { status: 'STOP', messages: msgs, wallet_slug: '', bound_count: boundCount, warnings };
}

export async function checkSelector(cfg: Config, sel: ProfileSelector): Promise<GateResult> {
  const mainDir = absMainDir(cfg);
  let boundCount = 0;
  try {
    boundCount = (await listBoundWallets(mainDir)).length;
  } catch {
    boundCount = 0;
  }

  try {
    const res = await resolveValidated(cfg, sel, ResolvePolicy.ExplicitIfMulti);
    const out = checkPaths(cfg, res.paths, boundCount);
    out.bound_count = boundCount;
    return out;
  } catch (err) {
    if (err instanceof ResolveError) {
      return resolveErrorResult(cfg, err, boundCount);
    }
    return {
      status: 'STOP',
      messages: [`STOP: ${err instanceof Error ? err.message : String(err)}`],
      wallet_slug: '',
      bound_count: boundCount,
    };
  }
}

export function checkPaths(cfg: Config, paths: ProfilePaths, boundCount = 0): GateResult {
  const warnings = collectWarnings(cfg, paths);
  const apiURL = cfg.apiUrl.trim();
  const bindInvite = cfg.bindInvite.trim();
  const mainDirRel = cfg.mainDirRel || '.tmail';

  const sessionHasKey = isBoundProfile(paths) && jsonFieldNonempty(paths.sessionFile, 'api_key');
  const hasSubEvidence =
    isBoundProfile(paths) &&
    (jsonFieldNonempty(paths.sessionFile, 'sub_address') || jsonFieldNonempty(paths.metaFile, 'sub_address'));

  // First install / zero bound: env-only gate (never hard STOP for missing profile).
  if (boundCount === 0 && !sessionHasKey) {
    return firstInstallResult(cfg, paths, warnings, boundCount);
  }

  if (checkReady10(paths)) {
    const gi = gitignoreWarningIfNeeded(cfg, paths);
    const readyWarnings = gi ? [...warnings, gi] : warnings;
    return {
      status: 'READY',
      messages: readyMessages(paths, mainDirRel),
      warnings: readyWarnings.length ? readyWarnings : undefined,
      paths,
      wallet_slug: paths.walletSlug,
      bound_count: boundCount,
    };
  }

  if (!sessionHasKey && hasSubEvidence) {
    return {
      status: 'AUTH_NEEDS_LOGIN',
      wallet_slug: paths.walletSlug,
      messages: [
        'AUTH_NEEDS_LOGIN',
        `Sub appears already bound for wallet ${paths.walletSlug}.`,
        'Use TonProof login via MCP: tmail_generate_payload → @ton/mcp → tmail_sub_login (bind_invite not required).',
        'Owner api_key must never be used by sub-agent.',
      ],
      warnings: warnings.length ? warnings : undefined,
      paths,
      bound_count: boundCount,
    };
  }

  if (sessionHasKey || profileNeedsRebind(paths)) {
    const msgs = ['SETUP_FINISH', 'Ready §10 incomplete — complete bootstrap via MCP'];
    msgs.push(...setupFinishHints(paths, cfg));
    return {
      status: 'SETUP_FINISH',
      messages: msgs,
      warnings: warnings.length ? warnings : undefined,
      paths,
      wallet_slug: paths.walletSlug,
      bound_count: boundCount,
    };
  }

  // Env incomplete but wallets exist (edge) — still soft WAIT, not STOP.
  if (!apiURL || !bindInvite) {
    return {
      status: 'WAIT_ENV_BIND',
      wallet_slug: paths.walletSlug,
      messages: waitEnvBindMessages(apiURL, bindInvite),
      warnings: warnings.length ? warnings : undefined,
      paths,
      bound_count: boundCount,
    };
  }

  return {
    status: 'SETUP_BIND',
    wallet_slug: paths.walletSlug,
    messages: setupBindMessages(),
    warnings: warnings.length ? warnings : undefined,
    paths,
    bound_count: boundCount,
  };
}

/** Actionable text for tool errors — skips bare status labels. */
export function formatGateActionError(res: GateResult): string {
  const skip = new Set<string>([
    res.status,
    'READY',
    'WAIT_ENV_BIND',
    'SETUP_BIND',
    'SETUP_FINISH',
    'AUTH_NEEDS_LOGIN',
  ]);
  const actionable = res.messages.filter((m) => !skip.has(m));
  if (actionable.length) return actionable.join('\n');
  switch (res.status) {
    case 'WAIT_ENV_BIND':
      return 'Set TMAIL_API_URL and TMAIL_BIND_INVITE in mcpServers.tmail.env, reload MCP host';
    case 'SETUP_BIND':
      return 'Bind wallet: tmail_generate_payload → @ton/mcp → tmail_sub_bind';
    case 'SETUP_FINISH':
      return 'Complete bootstrap: tmail_e2ee_generate_local → tmail_e2ee_register';
    case 'AUTH_NEEDS_LOGIN':
      return 'Login: tmail_generate_payload → @ton/mcp → tmail_sub_login';
    default:
      return res.status;
  }
}

export function exitCodeForStatus(status: GateStatus): number {
  switch (status) {
    case 'READY':
    case 'WAIT_ENV_BIND':
    case 'AUTH_NEEDS_LOGIN':
    case 'SETUP_BIND':
    case 'SETUP_FINISH':
      return 0;
    case 'INVALID_SESSION':
      return 2;
    default:
      return 1;
  }
}
