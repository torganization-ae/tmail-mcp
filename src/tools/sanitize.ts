const SENSITIVE_FIELDS = [
  'api_key',
  'refresh_token',
  'access_token',
  'enc_priv_key_base64',
  'secret',
  'previous_secret',
  'previous_secret_valid_until',
  'new_secret',
  'passphrase',
  'pbkdf2_salt',
];

export function stripSensitiveFields(m: Record<string, unknown>): void {
  for (const k of SENSITIVE_FIELDS) {
    delete m[k];
  }
}

export function sanitizeForTool(toolName: string, v: unknown): unknown {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    return v;
  }
  const m = { ...(v as Record<string, unknown>) };
  stripSensitiveFields(m);
  if (toolName === 'tmail_nft_quote_mint') {
    delete m.transactions;
  }
  return m;
}

export function stripQuotePriceFields(m: Record<string, unknown>): void {
  for (const k of ['price_nano', 'price_full', 'gas_nano', 'referral_nano', 'total_nano']) {
    delete m[k];
  }
}

export function withProfileContext(
  walletSlug: string,
  profileDir: string,
  out: Record<string, unknown>,
  redactPaths = true,
): Record<string, unknown> {
  const ctx: Record<string, unknown> = { wallet_slug: walletSlug };
  if (!redactPaths && profileDir.trim()) {
    ctx.profile_dir = profileDir;
  }
  return {
    ...out,
    profile_context: ctx,
  };
}
