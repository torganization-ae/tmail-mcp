import path from 'node:path';
import type { Config } from '../config/env.js';

export interface ProfilePaths {
  projectRoot: string;
  mainDir: string;
  walletSlug: string;
  dir: string;
  sessionFile: string;
  metaFile: string;
  e2eeFile: string;
  e2eePassphraseFile: string;
  e2eePassphraseMetaFile: string;
}

export function absMainDir(cfg: Config): string {
  if (path.isAbsolute(cfg.mainDir)) {
    return cfg.mainDir;
  }
  return path.join(cfg.projectRoot, cfg.mainDir);
}

export function pathsForSlug(cfg: Config, slug: string): ProfilePaths {
  return pathsForMainDir(cfg.projectRoot, absMainDir(cfg), slug);
}

export function pathsForMainDir(projectRoot: string, mainDir: string, slug: string): ProfilePaths {
  const dir = path.join(mainDir, slug, 'profile');
  return {
    projectRoot,
    mainDir,
    walletSlug: slug,
    dir,
    sessionFile: path.join(dir, 'session.json'),
    metaFile: path.join(dir, 'meta.json'),
    e2eeFile: path.join(dir, 'e2ee.json'),
    e2eePassphraseFile: path.join(dir, 'e2ee.passphrase'),
    e2eePassphraseMetaFile: path.join(dir, 'e2ee.passphrase.meta.json'),
  };
}

/** Pre-bind / gate-only: no on-disk profile until bind or login creates `<slug>/profile`. */
export function unboundPaths(projectRoot: string, mainDir: string): ProfilePaths {
  return {
    projectRoot,
    mainDir,
    walletSlug: '',
    dir: '',
    sessionFile: '',
    metaFile: '',
    e2eeFile: '',
    e2eePassphraseFile: '',
    e2eePassphraseMetaFile: '',
  };
}

export function isBoundProfile(paths: ProfilePaths): boolean {
  return paths.walletSlug.trim() !== '' && paths.dir.trim() !== '';
}

export function profileDirForSlug(mainDir: string, slug: string): string {
  return path.join(mainDir, slug, 'profile');
}
