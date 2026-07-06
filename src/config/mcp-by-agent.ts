import { AGENT_DISPLAY_NAMES } from './skills-agents/agents-labels.js';
import { isAgentType } from './skills-agents/agents-detect.js';

export type McpConfigFormat = 'json' | 'jsonc' | 'toml';

export type McpRootKey = 'mcpServers' | 'servers' | 'mcp' | 'context_servers' | 'mcp_servers';

export type McpWriterKind =
  | 'json-root'
  | 'toml-codex'
  | 'json-opencode'
  | 'json-zed'
  | 'json-amp';

/** Project-scoped MCP config metadata — paths from official product docs only. */
export interface McpHostSpec {
  configPath: string;
  rootKey: McpRootKey;
  format: McpConfigFormat;
  writer: McpWriterKind;
  /** false when product has no documented project MCP file or merge is not implemented yet */
  initWritable: boolean;
  needsStdioType?: boolean;
  note?: string;
}

/** Pick in init/configure when the product has no verified project MCP path here. */
export const MCP_OTHER_HOST_ID = 'other';

export const MCP_MANUAL_SETUP_HINT = `Add a stdio MCP server in your IDE/CLI (see its MCP docs):
  command: npx
  args: [-y, @tmail/mcp]
  env: TMAIL_API_URL, TMAIL_MAIN_DIR (.tmail), TMAIL_BIND_INVITE
Or merge into a known file: npx @tmail/mcp init <url> --config ./path/mcp.json --root-key mcpServers`;

const JSON_ROOT: Omit<McpHostSpec, 'configPath' | 'initWritable' | 'note'> = {
  rootKey: 'mcpServers',
  format: 'json',
  writer: 'json-root',
};

const PROJECT_MCP_JSON: McpHostSpec = {
  configPath: '.mcp.json',
  ...JSON_ROOT,
  initWritable: true,
  note: 'open-plugin-spec default; see product docs',
};

/**
 * Verified MCP paths (official docs / README). No skillsDir heuristics.
 * @see research 2026-07 — ampcode.com, antigravity.google, docs.qoder.com, etc.
 */
export const MCP_HOST_SPECS: Record<string, McpHostSpec> = {
  vscode: {
    configPath: '.vscode/mcp.json',
    rootKey: 'servers',
    format: 'json',
    writer: 'json-root',
    initWritable: true,
    needsStdioType: true,
    note: 'GitHub Copilot uses the same workspace file',
  },
  cursor: {
    configPath: '.cursor/mcp.json',
    ...JSON_ROOT,
    initWritable: true,
    note: 'Global: ~/.cursor/mcp.json',
  },
  windsurf: {
    configPath: '.windsurf/mcp.json',
    ...JSON_ROOT,
    initWritable: true,
    note: 'Global: ~/.codeium/windsurf/mcp_config.json',
  },
  cline: {
    configPath: '.cline_mcp_servers.json',
    ...JSON_ROOT,
    initWritable: true,
    note: 'Project file per cline/cline#2582; not .cline/mcp.json',
  },
  continue: {
    configPath: '.continue/mcpServers/mcp.json',
    ...JSON_ROOT,
    initWritable: true,
  },
  'claude-code': {
    ...PROJECT_MCP_JSON,
    note: 'Project .mcp.json; global ~/.claude.json',
  },
  'gemini-cli': {
    configPath: '.gemini/settings.json',
    ...JSON_ROOT,
    initWritable: true,
    note: 'mcpServers inside settings.json',
  },
  'qwen-code': {
    configPath: '.qwen/settings.json',
    ...JSON_ROOT,
    initWritable: true,
  },
  roo: { configPath: '.roo/mcp.json', ...JSON_ROOT, initWritable: true },
  kilo: { configPath: '.kilocode/mcp.json', ...JSON_ROOT, initWritable: true },
  warp: { configPath: '.warp/mcp.json', ...JSON_ROOT, initWritable: true },
  pi: { configPath: '.pi/mcp.json', ...JSON_ROOT, initWritable: true },
  trae: { configPath: '.trae/mcp.json', ...JSON_ROOT, initWritable: true },
  codex: {
    configPath: '.codex/config.toml',
    rootKey: 'mcp_servers',
    format: 'toml',
    writer: 'toml-codex',
    initWritable: true,
  },
  opencode: {
    configPath: 'opencode.json',
    rootKey: 'mcp',
    format: 'json',
    writer: 'json-opencode',
    initWritable: true,
  },
  zed: {
    configPath: '.zed/settings.json',
    rootKey: 'context_servers',
    format: 'json',
    writer: 'json-zed',
    initWritable: true,
  },
  amp: {
    configPath: '.amp/settings.json',
    rootKey: 'mcpServers',
    format: 'json',
    writer: 'json-amp',
    initWritable: true,
    note: 'Nested amp.mcpServers in settings.json',
  },
  antigravity: {
    configPath: '.agents/mcp_config.json',
    ...JSON_ROOT,
    initWritable: true,
    note: 'antigravity.google/docs/mcp',
  },
  'kimi-code-cli': {
    configPath: '.kimi-code/mcp.json',
    ...JSON_ROOT,
    initWritable: true,
    note: 'kimi.com/code/docs — not .kimi/mcp.json',
  },
  augment: {
    configPath: '.augment/settings.json',
    ...JSON_ROOT,
    initWritable: true,
    note: 'docs.augmentcode.com/cli/config',
  },
  bob: { configPath: '.bob/mcp.json', ...JSON_ROOT, initWritable: true },
  'codearts-agent': {
    configPath: '.codeartsdoer/codearts_cli.json',
    rootKey: 'mcp',
    format: 'json',
    writer: 'json-root',
    initWritable: true,
    note: 'Also .jsonc; mcp key per Huawei CodeArts docs',
  },
  codebuddy: {
    ...PROJECT_MCP_JSON,
    note: 'docs.codebuddy.ai/cli/mcp — repo-root .mcp.json',
  },
  cortex: {
    configPath: '.snowflake/cortex/mcp.json',
    ...JSON_ROOT,
    initWritable: true,
    note: 'Alt: .cortex/mcp.json',
  },
  crush: {
    configPath: '.crush.json',
    rootKey: 'mcp',
    format: 'json',
    writer: 'json-root',
    initWritable: true,
    note: 'charmbracelet/crush — mcp key, not mcpServers',
  },
  deepagents: {
    ...PROJECT_MCP_JSON,
    note: 'docs.langchain.com deepagents — .mcp.json precedence',
  },
  devin: {
    configPath: '.devin/config.json',
    ...JSON_ROOT,
    initWritable: true,
  },
  droid: {
    configPath: '.factory/mcp.json',
    ...JSON_ROOT,
    initWritable: true,
    note: 'docs.factory.ai/cli/configuration/mcp',
  },
  firebender: {
    configPath: 'firebender.json',
    ...JSON_ROOT,
    initWritable: true,
    note: 'mcpServers inside firebender.json',
  },
  forgecode: {
    ...PROJECT_MCP_JSON,
    note: 'forgecode.dev/docs/mcp-integration',
  },
  'iflow-cli': {
    configPath: '.iflow/settings.json',
    ...JSON_ROOT,
    initWritable: true,
  },
  junie: {
    configPath: '.junie/mcp/mcp.json',
    ...JSON_ROOT,
    initWritable: true,
  },
  'kiro-cli': {
    configPath: '.kiro/settings/mcp.json',
    ...JSON_ROOT,
    initWritable: true,
  },
  kode: {
    configPath: 'kodezi-cli.json',
    rootKey: 'mcp',
    format: 'json',
    writer: 'json-root',
    initWritable: true,
  },
  'mistral-vibe': {
    configPath: '.vibe/config.toml',
    rootKey: 'mcp_servers',
    format: 'toml',
    writer: 'toml-codex',
    initWritable: true,
    note: 'docs.mistral.ai vibe — TOML mcp_servers tables',
  },
  neovate: {
    configPath: '.neovate/config.json',
    ...JSON_ROOT,
    initWritable: true,
  },
  ona: {
    configPath: '.ona/mcp-config.json',
    ...JSON_ROOT,
    initWritable: true,
  },
  qoder: {
    ...PROJECT_MCP_JSON,
    note: 'docs.qoder.com/cli/mcp-servers — repo-root .mcp.json',
  },
  reasonix: {
    ...PROJECT_MCP_JSON,
    note: 'reasonix.io/docs — .mcp.json Claude Code schema',
  },
  rovodev: {
    configPath: '.rovodev/mcp.json',
    ...JSON_ROOT,
    initWritable: true,
  },
  'tabnine-cli': {
    configPath: '.tabnine/agent/settings.json',
    ...JSON_ROOT,
    initWritable: true,
    note: 'Tabnine Agent IDE uses .tabnine/mcp_servers.json instead',
  },
  astrbot: {
    configPath: 'data/mcp_server.json',
    ...JSON_ROOT,
    initWritable: true,
    note: 'docs.astrbot.app — not data/mcp.json',
  },
  other: {
    configPath: '',
    ...JSON_ROOT,
    initWritable: false,
    note: 'Manual MCP setup — not auto-merged by init',
  },
};

