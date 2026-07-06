import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import type { AgentDetectCtx, AgentType } from './types.js';
import { ALL_AGENT_TYPES } from './types.js';

const home = homedir();
const configHome = process.env.XDG_CONFIG_HOME?.trim() || join(home, '.config');
const codexHome = process.env.CODEX_HOME?.trim() || join(home, '.codex');
const claudeHome = process.env.CLAUDE_CONFIG_DIR?.trim() || join(home, '.claude');
const vibeHome = process.env.VIBE_HOME?.trim() || join(home, '.vibe');
const hermesHome = process.env.HERMES_HOME?.trim() || join(home, '.hermes');
const autohandHome = process.env.AUTOHAND_HOME?.trim() || join(home, '.autohand');
const zedAppDataHome = process.env.APPDATA?.trim();
const zedFlatpakConfigHome = process.env.FLATPAK_XDG_CONFIG_HOME?.trim();

function homeDir(ctx?: AgentDetectCtx): string {
  return ctx?.home ?? home;
}

function configHomeDir(ctx?: AgentDetectCtx): string {
  return ctx?.configHome ?? configHome;
}

function cwdDir(ctx?: AgentDetectCtx): string {
  return ctx?.cwd ?? process.cwd();
}

function claudeHomeDir(ctx?: AgentDetectCtx): string {
  return process.env.CLAUDE_CONFIG_DIR?.trim() || join(homeDir(ctx), '.claude');
}

function codexHomeDir(ctx?: AgentDetectCtx): string {
  return process.env.CODEX_HOME?.trim() || join(homeDir(ctx), '.codex');
}

function vibeHomeDir(ctx?: AgentDetectCtx): string {
  return process.env.VIBE_HOME?.trim() || join(homeDir(ctx), '.vibe');
}

function hermesHomeDir(ctx?: AgentDetectCtx): string {
  return process.env.HERMES_HOME?.trim() || join(homeDir(ctx), '.hermes');
}

function autohandHomeDir(ctx?: AgentDetectCtx): string {
  return process.env.AUTOHAND_HOME?.trim() || join(homeDir(ctx), '.autohand');
}

function packageJsonHasDependency(packageJsonPath: string, dependencyName: string): boolean {
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
    return !!(
      packageJson.dependencies?.[dependencyName] || packageJson.devDependencies?.[dependencyName]
    );
  } catch {
    return false;
  }
}



const AGENT_DETECT_SET = new Set<string>(ALL_AGENT_TYPES);

export function isAgentType(id: string): id is AgentType {
  return AGENT_DETECT_SET.has(id);
}

