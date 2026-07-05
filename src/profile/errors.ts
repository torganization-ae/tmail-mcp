export const ERR_MULTI_WALLET_AMBIGUOUS = 'MULTI_WALLET_AMBIGUOUS';
export const ERR_SELECTOR_REQUIRED = 'SELECTOR_REQUIRED';
export const ERR_NO_WALLET_BOUND = 'NO_WALLET_BOUND';
export const ERR_WALLET_NOT_BOUND = 'WALLET_NOT_BOUND';
export const ERR_BIND_REQUIRES_UNBOUND = 'BIND_REQUIRES_UNBOUND';
export const ERR_PROFILE_MISMATCH = 'PROFILE_MISMATCH';
export const ERR_META_MISMATCH = 'META_MISMATCH';
export const ERR_SELECTOR_CONFLICT = 'SELECTOR_CONFLICT';
export const ERR_API_KEY_PREFIX_MISMATCH = 'API_KEY_PREFIX_MISMATCH';
export const ERR_INVALID_WALLET_SLUG = 'INVALID_WALLET_SLUG';
export const ERR_PROOF_SUB_MISMATCH = 'PROOF_SUB_MISMATCH';
export const ERR_E2EE_ALREADY_REGISTERED = 'E2EE_ALREADY_REGISTERED';
export const ERR_SESSION_MISSING = 'SESSION_MISSING';

export interface WalletSummary {
  wallet_slug: string;
  sub_address?: string;
  api_key_prefix?: string;
  profile_dir?: string;
}

export class ResolveError extends Error {
  code: string;
  action: string;
  availableWallets: WalletSummary[];

  constructor(code: string, message: string, action: string, wallets: WalletSummary[] = []) {
    super(`${code}: ${message}`);
    this.name = 'ResolveError';
    this.code = code;
    this.action = action;
    this.availableWallets = wallets;
  }
}

export function newResolveError(
  code: string,
  message: string,
  action: string,
  wallets: WalletSummary[] = [],
): ResolveError {
  return new ResolveError(code, message, action, wallets);
}
