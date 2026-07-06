import fs from 'node:fs';
import path from 'node:path';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { type McpWriterKind } from './mcp-by-agent.js';

async function mergeAmpSettings(opts: {
  resolved: string;
  apiUrl?: string;
  preferIncomingEnv?: string[];
}): Promise<string> {
  let cfg: Record<string, unknown> = {};
  if (fs.existsSync(opts.resolved)) {
    cfg = JSON.parse(fs.readFileSync(opts.resolved, 'utf8')) as Record<string, unknown>;
  }
  const amp = { ...((cfg.amp as Record<string, unknown>) ?? {}) };
  const servers = { ...((amp.mcpServers as Record<string, unknown>) ?? {}) };
  const existing = (servers.tmail as Record<string, unknown>) ?? {};
  const oldEnv = (existing.env as Record<string, string>) ?? {};
  servers.tmail = {
    ...existing,
    command: 'npx',
    args: ['-y', '@tmail/mcp'],
    env: mergeEnv(oldEnv, buildEnv(opts.apiUrl), opts.preferIncomingEnv ?? []),
  };
  amp.mcpServers = servers;
  cfg.amp = amp;
  await writeAtomic(opts.resolved, `${JSON.stringify(cfg, null, 2)}\n`);
  return opts.resolved;
}

const DEFAULT_ENV: Record<string, string> = {
  TMAIL_API_URL: '',
  TMAIL_MAIN_DIR: '.tmail',
  TMAIL_BIND_INVITE: '',
};

function mergeEnv(
  oldEnv: Record<string, string>,
  newEnv: Record<string, string>,
  preferIncoming: string[] = [],
): Record<string, string> {
  const prefer = new Set(preferIncoming);
  const result = { ...newEnv };
  for (const [key, value] of Object.entries(oldEnv || {})) {
    if (key === 'TMAIL_PROJECT_ROOT') continue;
    if (prefer.has(key)) continue;
    if (String(value ?? '').trim() !== '') result[key] = value;
  }
  delete result.TMAIL_PROJECT_ROOT;
  return result;
}

