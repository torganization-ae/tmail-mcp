import fs from 'node:fs';

const HEX64 = /^[0-9a-f]{64}$/i;

export function normalizeAddress(addr: string): { raw: string; slug: string } {
  const trimmed = addr.trim().replace(/\s/g, '');
  if (!trimmed) {
    throw new Error('address is empty');
  }
  if (HEX64.test(trimmed)) {
    const slug = trimmed.toLowerCase();
    return { raw: `0:${slug}`, slug };
  }
  if (trimmed.includes(':')) {
    const idx = trimmed.indexOf(':');
    const workchain = trimmed.slice(0, idx);
    const hex = trimmed.slice(idx + 1).toLowerCase();
    if (!hex) {
      throw new Error(`failed to parse address: ${addr}`);
    }
    return { raw: `${workchain}:${hex}`, slug: hex };
  }
  throw new Error(`failed to parse address: ${addr}`);
}

export function walletSlugFromSubAddress(subAddress: string): string {
  try {
    const { slug } = normalizeAddress(subAddress);
    return slug;
  } catch (err) {
    throw new Error(`invalid sub_address: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function walletSlugFromHexSlug(walletSlug: string): string {
  const s = walletSlug.trim().toLowerCase();
  if (!s) {
    throw new Error('wallet slug is empty');
  }
  try {
    const { slug } = normalizeAddress(`0:${s}`);
    return slug;
  } catch {
    throw new Error('invalid wallet_slug');
  }
}

export function isWalletSlug(name: string): boolean {
  try {
    walletSlugFromHexSlug(name);
    return HEX64.test(name.toLowerCase());
  } catch {
    return false;
  }
}

export function addressesEqual(a: string, b: string): void {
  const rawA = normalizeAddress(a).raw;
  const rawB = normalizeAddress(b).raw;
  if (rawA !== rawB) {
    throw new Error(`proof address ${rawA} does not match API sub_address ${rawB}`);
  }
}
