import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  getAgentDisplayName,
  MCP_HOST_SPECS,
  MCP_CANONICAL_ID_BY_CONFIG_PATH,
  MCP_HOST_ALIASES,
  MCP_MANUAL_SETUP_HINT,
  MCP_OTHER_HOST_ID,
  isManualMcpHostId,
  normalizeMcpHostId,
  type McpConfigFormat,
  type McpHostSpec,
  type McpRootKey,
  type McpWriterKind,
} from './mcp-by-agent.js';
import { detectAgentInstalledSync, isAgentType } from './skills-agents/agents-detect.js';
import type { AgentDetectCtx } from './skills-agents/types.js';

export type DetectCtx = AgentDetectCtx;

export interface McpHost {
  id: string;
  label: string;
  configPath: string;
  rootKey: McpRootKey;
  format: McpConfigFormat;
  writer: McpWriterKind;
  initWritable: boolean;
  needsStdioType?: boolean;
  note?: string;
  detectInstalled: (ctx: DetectCtx) => boolean;
}

export interface McpHostLock {
  hosts: string[];
}

export const HOST_LOCK_FILE = '.tmail/host-lock.json';

function exists(base: string, rel = ''): boolean {
  const target = rel ? path.join(base, rel) : base;
  return fs.existsSync(target);
}

function isVsCodeInstalled(ctx: DetectCtx): boolean {
  if (ctx.platform === 'darwin') return exists(ctx.home, 'Library/Application Support/Code');
  if (ctx.platform === 'win32') return exists(ctx.home, 'AppData/Roaming/Code');
  return exists(ctx.home, '.config/Code');
}

function detectInstalledFor(id: string): (ctx: DetectCtx) => boolean {
  const canonical = normalizeMcpHostId(id);
  if (canonical === 'vscode') {
    return (ctx) => isVsCodeInstalled(ctx) || detectAgentInstalledSync('github-copilot', ctx);
  }
  if (isAgentType(canonical)) {
    return (ctx) => detectAgentInstalledSync(canonical, ctx);
  }
  return () => false;
}

function buildHost(id: string, spec: McpHostSpec): McpHost {
  return {
    id,
    label: getAgentDisplayName(id),
    configPath: spec.configPath,
    rootKey: spec.rootKey,
    format: spec.format,
    writer: spec.writer,
    initWritable: spec.initWritable,
    needsStdioType: spec.needsStdioType,
    note: spec.note,
    detectInstalled: detectInstalledFor(id),
  };
}

export const MCP_HOSTS: McpHost[] = Object.entries(MCP_HOST_SPECS).map(([id, spec]) =>
  buildHost(id, spec),
);

const HOST_BY_ID = new Map(MCP_HOSTS.map((host) => [host.id, host]));

export function defaultDetectCtx(): DetectCtx {
  const home = os.homedir();
  return {
    home,
    platform: process.platform,
    configHome: process.env.XDG_CONFIG_HOME?.trim() || path.join(home, '.config'),
    cwd: process.cwd(),
  };
}

export function getMcpHost(id: string): McpHost | undefined {
  return HOST_BY_ID.get(normalizeMcpHostId(id));
}

export function listInitWritableHosts(): McpHost[] {
  const byPath = new Map<string, McpHost>();
  for (const host of MCP_HOSTS.filter((h) => h.initWritable)) {
    const canonicalId = MCP_CANONICAL_ID_BY_CONFIG_PATH[host.configPath];
    const existing = byPath.get(host.configPath);
    if (!existing) {
      byPath.set(host.configPath, host);
      continue;
    }
    if (canonicalId === host.id) {
      byPath.set(host.configPath, host);
    }
  }
  return [...byPath.values()];
}

function canonicalHost(host: McpHost): McpHost {
  const canonicalId = MCP_CANONICAL_ID_BY_CONFIG_PATH[host.configPath];
  if (!canonicalId || canonicalId === host.id) return host;
  return getMcpHost(canonicalId) ?? host;
}