export const agentDetectInstalled: Record<AgentType, (ctx?: AgentDetectCtx) => boolean> = {
  'aider-desk': (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.aider-desk'));
    },
  amp: (ctx?: AgentDetectCtx) => {
      return existsSync(join(configHomeDir(ctx), 'amp'));
    },
  antigravity: (ctx?: AgentDetectCtx) => {
      return (
        existsSync(join(cwdDir(ctx), '.agents/mcp_config.json')) ||
        existsSync(join(homeDir(ctx), '.gemini/antigravity'))
      );
    },
  'antigravity-cli': (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.gemini/antigravity-cli'));
    },
  astrbot: (ctx?: AgentDetectCtx) => {
      return existsSync(join(cwdDir(ctx), 'data/skills')) || existsSync(join(homeDir(ctx), '.astrbot'));
    },
  'autohand-code': (ctx?: AgentDetectCtx) => {
      return existsSync(autohandHomeDir(ctx));
    },
  augment: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.augment'));
    },
  bob: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.bob'));
    },
  'claude-code': (ctx?: AgentDetectCtx) => {
      return (
        existsSync(claudeHomeDir(ctx)) ||
        existsSync(join(homeDir(ctx), '.openclaw')) ||
        existsSync(join(homeDir(ctx), '.clawdbot')) ||
        existsSync(join(homeDir(ctx), '.moltbot'))
      );
    },
  'openclaw': (ctx?: AgentDetectCtx) => {
      return (
        existsSync(join(homeDir(ctx), '.openclaw')) ||
        existsSync(join(homeDir(ctx), '.clawdbot')) ||
        existsSync(join(homeDir(ctx), '.moltbot'))
      );
    },
  cline: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.cline'));
    },
  'codearts-agent': (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.codeartsdoer'));
    },
  codebuddy: (ctx?: AgentDetectCtx) => {
      return existsSync(join(cwdDir(ctx), '.codebuddy')) || existsSync(join(homeDir(ctx), '.codebuddy'));
    },
  codemaker: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.codemaker'));
    },
  codestudio: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.codestudio'));
    },
  codex: (ctx?: AgentDetectCtx) => {
      return existsSync(codexHomeDir(ctx)) || existsSync('/etc/codex');
    },
  'command-code': (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.commandcode'));
    },
  continue: (ctx?: AgentDetectCtx) => {
      return existsSync(join(cwdDir(ctx), '.continue')) || existsSync(join(homeDir(ctx), '.continue'));
    },
  cortex: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.snowflake/cortex'));
    },
  crush: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.config/crush'));
    },
  cursor: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.cursor'));
    },
  deepagents: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.deepagents'));
    },
  devin: (ctx?: AgentDetectCtx) => {
      return existsSync(join(configHomeDir(ctx), 'devin'));
    },
  dexto: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.dexto'));
    },
  droid: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.factory'));
    },
  eve: (ctx?: AgentDetectCtx) => {
      const cwd = cwdDir(ctx);
      return (
        existsSync(join(cwd, 'agent')) && packageJsonHasDependency(join(cwd, 'package.json'), 'eve')
      );
    },
  firebender: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.firebender'));
    },
  forgecode: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.forge'));
    },
  'gemini-cli': (ctx?: AgentDetectCtx) => {
      const geminiDir = join(homeDir(ctx), '.gemini');
      return (
        existsSync(join(geminiDir, 'settings.json')) ||
        (existsSync(geminiDir) &&
          !existsSync(join(geminiDir, 'antigravity')) &&
          !existsSync(join(geminiDir, 'antigravity-cli')))
      );
    },
  'github-copilot': (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.copilot'));
    },
  goose: (ctx?: AgentDetectCtx) => {
      return existsSync(join(configHomeDir(ctx), 'goose'));
    },
  'hermes-agent': (ctx?: AgentDetectCtx) => {
      return existsSync(hermesHomeDir(ctx));
    },
  'inference-sh': (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.inferencesh'));
    },
  jazz: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.jazz')) || existsSync(join(cwdDir(ctx), '.jazz'));
    },
  junie: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.junie'));
    },
  'iflow-cli': (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.iflow'));
    },
  kilo: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.kilocode'));
    },
  'kimi-code-cli': (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.kimi-code')) || existsSync(join(homeDir(ctx), '.kimi'));
    },
  'kiro-cli': (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.kiro'));
    },
  kode: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.kode'));
    },
  lingma: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.lingma'));
    },
  loaf: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.loaf'));
    },
  mcpjam: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.mcpjam'));
    },
  'mistral-vibe': (ctx?: AgentDetectCtx) => {
      return existsSync(vibeHomeDir(ctx));
    },
  moxby: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.moxby'));
    },
  mux: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.mux'));
    },
  opencode: (ctx?: AgentDetectCtx) => {
      return existsSync(join(configHomeDir(ctx), 'opencode'));
    },
  openhands: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.openhands'));
    },
  ona: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.ona'));
    },
  pi: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.pi/agent'));
    },
  qoder: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.qoder'));
    },
  'qoder-cn': (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.qoder-cn'));
    },
  'qwen-code': (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.qwen'));
    },
  replit: (ctx?: AgentDetectCtx) => {
      return existsSync(join(cwdDir(ctx), '.replit'));
    },
  reasonix: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.reasonix'));
    },
  rovodev: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.rovodev'));
    },
  roo: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.roo'));
    },
  'tabnine-cli': (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.tabnine'));
    },
  terramind: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.terramind'));
    },
  tinycloud: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.tinycloud'));
    },
  trae: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.trae'));
    },
  'trae-cn': (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.trae-cn'));
    },
  warp: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.warp'));
    },
  windsurf: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.codeium/windsurf'));
    },
  zed: (ctx?: AgentDetectCtx) => {
      // Per Zed's config_dir() in crates/paths/src/paths.rs.
      return (
        existsSync(join(configHomeDir(ctx), 'zed')) ||
        (!!zedAppDataHome && existsSync(join(zedAppDataHome, 'Zed'))) ||
        (!!zedFlatpakConfigHome && existsSync(join(zedFlatpakConfigHome, 'zed')))
      );
    },
  zencoder: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.zencoder'));
    },
  zenflow: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.zencoder'));
    },
  neovate: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.neovate'));
    },
  pochi: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.pochi'));
    },
  promptscript: (ctx?: AgentDetectCtx) => {
      return (
        existsSync(join(cwdDir(ctx), '.promptscript')) ||
        existsSync(join(cwdDir(ctx), 'promptscript.yaml'))
      );
    },
  adal: (ctx?: AgentDetectCtx) => {
      return existsSync(join(homeDir(ctx), '.adal'));
    },
  universal: (ctx?: AgentDetectCtx) => {
      return false;
    },
};

export function detectAgentInstalledSync(type: AgentType, ctx?: AgentDetectCtx): boolean {
  return agentDetectInstalled[type](ctx);
}

export function detectInstalledAgents(ctx?: AgentDetectCtx): AgentType[] {
  return ALL_AGENT_TYPES.filter((type) => agentDetectInstalled[type](ctx));
}
