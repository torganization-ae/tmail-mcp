import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import type { AgentConfig, AgentType } from './types.js';
import { agentDetectInstalled } from './agents-detect.js';

const home = homedir();
// Use xdg-basedir (not env-paths) to match OpenCode/Amp/Goose behavior on all platforms.
const configHome = process.env.XDG_CONFIG_HOME?.trim() || join(home, '.config');
const codexHome = process.env.CODEX_HOME?.trim() || join(home, '.codex');
const claudeHome = process.env.CLAUDE_CONFIG_DIR?.trim() || join(home, '.claude');
const vibeHome = process.env.VIBE_HOME?.trim() || join(home, '.vibe');
const hermesHome = process.env.HERMES_HOME?.trim() || join(home, '.hermes');
const autohandHome = process.env.AUTOHAND_HOME?.trim() || join(home, '.autohand');

export function getOpenClawGlobalSkillsDir(
  homeDir = home,
  pathExists: (path: string) => boolean = existsSync
) {
  if (pathExists(join(homeDir, '.openclaw'))) {
    return join(homeDir, '.openclaw/skills');
  }
  if (pathExists(join(homeDir, '.clawdbot'))) {
    return join(homeDir, '.clawdbot/skills');
  }
  if (pathExists(join(homeDir, '.moltbot'))) {
    return join(homeDir, '.moltbot/skills');
  }
  return join(homeDir, '.openclaw/skills');
}