export function detectExistingProjectMcpConfigs(projectRoot: string): McpHost[] {
  const resolvedRoot = path.resolve(projectRoot);
  const found = new Map<string, McpHost>();
  for (const host of listInitWritableHosts()) {
    if (found.has(host.configPath)) continue;
    if (fs.existsSync(path.join(resolvedRoot, host.configPath))) {
      found.set(host.configPath, canonicalHost(host));
    }
  }
  return [...found.values()];
}

export function detectInstalledMcpHosts(ctx: DetectCtx = defaultDetectCtx()): McpHost[] {
  const found = new Map<string, McpHost>();
  for (const host of listInitWritableHosts()) {
    if (!host.detectInstalled(ctx)) continue;
    if (found.has(host.configPath)) continue;
    found.set(host.configPath, host);
  }
  return [...found.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function readHostLock(projectRoot: string): McpHostLock | undefined {
  const lockPath = path.join(path.resolve(projectRoot), HOST_LOCK_FILE);
  if (!fs.existsSync(lockPath)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as McpHostLock;
    if (!Array.isArray(parsed.hosts) || parsed.hosts.length === 0) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function writeHostLock(projectRoot: string, hostIds: string[]): void {
  const lockPath = path.join(path.resolve(projectRoot), HOST_LOCK_FILE);
  const hosts = hostIds.map(normalizeMcpHostId).filter((id) => !isManualMcpHostId(id));
  if (hosts.length === 0) {
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
    return;
  }
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const payload: McpHostLock = { hosts };
  fs.writeFileSync(lockPath, `${JSON.stringify(payload, null, 2)}\n`);
}

export function targetsFromHostIds(hostIds: string[]): McpHost[] {
  const ids = hostIds.map(normalizeMcpHostId).filter((id) => !isManualMcpHostId(id));
  if (ids.length === 0) return [];

  const targets: McpHost[] = [];
  for (const id of ids) {
    const host = getMcpHost(id);
    if (!host?.initWritable) {
      const known = listInitWritableHosts()
        .map((h) => h.id)
        .concat(MCP_OTHER_HOST_ID, ...Object.keys(MCP_HOST_ALIASES))
        .sort()
        .join(', ');
      throw new Error(`unknown MCP host: ${id} (known: ${known})`);
    }
    targets.push(host);
  }
  return targets;
}

export function parseHostIds(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((part) => normalizeMcpHostId(part.trim()))
    .filter(Boolean);
}

export function resolveMcpInitTargets(
  projectRoot: string,
  opts: {
    explicitConfig?: string;
    explicitRootKey?: string;
    explicitHostIds?: string[];
    useHostLock?: boolean;
  } = {},
): McpHost[] {
  if (opts.explicitConfig) {
    return [
      {
        id: 'custom',
        label: 'custom',
        configPath: opts.explicitConfig,
        rootKey: (opts.explicitRootKey ?? 'mcpServers') as McpRootKey,
        writer: 'json-root',
        format: 'json',
        initWritable: true,
        detectInstalled: () => false,
      },
    ];
  }

  const existing = detectExistingProjectMcpConfigs(projectRoot);
  if (existing.length > 0) return existing;

  if (opts.explicitHostIds?.length) {
    return targetsFromHostIds(opts.explicitHostIds);
  }

  if (opts.useHostLock !== false) {
    const lock = readHostLock(projectRoot);
    if (lock?.hosts.length) {
      return targetsFromHostIds(lock.hosts);
    }
  }

  return [];
}

export function formatMcpHostHints(): string {
  const writable = listInitWritableHosts()
    .map((h) => `  - ${h.label}: ${h.configPath} (${h.rootKey}, ${h.format}, ${h.writer})`)
    .join('\n');
  return `${writable}\n  - Other (manual setup): use --host other or pick in init menu\n\n${MCP_MANUAL_SETUP_HINT}`;
}