function buildEnv(apiUrl?: string): Record<string, string> {
  const env = { ...DEFAULT_ENV };
  if (apiUrl) env.TMAIL_API_URL = apiUrl;
  return env;
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}`;
  await fs.promises.writeFile(tmp, content);
  await fs.promises.rename(tmp, filePath);
}

function assertInsideProject(projectRoot: string, resolved: string, force?: boolean): void {
  const rel = path.relative(projectRoot, resolved);
  if (!force && (rel.startsWith('..') || path.isAbsolute(rel))) {
    throw new Error(`config path must be inside project root (${projectRoot}); use --force to override`);
  }
}

function mergeJsonRoot(
  cfg: Record<string, unknown>,
  rootKey: string,
  serverKey: string,
  serverBlock: Record<string, unknown>,
  preferIncomingEnv: string[],
): Record<string, unknown> {
  const root = { ...cfg };
  const servers = { ...((root[rootKey] as Record<string, unknown>) ?? {}) };
  const existing = (servers[serverKey] as Record<string, unknown>) ?? {};
  const oldEnv = (existing.env as Record<string, string>) ?? {};
  const newEnv = (serverBlock.env as Record<string, string>) ?? {};
  servers[serverKey] = {
    ...existing,
    ...serverBlock,
    env: mergeEnv(oldEnv, newEnv, preferIncomingEnv),
  };
  root[rootKey] = servers;
  return root;
}

function buildStdioJsonBlock(apiUrl?: string, needsStdioType?: boolean): Record<string, unknown> {
  const block: Record<string, unknown> = {
    command: 'npx',
    args: ['-y', '@tmail/mcp'],
    env: buildEnv(apiUrl),
  };
  if (needsStdioType) block.type = 'stdio';
  return block;
}

async function mergeJsonRootFile(opts: {
  resolved: string;
  rootKey: string;
  needsStdioType?: boolean;
  apiUrl?: string;
  preferIncomingEnv?: string[];
}): Promise<string> {
  let cfg: Record<string, unknown> = {};
  if (fs.existsSync(opts.resolved)) {
    cfg = JSON.parse(fs.readFileSync(opts.resolved, 'utf8')) as Record<string, unknown>;
  }
  const merged = mergeJsonRoot(
    cfg,
    opts.rootKey,
    'tmail',
    buildStdioJsonBlock(opts.apiUrl, opts.needsStdioType),
    opts.preferIncomingEnv ?? [],
  );
  await writeAtomic(opts.resolved, `${JSON.stringify(merged, null, 2)}\n`);
  return opts.resolved;
}

async function mergeCodexToml(opts: {
  resolved: string;
  apiUrl?: string;
  preferIncomingEnv?: string[];
}): Promise<string> {
  type CodexRoot = { mcp_servers?: Record<string, Record<string, unknown>> };
  let root: CodexRoot = {};
  if (fs.existsSync(opts.resolved)) {
    root = parseToml(fs.readFileSync(opts.resolved, 'utf8')) as CodexRoot;
  }
  if (!root.mcp_servers) root.mcp_servers = {};
  const existing = root.mcp_servers.tmail ?? {};
  const oldEnv = (existing.env as Record<string, string>) ?? {};
  root.mcp_servers.tmail = {
    command: 'npx',
    args: ['-y', '@tmail/mcp'],
    enabled: true,
    env: mergeEnv(oldEnv, buildEnv(opts.apiUrl), opts.preferIncomingEnv ?? []),
  };
  await writeAtomic(opts.resolved, `${stringifyToml(root)}\n`);
  return opts.resolved;
}

async function mergeOpenCodeJson(opts: {
  resolved: string;
  apiUrl?: string;
  preferIncomingEnv?: string[];
}): Promise<string> {
  let root: Record<string, unknown> = {};
  if (fs.existsSync(opts.resolved)) {
    root = JSON.parse(fs.readFileSync(opts.resolved, 'utf8')) as Record<string, unknown>;
  }
  const mcp = { ...((root.mcp as Record<string, unknown>) ?? {}) };
  const existing = (mcp.tmail as Record<string, unknown>) ?? {};
  const oldEnv = (existing.environment as Record<string, string>) ?? {};
  mcp.tmail = {
    type: 'local',
    command: ['npx', '-y', '@tmail/mcp'],
    enabled: true,
    environment: mergeEnv(oldEnv, buildEnv(opts.apiUrl), opts.preferIncomingEnv ?? []),
  };
  root.mcp = mcp;
  if (root.$schema === undefined) {
    root.$schema = 'https://opencode.ai/config.json';
  }
  await writeAtomic(opts.resolved, `${JSON.stringify(root, null, 2)}\n`);
  return opts.resolved;
}

async function mergeZedContextServers(opts: {
  resolved: string;
  apiUrl?: string;
  preferIncomingEnv?: string[];
}): Promise<string> {
  let root: Record<string, unknown> = {};
  if (fs.existsSync(opts.resolved)) {
    root = JSON.parse(fs.readFileSync(opts.resolved, 'utf8')) as Record<string, unknown>;
  }
  const servers = { ...((root.context_servers as Record<string, unknown>) ?? {}) };
  const existing = (servers.tmail as Record<string, unknown>) ?? {};
  const oldEnv = (existing.env as Record<string, string>) ?? {};
  servers.tmail = {
    source: 'custom',
    command: 'npx',
    args: ['-y', '@tmail/mcp'],
    env: mergeEnv(oldEnv, buildEnv(opts.apiUrl), opts.preferIncomingEnv ?? []),
  };
  root.context_servers = servers;
  await writeAtomic(opts.resolved, `${JSON.stringify(root, null, 2)}\n`);
  return opts.resolved;
}

export async function mergeTmailMcpConfig(opts: {
  projectRoot: string;
  configPath: string;
  rootKey: string;
  writer: McpWriterKind;
  needsStdioType?: boolean;
  apiUrl?: string;
  force?: boolean;
  preferIncomingEnv?: string[];
}): Promise<string> {
  const projectRoot = path.resolve(opts.projectRoot);
  const resolved = path.resolve(projectRoot, opts.configPath);
  assertInsideProject(projectRoot, resolved, opts.force);

  switch (opts.writer) {
    case 'toml-codex':
      return mergeCodexToml({
        resolved,
        apiUrl: opts.apiUrl,
        preferIncomingEnv: opts.preferIncomingEnv,
      });
    case 'json-opencode':
      return mergeOpenCodeJson({
        resolved,
        apiUrl: opts.apiUrl,
        preferIncomingEnv: opts.preferIncomingEnv,
      });
    case 'json-zed':
      return mergeZedContextServers({
        resolved,
        apiUrl: opts.apiUrl,
        preferIncomingEnv: opts.preferIncomingEnv,
      });
    case 'json-amp':
      return mergeAmpSettings({
        resolved,
        apiUrl: opts.apiUrl,
        preferIncomingEnv: opts.preferIncomingEnv,
      });
    case 'json-root':
    default:
      return mergeJsonRootFile({
        resolved,
        rootKey: opts.rootKey,
        needsStdioType: opts.needsStdioType,
        apiUrl: opts.apiUrl,
        preferIncomingEnv: opts.preferIncomingEnv,
      });
  }
}
