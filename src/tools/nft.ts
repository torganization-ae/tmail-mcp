import { requireGate } from './guard.js';
import { sanitizeForTool, stripQuotePriceFields, withProfileContext } from './sanitize.js';
import { optionalString, requireString, requireBool, textError, textResult, type Runtime } from './runtime.js';

export async function nftQuoteMint(rt: Runtime, args: Record<string, unknown>) {
  requireGate(rt, 'mail_ops');
  let name: string;
  try {
    name = requireString(args, 'name');
  } catch {
    return textError('name is required');
  }
  const body: Record<string, unknown> = { name };
  const ref = optionalString(args, 'ref_addrs');
  if (ref) body.ref_addrs = ref;
  const out = await rt.client.post<Record<string, unknown>>('/api/nft/provide-mint', body);
  const sanitized = sanitizeForTool('tmail_nft_quote_mint', out) as Record<string, unknown>;
  if (sanitized.taken === true) stripQuotePriceFields(sanitized);
  return textResult(withProfileContext(rt.paths.walletSlug, rt.paths.dir, sanitized, rt.cfg.redactPaths));
}

export async function nftPrepareMint(rt: Runtime, args: Record<string, unknown>) {
  requireGate(rt, 'mail_ops');
  let name: string;
  let expected: string;
  try {
    name = requireString(args, 'name');
    if (!requireBool(args, 'user_confirmed')) {
      return textError('user_confirmed must be true after user approves total_nano');
    }
    expected = requireString(args, 'expected_total_nano');
  } catch (err) {
    return textError(err instanceof Error ? err.message : 'invalid args');
  }
  const body: Record<string, unknown> = { name };
  const ref = optionalString(args, 'ref_addrs');
  if (ref) body.ref_addrs = ref;
  const out = await rt.client.post<Record<string, unknown>>('/api/nft/provide-mint', body);
  if (out.taken === true) return textError('name is taken — pick another name and re-quote');
  const totalNano = typeof out.total_nano === 'string' ? out.total_nano : '';
  if (totalNano !== expected) {
    return textError(`total_nano mismatch (got "${totalNano}", expected "${expected}") — re-quote with tmail_nft_quote_mint`);
  }
  const sanitized = sanitizeForTool('tmail_nft_prepare_mint', out);
  if (sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)) {
    return textResult(withProfileContext(rt.paths.walletSlug, rt.paths.dir, sanitized as Record<string, unknown>, rt.cfg.redactPaths));
  }
  return textResult(sanitized);
}