/** Legacy --host / host-lock ids → canonical MCP host id. */
export const MCP_HOST_ALIASES: Record<string, string> = {
  gemini: 'gemini-cli',
  claude: 'claude-code',
  'github-copilot': 'vscode',
  'trae-cn': 'trae',
  openclaw: 'claude-code',
  'qoder-cn': 'qoder',
  zenflow: MCP_OTHER_HOST_ID,
};

export function normalizeMcpHostId(id: string): string {
  return MCP_HOST_ALIASES[id] ?? id;
}

export function isManualMcpHostId(id: string): boolean {
  return normalizeMcpHostId(id) === MCP_OTHER_HOST_ID;
}

export function listMcpHostIds(): string[] {
  return Object.keys(MCP_HOST_SPECS).sort();
}

export function getMcpHostSpec(id: string): McpHostSpec | undefined {
  return MCP_HOST_SPECS[normalizeMcpHostId(id)];
}

export function getAgentDisplayName(id: string): string {
  const canonical = normalizeMcpHostId(id);
  if (canonical === 'vscode') return 'VS Code';
  if (canonical === MCP_OTHER_HOST_ID) return 'Other (manual setup)';
  if (isAgentType(canonical)) return AGENT_DISPLAY_NAMES[canonical];
  return canonical;
}

/** When several agent ids share one config file, init/detect prefer this id. */
export const MCP_CANONICAL_ID_BY_CONFIG_PATH: Record<string, string> = {
  '.vscode/mcp.json': 'vscode',
  '.trae/mcp.json': 'trae',
  '.mcp.json': 'claude-code',
  '.gemini/settings.json': 'gemini-cli',
  '.qwen/settings.json': 'qwen-code',
  '.zed/settings.json': 'zed',
  'opencode.json': 'opencode',
  '.codex/config.toml': 'codex',
  '.continue/mcpServers/mcp.json': 'continue',
  '.agents/mcp_config.json': 'antigravity',
  '.cline_mcp_servers.json': 'cline',
  '.vibe/config.toml': 'mistral-vibe',
  'firebender.json': 'firebender',
  '.amp/settings.json': 'amp',
  '.kimi-code/mcp.json': 'kimi-code-cli',
  'data/mcp_server.json': 'astrbot',
};
