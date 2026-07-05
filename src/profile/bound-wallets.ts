import fs from 'node:fs';
import path from 'node:path';
import { loadSessionData } from './session.js';
import { isWalletSlug } from './tonaddr.js';
import type { WalletSummary } from './errors.js';

export function countBoundWalletsSync(mainDir: string): number {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(mainDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return 0;
    }
    throw err;
  }
  let count = 0;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const name = e.name.toLowerCase();
    if (name === '_pending' || name === 'default' || name === 'bin') continue;
    if (!isWalletSlug(name)) continue;
    const profileDir = path.join(mainDir, name, 'profile');
    const { session } = loadSessionData(profileDir);
    if (!session || !session.subAddress.trim()) continue;
    count++;
  }
  return count;
}

export async function listBoundWallets(mainDir: string): Promise<WalletSummary[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(mainDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
  const out: WalletSummary[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const name = e.name.toLowerCase();
    if (name === '_pending' || name === 'default' || name === 'bin') continue;
    if (!isWalletSlug(name)) continue;
    const profileDir = path.join(mainDir, name, 'profile');
    const { session } = loadSessionData(profileDir);
    if (!session || !session.subAddress.trim()) continue;
    let prefix = session.apiKeyPrefix;
    if (!prefix && session.apiKey.length >= 8) {
      prefix = session.apiKey.slice(0, 8);
    }
    out.push({
      wallet_slug: name,
      sub_address: session.subAddress,
      api_key_prefix: prefix,
      profile_dir: profileDir,
    });
  }
  out.sort((a, b) => a.wallet_slug.localeCompare(b.wallet_slug));
  return out;
}
