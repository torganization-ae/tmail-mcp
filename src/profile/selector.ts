import type { Config } from '../config/env.js';
import { listBoundWallets } from './bound-wallets.js';
import {
  ERR_API_KEY_PREFIX_MISMATCH,
  ERR_BIND_REQUIRES_UNBOUND,
  ERR_META_MISMATCH,
  ERR_MULTI_WALLET_AMBIGUOUS,
  ERR_NO_WALLET_BOUND,
  ERR_PROFILE_MISMATCH,
  ERR_SELECTOR_CONFLICT,
  ERR_SELECTOR_REQUIRED,
  ERR_SESSION_MISSING,
  ERR_WALLET_NOT_BOUND,
  ERR_INVALID_WALLET_SLUG,
  newResolveError,
  type WalletSummary,
} from './errors.js';
import { jsonStringField } from './jsonfields.js';
import { absMainDir, isBoundProfile, pathsForSlug, unboundPaths, type ProfilePaths } from './paths.js';
import { loadSessionData, apiKeyPrefixMatch, type SessionData } from './session.js';
import { walletSlugFromHexSlug, walletSlugFromSubAddress } from './tonaddr.js';

export interface ProfileSelector {
  walletSlug?: string;
  subAddress?: string;
  apiKeyPrefix?: string;
}

export enum ResolvePolicy {
  /** Bind / pre-bind setup: no wallet on disk yet; reject wallet selectors. */
  UnboundOK = 0,
  ExplicitIfMulti = 1,
  StrictExplicit = 2,
}

export interface ResolveResult {
  paths: ProfilePaths;
  session?: SessionData;
  sessionPath?: string;
}

function boundSlugSet(wallets: WalletSummary[]): Set<string> {
  return new Set(wallets.map((w) => w.wallet_slug));
}

async function normalizedWalletSlug(raw: string): Promise<string> {
  const s = raw.trim().toLowerCase();
  if (!s) return '';
  if (s === '_pending') {
    throw newResolveError(
      ERR_INVALID_WALLET_SLUG,
      'wallet_slug _pending is removed — omit wallet_slug before bind or pass bound 64-hex slug',
      'Run tmail_sub_bind first, then use wallet_slug from the response',
    );
  }
  try {
    return walletSlugFromHexSlug(s);
  } catch {
    throw newResolveError(ERR_INVALID_WALLET_SLUG, 'invalid wallet_slug', 'Use wallet_slug from tmail_sub_bind response');
  }
}

async function resolveSlug(
  sel: ProfileSelector,
  policy: ResolvePolicy,
  wallets: WalletSummary[],
): Promise<string> {
  let walletSlug = await normalizedWalletSlug(sel.walletSlug ?? '');
  let subSlug = '';
  if (sel.subAddress?.trim()) {
    try {
      subSlug = walletSlugFromSubAddress(sel.subAddress);
    } catch (err) {
      throw newResolveError(
        ERR_INVALID_WALLET_SLUG,
        err instanceof Error ? err.message : String(err),
        'Use sub_address format 0:<64hex>',
      );
    }
  }
  if (walletSlug && subSlug && walletSlug !== subSlug) {
    throw newResolveError(
      ERR_SELECTOR_CONFLICT,
      'wallet_slug and sub_address refer to different wallets',
      'Pass only one selector or ensure they match',
    );
  }
  if (subSlug) walletSlug = subSlug;

  switch (policy) {
    case ResolvePolicy.UnboundOK:
      if (walletSlug || sel.subAddress?.trim() || sel.apiKeyPrefix?.trim()) {
        throw newResolveError(
          ERR_BIND_REQUIRES_UNBOUND,
          'tmail_sub_bind does not accept wallet_slug, sub_address, or api_key_prefix before bind',
          'Omit wallet selectors — profile is created after bind from API sub_address',
        );
      }
      return '';

    case ResolvePolicy.StrictExplicit:
      if (!walletSlug) {
        throw newResolveError(
          ERR_SELECTOR_REQUIRED,
          'wallet_slug or sub_address is required',
          'Pass wallet_slug from tmail_sub_bind response or call tmail_list_wallets',
          wallets,
        );
      }
      if (!boundSlugSet(wallets).has(walletSlug)) {
        throw newResolveError(
          ERR_WALLET_NOT_BOUND,
          'wallet_slug is not a bound profile on disk',
          'Run tmail_sub_bind first or check tmail_list_wallets',
          wallets,
        );
      }
      return walletSlug;

    default:
      if (walletSlug) {
        if (!boundSlugSet(wallets).has(walletSlug)) {
          throw newResolveError(
            ERR_WALLET_NOT_BOUND,
            'wallet_slug is not a bound profile on disk',
            'Run tmail_sub_bind first or check tmail_list_wallets',
            wallets,
          );
        }
        return walletSlug;
      }
      switch (wallets.length) {
        case 0:
          return '';
        case 1:
          return wallets[0].wallet_slug;
        default:
          throw newResolveError(
            ERR_MULTI_WALLET_AMBIGUOUS,
            'multiple bound wallets — pass wallet_slug or sub_address',
            'Call tmail_list_wallets or pass wallet_slug from tmail_sub_bind response',
            wallets,
          );
      }
  }
}

