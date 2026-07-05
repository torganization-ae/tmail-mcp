import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @deprecated MCP env — use cwd / auto-detect; kept for legacy configs only */
export const ENV_PROJECT_ROOT = 'TMAIL_PROJECT_ROOT';
export const ENV_API_URL = 'TMAIL_API_URL';
/** Storage root: relative to project cwd (default `.tmail`) or absolute path */
export const ENV_MAIN_DIR = 'TMAIL_MAIN_DIR';
export const ENV_PROFILE_DIR = 'TMAIL_PROFILE_DIR';
export const ENV_BIND_INVITE = 'TMAIL_BIND_INVITE';
export const ENV_E2EE_PASSPHRASE = 'TMAIL_E2EE_PASSPHRASE';
export const ENV_MCP_TOKEN = 'TMAIL_MCP_TOKEN';
export const ENV_REDACT_PATHS = 'TMAIL_REDACT_PATHS';
export const ENV_SKIP_GITIGNORE_CHECK = 'TMAIL_SKIP_GITIGNORE_CHECK';
export const ENV_FILE_NAME = '.env.tmail';

export interface Config {
  /** Workspace root for AGENTS.md / .gitignore (derived, not MCP env) */
  projectRoot: string;
  apiUrl: string;
  /** Absolute storage root (<mainDir>/<wallet_slug>/profile) */
  mainDir: string;
  /** Display name for gitignore hints (e.g. `.tmail`) */
  mainDirRel: string;
  bindInvite: string;
  e2eePassphrase: string;
  mcpToken: string;
  redactPaths: boolean;
  skipGitignoreCheck: boolean;
}

function findProjectRootByStorageDir(storageDirName: string): string {
  let dir = process.cwd();
  for (;;) {
    const candidate = path.join(dir, storageDirName);
    try {
      if (fs.statSync(candidate).isDirectory()) {
        return dir;
      }
    } catch {
      // not found
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return '';
    }
    dir = parent;
  }
}

/** Resolve projectRoot + absolute mainDir from TMAIL_MAIN_DIR (relative or absolute). */
export function resolveStorageLayout(
  mainDirRaw: string,
  legacyProjectRoot = '',
): Pick<Config, 'projectRoot' | 'mainDir' | 'mainDirRel'> {
  const raw = mainDirRaw.trim() || '.tmail';

  if (path.isAbsolute(raw)) {
    const mainDir = path.resolve(raw);
    const projectRoot = legacyProjectRoot.trim()
      ? path.resolve(legacyProjectRoot)
      : path.dirname(mainDir);
    const mainDirRel = path.basename(mainDir) || '.tmail';
    return { projectRoot, mainDir, mainDirRel };
  }

  let projectRoot = legacyProjectRoot.trim() || findProjectRootByStorageDir(raw) || process.cwd();
  projectRoot = path.resolve(projectRoot);
  const mainDir = path.join(projectRoot, raw);
  return { projectRoot, mainDir, mainDirRel: raw };
}

function loadEnvFile(envPath: string, cfg: { apiUrl: string; mainDirRel: string; bindInvite: string }): void {
  let content: string;
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch {
    return;
  }
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    switch (key) {
      case ENV_API_URL:
        if (!cfg.apiUrl) cfg.apiUrl = val;
        break;
      case ENV_MAIN_DIR:
        if (!cfg.mainDirRel) cfg.mainDirRel = val;
        break;
      case ENV_BIND_INVITE:
        if (!cfg.bindInvite) cfg.bindInvite = val;
        break;
    }
  }
}

export function loadConfig(): Config {
  const legacyRoot = process.env[ENV_PROJECT_ROOT]?.trim() ?? '';
  const provisionalRoot =
    legacyRoot || findProjectRootByStorageDir('.tmail') || process.cwd();

  const partial = {
    apiUrl: process.env[ENV_API_URL]?.trim() ?? '',
    mainDirRel: process.env[ENV_MAIN_DIR]?.trim() ?? '',
    bindInvite: process.env[ENV_BIND_INVITE]?.trim() ?? '',
  };

  loadEnvFile(path.join(path.resolve(provisionalRoot), ENV_FILE_NAME), partial);

  const layout = resolveStorageLayout(partial.mainDirRel || '.tmail', legacyRoot);

  const redactRaw = process.env[ENV_REDACT_PATHS]?.trim();
  const redactPaths = redactRaw !== '0' && redactRaw !== 'false';

  return {
    projectRoot: layout.projectRoot,
    apiUrl: partial.apiUrl,
    mainDir: layout.mainDir,
    mainDirRel: layout.mainDirRel,
    bindInvite: partial.bindInvite,
    e2eePassphrase: process.env[ENV_E2EE_PASSPHRASE]?.trim() ?? '',
    mcpToken: process.env[ENV_MCP_TOKEN]?.trim() ?? '',
    redactPaths,
    skipGitignoreCheck: process.env[ENV_SKIP_GITIGNORE_CHECK]?.trim() === '1',
  };
}

export function packageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const pkgPath = path.join(dir, 'package.json');
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string };
      if (pkg.name === '@tmail/mcp') {
        return dir;
      }
    } catch {
      // not a package root — walk up
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('@tmail/mcp package root not found');
}
