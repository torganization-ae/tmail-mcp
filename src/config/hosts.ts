import fs from 'node:fs';
import path from 'node:path';

export interface McpHostEntry {
  id: string;
  label: string;
  config_path: string | { darwin?: string; linux?: string; windows?: string };
  root_key: string;
}

export interface McpHostTarget {
  id: string;
  label: string;
  configPath: string;
  rootKey: string;
}

export const MCP_HOSTS: McpHostEntry[] = [
  { id: 'cursor', label: 'Cursor', config_path: '.cursor/mcp.json', root_key: 'mcpServers' },
  { id: 'vscode', label: 'VS Code', config_path: '.vscode/mcp.json', root_key: 'servers' },
  { id: 'windsurf', label: 'Windsurf', config_path: '.windsurf/mcp.json', root_key: 'mcpServers' },
  { id: 'cline', label: 'Cline', config_path: '.cline/mcp.json', root_key: 'mcpServers' },
  { id: 'continue', label: 'Continue', config_path: '.continue/mcp.json', root_key: 'mcpServers' },
  { id: 'opencode', label: 'OpenCode', config_path: '.opencode/mcp.json', root_key: 'mcpServers' },
  { id: 'codex', label: 'Codex CLI', config_path: '.codex/mcp.json', root_key: 'mcpServers' },
  { id: 'gemini', label: 'Gemini CLI', config_path: '.gemini/mcp.json', root_key: 'mcpServers' },
  {
    id: 'claude',
    label: 'Claude Desktop',
    config_path: {
      darwin: 'Library/Application Support/Claude/claude_desktop_config.json',
      linux: '.config/Claude/claude_desktop_config.json',
      windows: 'AppData/Roaming/Claude/claude_desktop_config.json',
    },
    root_key: 'mcpServers',
  },
];

const PROJECT_MARKER_ORDER: Array<{ dir: string; hostId: string }> = [
  { dir: '.cursor', hostId: 'cursor' },
  { dir: '.vscode', hostId: 'vscode' },
  { dir: '.windsurf', hostId: 'windsurf' },
  { dir: '.cline', hostId: 'cline' },
  { dir: '.continue', hostId: 'continue' },
  { dir: '.opencode', hostId: 'opencode' },
  { dir: '.codex', hostId: 'codex' },
  { dir: '.gemini', hostId: 'gemini' },
];

export function resolveHostConfigPath(
  entry: McpHostEntry,
  platform: NodeJS.Platform = process.platform,
): string {
  if (typeof entry.config_path === 'string') {
    return entry.config_path;
  }
  return entry.config_path[platform as keyof typeof entry.config_path] ?? entry.config_path.linux ?? '';
}

export function isProjectScopedHost(entry: McpHostEntry): boolean {
  return typeof entry.config_path === 'string';
}

export function listProjectMcpHosts(): McpHostEntry[] {
  return MCP_HOSTS.filter(isProjectScopedHost);
}

function hostById(id: string): McpHostEntry | undefined {
  return MCP_HOSTS.find((h) => h.id === id);
}

export function toMcpHostTarget(entry: McpHostEntry): McpHostTarget {
  return {
    id: entry.id,
    label: entry.label,
    configPath: resolveHostConfigPath(entry),
    rootKey: entry.root_key,
  };
}

export function detectExistingProjectMcpConfigs(projectRoot: string): McpHostTarget[] {
  const resolvedRoot = path.resolve(projectRoot);
  const found: McpHostTarget[] = [];
  for (const host of listProjectMcpHosts()) {
    const configPath = resolveHostConfigPath(host);
    if (fs.existsSync(path.join(resolvedRoot, configPath))) {
      found.push(toMcpHostTarget(host));
    }
  }
  return found;
}

export function inferMcpHostFromRuntime(): McpHostEntry | undefined {
  const argv0 = (process.argv[0] || '').toLowerCase();
  const env = process.env;

  if (env.CURSOR_TRACE_ID || env.CURSOR_AGENT || argv0.includes('cursor')) {
    return hostById('cursor');
  }
  if (env.TERM_PROGRAM === 'vscode' || env.VSCODE_IPC_HOOK || env.VSCODE_CWD || argv0.includes('code')) {
    return hostById('vscode');
  }
  if (env.WINDSURF || argv0.includes('windsurf')) {
    return hostById('windsurf');
  }
  if (argv0.includes('codex')) {
    return hostById('codex');
  }
  if (argv0.includes('gemini')) {
    return hostById('gemini');
  }
  return undefined;
}

export function inferMcpHostsFromProjectMarkers(projectRoot: string): McpHostEntry[] {
  const resolvedRoot = path.resolve(projectRoot);
  const found: McpHostEntry[] = [];
  for (const { dir, hostId } of PROJECT_MARKER_ORDER) {
    if (fs.existsSync(path.join(resolvedRoot, dir))) {
      const host = hostById(hostId);
      if (host) found.push(host);
    }
  }
  return found;
}

/** @deprecated use inferMcpHostsFromProjectMarkers — first match only */
export function inferMcpHostFromProjectMarkers(projectRoot: string): McpHostEntry | undefined {
  return inferMcpHostsFromProjectMarkers(projectRoot)[0];
}

export function resolveMcpInitTargets(
  projectRoot: string,
  opts: { explicitConfig?: string; explicitRootKey?: string } = {},
): McpHostTarget[] {
  if (opts.explicitConfig) {
    return [
      {
        id: 'custom',
        label: 'custom',
        configPath: opts.explicitConfig,
        rootKey: opts.explicitRootKey ?? 'mcpServers',
      },
    ];
  }

  const existing = detectExistingProjectMcpConfigs(projectRoot);
  if (existing.length > 0) {
    return existing;
  }

  const fromMarkers = inferMcpHostsFromProjectMarkers(projectRoot).filter(isProjectScopedHost);
  if (fromMarkers.length > 0) {
    return fromMarkers.map(toMcpHostTarget);
  }

  const fromRuntime = inferMcpHostFromRuntime();
  if (fromRuntime && isProjectScopedHost(fromRuntime)) {
    return [toMcpHostTarget(fromRuntime)];
  }

  return [];
}

export function formatMcpHostHints(): string {
  return listProjectMcpHosts()
    .map((h) => `  - ${h.label}: ${resolveHostConfigPath(h)} (root key: ${h.root_key})`)
    .join('\n');
}
