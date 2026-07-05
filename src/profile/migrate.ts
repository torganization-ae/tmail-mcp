import fs from 'node:fs';
import path from 'node:path';
import { walletSlugFromSubAddress } from './tonaddr.js';

const LEGACY_PROFILE_PARENTS = ['_pending', 'default'] as const;

async function moveLegacyProfileFiles(mainDir: string, targetProfile: string): Promise<void> {
  for (const legacy of LEGACY_PROFILE_PARENTS) {
    const legacyProfile = path.join(mainDir, legacy, 'profile');
    try {
      const st = await fs.promises.stat(legacyProfile);
      if (!st.isDirectory()) continue;
    } catch {
      continue;
    }

    const entries = await fs.promises.readdir(legacyProfile, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) continue;
      const src = path.join(legacyProfile, e.name);
      const dst = path.join(targetProfile, e.name);
      try {
        await fs.promises.unlink(dst);
      } catch {
        // ignore missing
      }
      await fs.promises.rename(src, dst);
    }

    await fs.promises.rm(legacyProfile, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(path.join(mainDir, legacy), { recursive: true, force: true }).catch(() => {});
  }
}

/** Creates `<slug>/profile` after bind/login; migrates legacy `_pending/profile` or `default/profile` if present. */
export async function ensureWalletProfile(mainDir: string, subAddress: string): Promise<string> {
  const slug = walletSlugFromSubAddress(subAddress);
  const targetProfile = path.join(mainDir, slug, 'profile');

  await fs.promises.mkdir(targetProfile, { recursive: true, mode: 0o700 });

  const metaPath = path.join(targetProfile, 'meta.json');
  try {
    const b = await fs.promises.readFile(metaPath, 'utf8');
    const m = JSON.parse(b) as Record<string, unknown>;
    const existing = typeof m.sub_address === 'string' ? m.sub_address : '';
    if (existing.trim() && existing !== subAddress) {
      throw new Error(`slug collision: ${slug} already bound to different sub_address`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      if (err instanceof Error && err.message.includes('slug collision')) throw err;
    }
  }

  await moveLegacyProfileFiles(mainDir, targetProfile);

  return slug;
}