export const agents: Record<AgentType, AgentConfig> = {
  'aider-desk': {
    name: 'aider-desk',
    displayName: 'AiderDesk',
    skillsDir: '.aider-desk/skills',
    globalSkillsDir: join(home, '.aider-desk/skills'),
    detectInstalled: agentDetectInstalled['aider-desk'],
  },
  amp: {
    name: 'amp',
    displayName: 'Amp',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(configHome, 'agents/skills'),
    detectInstalled: agentDetectInstalled['amp'],
  },
  antigravity: {
    name: 'antigravity',
    displayName: 'Antigravity',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.gemini/antigravity/skills'),
    detectInstalled: agentDetectInstalled['antigravity'],
  },
  'antigravity-cli': {
    name: 'antigravity-cli',
    displayName: 'Antigravity CLI',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.gemini/antigravity-cli/skills'),
    detectInstalled: agentDetectInstalled['antigravity-cli'],
  },
  astrbot: {
    name: 'astrbot',
    displayName: 'AstrBot',
    skillsDir: 'data/skills',
    globalSkillsDir: join(home, '.astrbot/data/skills'),
    detectInstalled: agentDetectInstalled['astrbot'],
  },
  'autohand-code': {
    name: 'autohand-code',
    displayName: 'Autohand Code CLI',
    skillsDir: '.autohand/skills',
    globalSkillsDir: join(autohandHome, 'skills'),
    detectInstalled: agentDetectInstalled['autohand-code'],
  },
  augment: {
    name: 'augment',
    displayName: 'Augment',
    skillsDir: '.augment/skills',
    globalSkillsDir: join(home, '.augment/skills'),
    detectInstalled: agentDetectInstalled['augment'],
  },
  bob: {
    name: 'bob',
    displayName: 'IBM Bob',
    skillsDir: '.bob/skills',
    globalSkillsDir: join(home, '.bob/skills'),
    detectInstalled: agentDetectInstalled['bob'],
  },
  'claude-code': {
    name: 'claude-code',
    displayName: 'Claude Code',
    skillsDir: '.claude/skills',
    globalSkillsDir: join(claudeHome, 'skills'),
    detectInstalled: agentDetectInstalled['claude-code'],
  },
  openclaw: {
    name: 'openclaw',
    displayName: 'OpenClaw',
    skillsDir: 'skills',
    globalSkillsDir: getOpenClawGlobalSkillsDir(),
    detectInstalled: agentDetectInstalled['openclaw'],
  },
  cline: {
    name: 'cline',
    displayName: 'Cline',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.agents', 'skills'),
    detectInstalled: agentDetectInstalled['cline'],
  },
  'codearts-agent': {
    name: 'codearts-agent',
    displayName: 'CodeArts Agent',
    skillsDir: '.codeartsdoer/skills',
    globalSkillsDir: join(home, '.codeartsdoer/skills'),
    detectInstalled: agentDetectInstalled['codearts-agent'],
  },
  codebuddy: {
    name: 'codebuddy',
    displayName: 'CodeBuddy',
    skillsDir: '.codebuddy/skills',
    globalSkillsDir: join(home, '.codebuddy/skills'),
    detectInstalled: agentDetectInstalled['codebuddy'],
  },
  codemaker: {
    name: 'codemaker',
    displayName: 'Codemaker',
    skillsDir: '.codemaker/skills',
    globalSkillsDir: join(home, '.codemaker/skills'),
    detectInstalled: agentDetectInstalled['codemaker'],
  },
  codestudio: {
    name: 'codestudio',
    displayName: 'Code Studio',
    skillsDir: '.codestudio/skills',
    globalSkillsDir: join(home, '.codestudio/skills'),
    detectInstalled: agentDetectInstalled['codestudio'],
  },
  codex: {
    name: 'codex',
    displayName: 'Codex',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(codexHome, 'skills'),
    detectInstalled: agentDetectInstalled['codex'],
  },
  'command-code': {
    name: 'command-code',
    displayName: 'Command Code',
    skillsDir: '.commandcode/skills',
    globalSkillsDir: join(home, '.commandcode/skills'),
    detectInstalled: agentDetectInstalled['command-code'],
  },
  continue: {
    name: 'continue',
    displayName: 'Continue',
    skillsDir: '.continue/skills',
    globalSkillsDir: join(home, '.continue/skills'),
    detectInstalled: agentDetectInstalled['continue'],
  },
  cortex: {
    name: 'cortex',
    displayName: 'Cortex Code',
    skillsDir: '.cortex/skills',
    globalSkillsDir: join(home, '.snowflake/cortex/skills'),
    detectInstalled: agentDetectInstalled['cortex'],
  },
  crush: {
    name: 'crush',
    displayName: 'Crush',
    skillsDir: '.crush/skills',
    globalSkillsDir: join(home, '.config/crush/skills'),
    detectInstalled: agentDetectInstalled['crush'],
  },
  cursor: {
    name: 'cursor',
    displayName: 'Cursor',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.cursor/skills'),
    detectInstalled: agentDetectInstalled['cursor'],
  },
  deepagents: {
    name: 'deepagents',
    displayName: 'Deep Agents',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.deepagents/agent/skills'),
    detectInstalled: agentDetectInstalled['deepagents'],
  },
  devin: {
    name: 'devin',
    displayName: 'Devin for Terminal',
    skillsDir: '.devin/skills',
    globalSkillsDir: join(configHome, 'devin/skills'),
    detectInstalled: agentDetectInstalled['devin'],
  },
  dexto: {
    name: 'dexto',
    displayName: 'Dexto',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.agents/skills'),
    showInUniversalPrompt: false,
    detectInstalled: agentDetectInstalled['dexto'],
  },
  droid: {
    name: 'droid',
    displayName: 'Droid',
    skillsDir: '.factory/skills',
    globalSkillsDir: join(home, '.factory/skills'),
    detectInstalled: agentDetectInstalled['droid'],
  },
  eve: {
    name: 'eve',
    displayName: 'Eve',
    skillsDir: 'agent/skills',
    globalSkillsDir: undefined,
    detectInstalled: agentDetectInstalled['eve'],
  },
  firebender: {
    name: 'firebender',
    displayName: 'Firebender',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.firebender/skills'),
    showInUniversalPrompt: false,
    detectInstalled: agentDetectInstalled['firebender'],
  },
  forgecode: {
    name: 'forgecode',
    displayName: 'ForgeCode',
    skillsDir: '.forge/skills',
    globalSkillsDir: join(home, '.forge/skills'),
    detectInstalled: agentDetectInstalled['forgecode'],
  },
  'gemini-cli': {
    name: 'gemini-cli',
    displayName: 'Gemini CLI',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.gemini/skills'),
    detectInstalled: agentDetectInstalled['gemini-cli'],
  },
  'github-copilot': {
    name: 'github-copilot',
    displayName: 'GitHub Copilot',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.copilot/skills'),
    detectInstalled: agentDetectInstalled['github-copilot'],
  },
  goose: {
    name: 'goose',
    displayName: 'Goose',
    skillsDir: '.goose/skills',
    globalSkillsDir: join(configHome, 'goose/skills'),
    detectInstalled: agentDetectInstalled['goose'],
  },
  'hermes-agent': {
    name: 'hermes-agent',
    displayName: 'Hermes Agent',
    skillsDir: '.hermes/skills',
    globalSkillsDir: join(hermesHome, 'skills'),
    detectInstalled: agentDetectInstalled['hermes-agent'],
  },
  'inference-sh': {
    name: 'inference-sh',
    displayName: 'inference.sh',
    skillsDir: '.inferencesh/skills',
    globalSkillsDir: join(home, '.inferencesh/skills'),
    detectInstalled: agentDetectInstalled['inference-sh'],
  },
  jazz: {
    name: 'jazz',
    displayName: 'Jazz',
    skillsDir: '.jazz/skills',
    globalSkillsDir: join(home, '.jazz/skills'),
    detectInstalled: agentDetectInstalled['jazz'],
  },
  junie: {
    name: 'junie',
    displayName: 'Junie',
    skillsDir: '.junie/skills',
    globalSkillsDir: join(home, '.junie/skills'),
    detectInstalled: agentDetectInstalled['junie'],
  },
  'iflow-cli': {
    name: 'iflow-cli',
    displayName: 'iFlow CLI',
    skillsDir: '.iflow/skills',
    globalSkillsDir: join(home, '.iflow/skills'),
    detectInstalled: agentDetectInstalled['iflow-cli'],
  },
  kilo: {
    name: 'kilo',
    displayName: 'Kilo Code',
    skillsDir: '.kilocode/skills',
    globalSkillsDir: join(home, '.kilocode/skills'),
    detectInstalled: agentDetectInstalled['kilo'],
  },
  'kimi-code-cli': {
    name: 'kimi-code-cli',
    displayName: 'Kimi Code CLI',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.agents/skills'),
    detectInstalled: agentDetectInstalled['kimi-code-cli'],
  },
  'kiro-cli': {
    name: 'kiro-cli',
    displayName: 'Kiro CLI',
    skillsDir: '.kiro/skills',
    globalSkillsDir: join(home, '.kiro/skills'),
    detectInstalled: agentDetectInstalled['kiro-cli'],
  },
  kode: {
    name: 'kode',
    displayName: 'Kode',
    skillsDir: '.kode/skills',
    globalSkillsDir: join(home, '.kode/skills'),
    detectInstalled: agentDetectInstalled['kode'],
  },
  lingma: {
    name: 'lingma',
    displayName: 'Lingma',
    skillsDir: '.lingma/skills',
    globalSkillsDir: join(home, '.lingma/skills'),
    detectInstalled: agentDetectInstalled['lingma'],
  },
  loaf: {
    name: 'loaf',
    displayName: 'Loaf',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.agents/skills'),
    showInUniversalPrompt: false,
    detectInstalled: agentDetectInstalled['loaf'],
  },
  mcpjam: {
    name: 'mcpjam',
    displayName: 'MCPJam',
    skillsDir: '.mcpjam/skills',
    globalSkillsDir: join(home, '.mcpjam/skills'),
    detectInstalled: agentDetectInstalled['mcpjam'],
  },
  'mistral-vibe': {
    name: 'mistral-vibe',
    displayName: 'Mistral Vibe',
    skillsDir: '.vibe/skills',
    globalSkillsDir: join(vibeHome, 'skills'),
    detectInstalled: agentDetectInstalled['mistral-vibe'],
  },
  moxby: {
    name: 'moxby',
    displayName: 'Moxby',
    skillsDir: '.moxby/skills',
    globalSkillsDir: join(home, '.moxby/skills'),
    detectInstalled: agentDetectInstalled['moxby'],
  },
  mux: {
    name: 'mux',
    displayName: 'Mux',
    skillsDir: '.mux/skills',
    globalSkillsDir: join(home, '.mux/skills'),
    detectInstalled: agentDetectInstalled['mux'],
  },
  opencode: {
    name: 'opencode',
    displayName: 'OpenCode',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(configHome, 'opencode/skills'),
    detectInstalled: agentDetectInstalled['opencode'],
  },
  openhands: {
    name: 'openhands',
    displayName: 'OpenHands',
    skillsDir: '.openhands/skills',
    globalSkillsDir: join(home, '.openhands/skills'),
    detectInstalled: agentDetectInstalled['openhands'],
  },
  ona: {
    name: 'ona',
    displayName: 'Ona',
    skillsDir: '.ona/skills',
    globalSkillsDir: join(home, '.ona/skills'),
    detectInstalled: agentDetectInstalled['ona'],
  },
  pi: {
    name: 'pi',
    displayName: 'Pi',
    skillsDir: '.pi/skills',
    globalSkillsDir: join(home, '.pi/agent/skills'),
    detectInstalled: agentDetectInstalled['pi'],
  },
  qoder: {
    name: 'qoder',
    displayName: 'Qoder',
    skillsDir: '.qoder/skills',
    globalSkillsDir: join(home, '.qoder/skills'),
    detectInstalled: agentDetectInstalled['qoder'],
  },
  'qoder-cn': {
    name: 'qoder-cn',
    displayName: 'Qoder CN',
    skillsDir: '.qoder/skills',
    globalSkillsDir: join(home, '.qoder-cn/skills'),
    detectInstalled: agentDetectInstalled['qoder-cn'],
  },
  'qwen-code': {
    name: 'qwen-code',
    displayName: 'Qwen Code',
    skillsDir: '.qwen/skills',
    globalSkillsDir: join(home, '.qwen/skills'),
    detectInstalled: agentDetectInstalled['qwen-code'],
  },
  replit: {
    name: 'replit',
    displayName: 'Replit',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(configHome, 'agents/skills'),
    showInUniversalList: false,
    detectInstalled: agentDetectInstalled['replit'],
  },
  reasonix: {
    name: 'reasonix',
    displayName: 'Reasonix',
    skillsDir: '.reasonix/skills',
    globalSkillsDir: join(home, '.reasonix/skills'),
    detectInstalled: agentDetectInstalled['reasonix'],
  },
  rovodev: {
    name: 'rovodev',
    displayName: 'Rovo Dev',
    skillsDir: '.rovodev/skills',
    globalSkillsDir: join(home, '.rovodev/skills'),
    detectInstalled: agentDetectInstalled['rovodev'],
  },
  roo: {
    name: 'roo',
    displayName: 'Roo Code',
    skillsDir: '.roo/skills',
    globalSkillsDir: join(home, '.roo/skills'),
    detectInstalled: agentDetectInstalled['roo'],
  },
  'tabnine-cli': {
    name: 'tabnine-cli',
    displayName: 'Tabnine CLI',
    skillsDir: '.tabnine/agent/skills',
    globalSkillsDir: join(home, '.tabnine/agent/skills'),
    detectInstalled: agentDetectInstalled['tabnine-cli'],
  },
  terramind: {
    name: 'terramind',
    displayName: 'Terramind',
    skillsDir: '.terramind/skills',
    globalSkillsDir: join(home, '.terramind/skills'),
    detectInstalled: agentDetectInstalled['terramind'],
  },
  tinycloud: {
    name: 'tinycloud',
    displayName: 'Tinycloud',
    skillsDir: '.tinycloud/skills',
    globalSkillsDir: join(home, '.tinycloud/skills'),
    detectInstalled: agentDetectInstalled['tinycloud'],
  },
  trae: {
    name: 'trae',
    displayName: 'Trae',
    skillsDir: '.trae/skills',
    globalSkillsDir: join(home, '.trae/skills'),
    detectInstalled: agentDetectInstalled['trae'],
  },
  'trae-cn': {
    name: 'trae-cn',
    displayName: 'Trae CN',
    skillsDir: '.trae/skills',
    globalSkillsDir: join(home, '.trae-cn/skills'),
    detectInstalled: agentDetectInstalled['trae-cn'],
  },
  warp: {
    name: 'warp',
    displayName: 'Warp',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.agents/skills'),
    detectInstalled: agentDetectInstalled['warp'],
  },
  windsurf: {
    name: 'windsurf',
    displayName: 'Windsurf',
    skillsDir: '.windsurf/skills',
    globalSkillsDir: join(home, '.codeium/windsurf/skills'),
    detectInstalled: agentDetectInstalled['windsurf'],
  },
  zed: {
    name: 'zed',
    displayName: 'Zed',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.agents/skills'),
    detectInstalled: agentDetectInstalled['zed'],
  },
  zencoder: {
    name: 'zencoder',
    displayName: 'Zencoder',
    skillsDir: '.zencoder/skills',
    globalSkillsDir: join(home, '.zencoder/skills'),
    detectInstalled: agentDetectInstalled['zencoder'],
  },
  zenflow: {
    name: 'zenflow',
    displayName: 'Zenflow',
    skillsDir: '.zencoder/skills',
    globalSkillsDir: join(home, '.zencoder/skills'),
    detectInstalled: agentDetectInstalled['zenflow'],
  },
  neovate: {
    name: 'neovate',
    displayName: 'Neovate',
    skillsDir: '.neovate/skills',
    globalSkillsDir: join(home, '.neovate/skills'),
    detectInstalled: agentDetectInstalled['neovate'],
  },
  pochi: {
    name: 'pochi',
    displayName: 'Pochi',
    skillsDir: '.pochi/skills',
    globalSkillsDir: join(home, '.pochi/skills'),
    detectInstalled: agentDetectInstalled['pochi'],
  },
  promptscript: {
    name: 'promptscript',
    displayName: 'PromptScript',
    skillsDir: '.agents/skills',
    globalSkillsDir: undefined,
    showInUniversalPrompt: false,
    detectInstalled: agentDetectInstalled['promptscript'],
  },
  adal: {
    name: 'adal',
    displayName: 'AdaL',
    skillsDir: '.adal/skills',
    globalSkillsDir: join(home, '.adal/skills'),
    detectInstalled: agentDetectInstalled['adal'],
  },
  universal: {
    name: 'universal',
    displayName: 'Universal',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(configHome, 'agents/skills'),
    showInUniversalList: false,
    detectInstalled: agentDetectInstalled['universal'],
  },
};