function crossValidate(sel: ProfileSelector, slug: string, paths: ProfilePaths, sess: SessionData): void {
  let expected: string;
  try {
    expected = walletSlugFromSubAddress(sess.subAddress);
  } catch (err) {
    throw newResolveError(
      ERR_PROFILE_MISMATCH,
      `session sub_address invalid: ${err instanceof Error ? err.message : String(err)}`,
      'Re-run tmail_sub_bind or tmail_sub_login',
    );
  }
  if (expected !== slug) {
    throw newResolveError(
      ERR_PROFILE_MISMATCH,
      'profile folder slug does not match session sub_address',
      'Do not mix wallet folders; use wallet_slug from bind response',
    );
  }
  const metaSub = jsonStringField(paths.metaFile, 'sub_address');
  if (metaSub && metaSub !== sess.subAddress) {
    throw newResolveError(
      ERR_META_MISMATCH,
      'meta.json sub_address does not match session',
      'Re-run tmail_sub_bind or tmail_sub_login via MCP',
    );
  }
  if (!apiKeyPrefixMatch(sess, sel.apiKeyPrefix ?? '')) {
    throw newResolveError(
      ERR_API_KEY_PREFIX_MISMATCH,
      'api_key_prefix does not match session',
      'Remove api_key_prefix or pass the correct prefix from bind response',
    );
  }
  if (sel.subAddress?.trim() && sess.subAddress !== sel.subAddress.trim()) {
    throw newResolveError(ERR_SELECTOR_CONFLICT, 'sub_address does not match session', 'Use sub_address from bind response');
  }
}

export async function resolveValidated(
  cfg: Config,
  sel: ProfileSelector,
  policy: ResolvePolicy,
): Promise<ResolveResult> {
  const mainDir = absMainDir(cfg);
  const wallets = await listBoundWallets(mainDir);
  const slug = await resolveSlug(sel, policy, wallets);
  const paths = slug === '' ? unboundPaths(cfg.projectRoot, mainDir) : pathsForSlug(cfg, slug);
  const res: ResolveResult = { paths };

  if (!isBoundProfile(paths)) {
    if (policy === ResolvePolicy.StrictExplicit) {
      throw newResolveError(
        ERR_NO_WALLET_BOUND,
        'no bound wallet on disk',
        'Run tmail_sub_bind or tmail_sub_login first',
        wallets,
      );
    }
    return res;
  }

  const { session, sessionPath, error } = loadSessionData(paths.dir);
  if (!session) {
    if (policy === ResolvePolicy.StrictExplicit) {
      throw newResolveError(ERR_SESSION_MISSING, error ?? 'session missing', 'Run tmail_sub_bind or tmail_sub_login for this wallet');
    }
    return res;
  }
  res.session = session;
  res.sessionPath = sessionPath;
  crossValidate(sel, slug, paths, session);
  return res;
}
