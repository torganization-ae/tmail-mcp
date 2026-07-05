import fs from 'node:fs';
import path from 'node:path';

export interface SessionData {
  subAddress: string;
  apiKey: string;
  apiKeyPrefix: string;
}

export interface Session extends SessionData {
  bound?: boolean;
  accessToken?: string;
  refreshToken?: string;
}

function sanitizeRuntimeId(argv0: string): string {
  const base = path.basename(argv0).toLowerCase();
  const cleaned = [...base]
    .map((ch) => (/[a-z0-9_-]/.test(ch) ? ch : '-'))
    .join('');
  return cleaned && cleaned !== '.' ? cleaned : 'default';
}

function readSessionDataFile(filePath: string): SessionData | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const s: SessionData = {
    subAddress: typeof parsed.sub_address === 'string' ? parsed.sub_address : '',
    apiKey: typeof parsed.api_key === 'string' ? parsed.api_key : '',
    apiKeyPrefix:
      typeof parsed.api_key_prefix === 'string'
        ? parsed.api_key_prefix
        : typeof parsed.key_prefix === 'string'
          ? parsed.key_prefix
          : '',
  };
  return s;
}

export function loadSessionData(
  profileDir: string,
  argv0 = process.argv[0] ?? 'node',
): { session: SessionData | null; sessionPath: string; error?: string } {
  const runtimeId = sanitizeRuntimeId(argv0);
  const candidates = [
    path.join(profileDir, `session.${runtimeId}.json`),
    path.join(profileDir, 'session.json'),
  ];
  for (const p of candidates) {
    const s = readSessionDataFile(p);
    if (s && s.apiKey.trim()) {
      if (s.apiKey.startsWith('tmail_o_')) {
        return {
          session: null,
          sessionPath: p,
          error: 'owner api_key (tmail_o_*) must not be used by sub-agent MCP',
        };
      }
      if (s.apiKey.startsWith('tmail_i_')) {
        return {
          session: null,
          sessionPath: p,
          error: 'bind invite key (tmail_i_*) must not be persisted as session api_key',
        };
      }
      return { session: s, sessionPath: p };
    }
  }
  return {
    session: null,
    sessionPath: candidates[candidates.length - 1],
    error: `no valid session with api_key in ${profileDir}`,
  };
}

export async function writeSession(filePath: string, session: Session): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const payload = {
    bound: session.bound,
    sub_address: session.subAddress,
    api_key: session.apiKey,
    api_key_prefix: session.apiKeyPrefix,
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  };
  const b = JSON.stringify(payload, null, 2) + '\n';
  const tmp = `${filePath}.tmp`;
  await fs.promises.writeFile(tmp, b, { mode: 0o600 });
  await fs.promises.rename(tmp, filePath);
}

export function apiKeyPrefixMatch(sess: SessionData, want: string): boolean {
  const trimmed = want.trim();
  if (!trimmed) return true;
  if (sess.apiKeyPrefix) {
    return sess.apiKeyPrefix === trimmed;
  }
  const key = sess.apiKey.trim();
  return key.length >= 8 && key.slice(0, 8) === trimmed;
}