export { agentDetectInstalled, detectAgentInstalledSync, detectInstalledAgents } from './agents-detect.js';

export function getAgentConfig(type: AgentType): AgentConfig {
  return agents[type];
}

/**
 * Directory (relative to an Eve project root) that holds subagents.
 * Each subagent owns its own skills at `agent/subagents/<name>/skills`,
 * mirroring the root agent's `agent/skills`.
 */
export const EVE_SUBAGENTS_DIR = join('agent', 'subagents');

/**
 * Discover the names of Eve subagents in a project.
 *
 * Eve supports subagents that each have their own skills directory at
 * `agent/subagents/<name>/skills`. This returns the `<name>` of every
 * subagent directory found under `agent/subagents/`, sorted alphabetically.
 * Returns an empty list when the directory doesn't exist or can't be read.
 */
export function getEveSubagents(cwd: string = process.cwd()): string[] {
  const dir = join(cwd, EVE_SUBAGENTS_DIR);
  if (!existsSync(dir)) {
    return [];
  }
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Returns agents that use the universal .agents/skills directory.
 * These agents share a common skill location and don't need symlinks.
 * Agents with showInUniversalList: false are excluded.
 */
export function getUniversalAgents(): AgentType[] {
  return (Object.entries(agents) as [AgentType, AgentConfig][])
    .filter(
      ([_, config]) => config.skillsDir === '.agents/skills' && config.showInUniversalList !== false
    )
    .map(([type]) => type);
}

/**
 * Returns the subset of universal agents shown in the interactive locked section.
 * All universal agents are still installed; this only keeps the prompt readable.
 */
export function getVisibleUniversalAgents(): AgentType[] {
  return (Object.entries(agents) as [AgentType, AgentConfig][])
    .filter(
      ([_, config]) =>
        config.skillsDir === '.agents/skills' &&
        config.showInUniversalList !== false &&
        config.showInUniversalPrompt !== false
    )
    .map(([type]) => type);
}

/**
 * Returns agents that use agent-specific skill directories (not universal).
 * These agents need symlinks from the canonical .agents/skills location.
 */
export function getNonUniversalAgents(): AgentType[] {
  return (Object.entries(agents) as [AgentType, AgentConfig][])
    .filter(([_, config]) => config.skillsDir !== '.agents/skills')
    .map(([type]) => type);
}

/**
 * Check if an agent uses the universal .agents/skills directory.
 */
export function isUniversalAgent(type: AgentType): boolean {
  return agents[type].skillsDir === '.agents/skills';
}
