import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isInteractiveTTY, promptSelectMcpHosts } from '../config/host-prompt.js';
import { packageRoot, ENV_FILE_NAME, ENV_PROFILE_DIR, ENV_PROJECT_ROOT, loadConfig, resolveStorageLayout } from '../config/env.js';
import { isManualMcpHostId, MCP_MANUAL_SETUP_HINT } from '../config/mcp-by-agent.js';
import {
  detectInstalledMcpHosts,
  formatMcpHostHints,
  parseHostIds,
  readHostLock,
  resolveMcpInitTargets,
  writeHostLock,
  type McpHost,
} from '../config/hosts.js';
import { mergeTmailMcpConfig } from '../config/mcp-merge.js';
import { listBoundWallets } from '../profile/bound-wallets.js';
import { checkSelector, exitCodeForStatus } from '../gate/gate.js';
import { hasLegacyPassphraseInJson, passphraseStatus } from '../profile/passphrase.js';
import { pathsForSlug } from '../profile/paths.js';
import { ResolvePolicy } from '../profile/selector.js';
import { changePassphraseForProfile, revealPassphraseForProfile } from './e2ee.js';
import { AuthMode, newRuntime } from './runtime.js';

const GATE_START = '<!-- tmail-env-gate:start -->';
const GATE_END = '<!-- tmail-env-gate:end -->';

const ANTI_BYPASS = `## TMail anti-bypass (mandatory)

- Call the MCP tool the user needs — tools return actionable errors when env/bind/e2ee/wallet is missing
- Optional status: tmail_gate_check or \`npx @tmail/mcp gate [wallet_slug]\`
- Multi-wallet: pass wallet_slug (64hex) when tool error lists multiple wallets
- Never write \`session.json\` manually; never call tmail-recovery on first setup
- Missing env → fill \`tmail\` MCP env block (IDE config), reload MCP host, user "ready" → bind flow
- Incomplete bootstrap → tmail_e2ee_generate_local → tmail_e2ee_register
- AUTH_NEEDS_LOGIN → tmail_sub_login (no bind_invite)
- Never use owner api_key (tmail_o_*) in sub-agent env/session

## TMail MCP-first (mandatory)

- All TMail operations via MCP tools (tmail_*), not raw curl to /api/*
- Auth: tmail_generate_payload → @ton/mcp generate_ton_proof (flat) → tmail_sub_bind / tmail_sub_login
- Mail: tmail_send_letter, tmail_list_threads, tmail_fetch_thread
- Skills: install via \`npx skills add github.com/torganization-ae/tmail-mcp\`
- curl REST = fallback only when MCP server offline
- Reload your MCP host after filling the \`tmail\` MCP env block
- MCP config: \`npx @tmail/mcp init <api_url>\` — pick installed MCP host(s) interactively`;

function loadBundledAgentGate(apiUrl: string): string {
  const bundled = path.join(packageRoot(), 'agent-gate.md');
  if (!fs.existsSync(bundled)) {
    throw new Error(`bundled agent-gate.md missing in @tmail/mcp (${bundled})`);
  }
  return fs.readFileSync(bundled, 'utf8').replaceAll('{{BASE_URL}}', apiUrl);
}

function patchAgentsMd(filePath: string, gateBody: string): void {
  const block = ['', GATE_START, gateBody.trimEnd(), '', ANTI_BYPASS, GATE_END, ''].join('\n');
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    const startIdx = content.indexOf(GATE_START);
    const endIdx = content.indexOf(GATE_END);
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      content = content.slice(0, startIdx) + block.trimStart() + content.slice(endIdx + GATE_END.length);
    } else {
      content = content.trimEnd() + block;
    }
    fs.writeFileSync(filePath, content.endsWith('\n') ? content : content + '\n');
    return;
  }
  fs.writeFileSync(filePath, ['# Agent instructions', block].join('\n'));
}

function ensureGitignoreEntries(gitignorePath: string, entries: string[]): void {
  const lines = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8').split('\n') : [];
  const set = new Set(lines.filter(Boolean));
  for (const entry of entries) {
    if (!set.has(entry)) {
      lines.push(entry);
      set.add(entry);
    }
  }
  fs.writeFileSync(gitignorePath, lines.join('\n').replace(/\n*$/, '\n'));
}



function parseMcpCommandOptions(
  argv: string[],
  flags: Record<string, string | boolean>,
  opts: { includeSkipMcpConfig?: boolean; collectPositional?: boolean } = {},
): {
  explicitConfig?: string;
  explicitRootKey?: string;
  explicitHostIds: string[];
  skipMcpConfig: boolean;
  force: boolean;
  yes: boolean;
  positional: string[];
} {
  let explicitConfig: string | undefined;
  let explicitRootKey: string | undefined;
  let explicitHostIds: string[] = [];
  let skipMcpConfig = Boolean(flags['skip-mcp-config']);
  let yes = Boolean(flags.y || flags.yes);
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (opts.includeSkipMcpConfig && arg === '--skip-mcp-config') {
      skipMcpConfig = true;
    } else if (arg === '--config' && argv[i + 1]) {
      explicitConfig = argv[++i];
    } else if (arg === '--root-key' && argv[i + 1]) {
      explicitRootKey = argv[++i];
    } else if ((arg === '--host' || arg === '-a') && argv[i + 1]) {
      explicitHostIds = parseHostIds(argv[++i]);
    } else if (arg === '-y' || arg === '--yes') {
      yes = true;
    } else if (opts.collectPositional && !arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  if (typeof flags.config === 'string') explicitConfig = flags.config;
  if (typeof flags['root-key'] === 'string') explicitRootKey = flags['root-key'];
  if (typeof flags.host === 'string') explicitHostIds = parseHostIds(flags.host);
  if (typeof flags.agent === 'string') explicitHostIds = parseHostIds(flags.agent);

  return {
    explicitConfig,
    explicitRootKey,
    explicitHostIds,
    skipMcpConfig,
    force: Boolean(flags.force),
    yes,
    positional,
  };
}

function resolveInitOptions(
  argv: string[],
  flags: Record<string, string | boolean>,
): {
  apiUrl: string;
  explicitConfig?: string;
  explicitRootKey?: string;
  explicitHostIds: string[];
  skipMcpConfig: boolean;
  force: boolean;
  yes: boolean;
} {
  const parsed = parseMcpCommandOptions(argv, flags, { includeSkipMcpConfig: true, collectPositional: true });
  const apiUrl = (parsed.positional[0] || '').replace(/\/+$/, '');
  return {
    apiUrl,
    explicitConfig: parsed.explicitConfig,
    explicitRootKey: parsed.explicitRootKey,
    explicitHostIds: parsed.explicitHostIds,
    skipMcpConfig: parsed.skipMcpConfig,
    force: parsed.force,
    yes: parsed.yes,
  };
}

async function resolveMcpTargetsForInit(
  projectRoot: string,
  opts: {
    explicitConfig?: string;
    explicitRootKey?: string;
    explicitHostIds: string[];
    yes: boolean;
  },
): Promise<McpHost[]> {
  const resolved = resolveMcpInitTargets(projectRoot, {
    explicitConfig: opts.explicitConfig,
    explicitRootKey: opts.explicitRootKey,
    explicitHostIds: opts.explicitHostIds,
  });
  if (resolved.length > 0) {
    return resolved;
  }

  if (opts.explicitHostIds.some(isManualMcpHostId)) {
    return [];
  }

  const lock = readHostLock(projectRoot);
  if (lock?.hosts.length && lock.hosts.every(isManualMcpHostId)) {
    return [];
  }

  if (opts.yes) {
    throw new Error(
      'no MCP config to merge non-interactively — use --host cursor (or vscode, windsurf, …), --host other for manual setup, or run without -y to pick from installed hosts',
    );
  }

  if (!isInteractiveTTY()) {
    throw new Error(
      'MCP host selection requires an interactive terminal — use --host cursor (or vscode, windsurf, …), --host other for manual setup, or create .tmail/host-lock.json',
    );
  }

  const installed = detectInstalledMcpHosts();
  const selected = await promptSelectMcpHosts(installed);
  if (selected.length === 0) {
    return [];
  }
  writeHostLock(projectRoot, selected.map((target) => target.id));
  return selected;
}

async function mergeMcpTargets(
  projectRoot: string,
  targets: McpHost[],
  apiUrl: string,
  force: boolean,
): Promise<string[]> {
  const merged: string[] = [];
  for (const target of targets) {
    process.stderr.write(`==> Merging tmail MCP block → ${target.configPath} (${target.label})\n`);
    const resolved = await mergeTmailMcpConfig({
      projectRoot,
      configPath: target.configPath,
      rootKey: target.rootKey,
      writer: target.writer,
      needsStdioType: target.needsStdioType,
      apiUrl,
      force,
      preferIncomingEnv: ['TMAIL_API_URL'],
    });
    merged.push(path.relative(projectRoot, resolved));
  }
  return merged;
}

export async function runInit(argv: string[], flags: Record<string, string | boolean> = {}): Promise<void> {
  const { apiUrl, explicitConfig, explicitRootKey, explicitHostIds, skipMcpConfig, force, yes } = resolveInitOptions(
    argv,
    flags,
  );
  if (!apiUrl) {
    throw new Error(
      'Usage: npx @tmail/mcp init <api_url> [--host cursor] [--config ./path/mcp.json] [--skip-mcp-config] [-y]',
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(apiUrl);
  } catch {
    throw new Error(`invalid api_url: ${apiUrl}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`api_url must be http or https, got: ${parsed.protocol}`);
  }

  const projectRoot = process.cwd();
  const mainDirRaw = process.env.TMAIL_MAIN_DIR?.trim() || '.tmail';
  const layout = resolveStorageLayout(mainDirRaw, projectRoot);
  const { mainDir, mainDirRel } = layout;

  const mainOutsideProject =
    path.isAbsolute(mainDir) &&
    !mainDir.startsWith(path.resolve(projectRoot) + path.sep) &&
    mainDir !== path.resolve(projectRoot);

  let gateFile: string;
  if (mainOutsideProject) {
    process.stderr.write(
      `WARN  TMAIL_MAIN_DIR points outside project root — AGENT-GATE.md will be written to ${path.join(projectRoot, '.tmail')}/ only\n`,
    );
    process.stderr.write(
      '      Production: run init without absolute TMAIL_MAIN_DIR; bind profiles on a dedicated OS user\n',
    );
    gateFile = path.join(projectRoot, '.tmail', 'AGENT-GATE.md');
  } else {
    gateFile = path.join(mainDir, 'AGENT-GATE.md');
  }

  process.stderr.write('==> Using bundled agent-gate.md from @tmail/mcp\n');
  const gateBody = loadBundledAgentGate(apiUrl);
  await fs.promises.mkdir(path.dirname(gateFile), { recursive: true });
  await fs.promises.writeFile(gateFile, gateBody.endsWith('\n') ? gateBody : gateBody + '\n');
  const agentsMd = path.join(projectRoot, 'AGENTS.md');
  const gitignore = path.join(projectRoot, '.gitignore');
  process.stderr.write(`==> Updating ${agentsMd}\n`);
  patchAgentsMd(agentsMd, gateBody);
  process.stderr.write(`==> Updating ${gitignore}\n`);
  ensureGitignoreEntries(gitignore, [`${mainDirRel}/`]);

  let mcpLines = '';
  if (!skipMcpConfig) {
    try {
      const targets = await resolveMcpTargetsForInit(projectRoot, {
        explicitConfig,
        explicitRootKey,
        explicitHostIds,
        yes,
      });
      const merged = await mergeMcpTargets(projectRoot, targets, apiUrl, force);
      if (merged.length === 0) {
        mcpLines = `  - (manual MCP setup — configure tmail block yourself)\n\n${MCP_MANUAL_SETUP_HINT}`;
      } else {
        mcpLines = merged.map((rel) => `  - ${rel} (tmail block, TMAIL_API_URL=${apiUrl})`).join('\n');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      mcpLines = `  - (MCP config skipped: ${message})\n\nKnown host paths:\n${formatMcpHostHints()}`;
    }
  } else {
    mcpLines = '  - (skipped MCP config — run npx @tmail/mcp configure or add tmail block manually)';
  }

  process.stdout.write(`
Done in ${projectRoot}.
Created/updated:
  - ${path.relative(projectRoot, gateFile)}
  - AGENTS.md (TMail Env Gate section between markers)
  - .gitignore (${mainDirRel}/)
${mcpLines}

Next:
  1. Fill TMAIL_BIND_INVITE in tmail env (owner Dashboard → Access)
  2. Reload MCP host once, fill TMAIL_BIND_INVITE, then run bind when a tool asks for it
`);
}

export async function runConfigure(argv: string[], flags: Record<string, string | boolean>): Promise<void> {
  const { explicitConfig, explicitRootKey, explicitHostIds, yes, force } = parseMcpCommandOptions(argv, flags);

  const projectRoot = process.cwd();
  const targets = await resolveMcpTargetsForInit(projectRoot, {
    explicitConfig,
    explicitRootKey,
    explicitHostIds,
    yes,
  });
  if (targets.length === 0) {
    process.stderr.write(`manual MCP setup:\n\n${MCP_MANUAL_SETUP_HINT}\n`);
    return;
  }
  const merged = await mergeMcpTargets(projectRoot, targets, '', force);
  for (const rel of merged) {
    process.stdout.write(`merged tmail → ${path.join(projectRoot, rel)}\n`);
  }
}

export async function runDoctor(strict: boolean): Promise<void> {
  const cfg = loadConfig();
  let issues = 0;
  const envPath = path.join(cfg.projectRoot, ENV_FILE_NAME);
  try {
    const st = await fs.promises.stat(envPath);
    const mode = st.mode & 0o777;
    if (mode & 0o077) {
      process.stdout.write(
        `WARN  legacy ${ENV_FILE_NAME} mode ${mode.toString(8)} — use tmail MCP env in IDE config; remove file or chmod 0600\n`,
      );
      issues++;
    }
  } catch {
    // env via MCP host config only
  }

  process.stdout.write('OK    MCP runtime via npx @tmail/mcp (TypeScript)\n');

  if (!cfg.apiUrl) {
    process.stdout.write('FAIL  TMAIL_API_URL empty\n');
    issues++;
  } else {
    try {
      const resp = await fetch(`${cfg.apiUrl.replace(/\/+$/, '')}/openapi.json`, {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) process.stdout.write(`OK    API ${cfg.apiUrl} reachable\n`);
      else process.stdout.write(`WARN  API ${cfg.apiUrl} returned HTTP ${resp.status}\n`);
    } catch (err) {
      process.stdout.write(`WARN  API unreachable at ${cfg.apiUrl}: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  if (process.env[ENV_PROJECT_ROOT]?.trim()) {
    process.stdout.write(
      `WARN  ${ENV_PROJECT_ROOT} is deprecated — remove from tmail MCP env; use TMAIL_MAIN_DIR only (IDE cwd = project root)\n`,
    );
    issues++;
  }

  if (process.env[ENV_PROFILE_DIR]?.trim()) {
    process.stdout.write(
      `WARN  ${ENV_PROFILE_DIR} is set (${process.env[ENV_PROFILE_DIR]}) but ignored — profiles resolve under .tmail/<wallet_slug>/profile\n`,
    );
  }

  try {
    const wallets = await listBoundWallets(cfg.mainDir);
    process.stdout.write(`OK    bound wallets: ${wallets.length}\n`);
    for (const w of wallets) {
      const paths = pathsForSlug(cfg, w.wallet_slug);
      if (hasLegacyPassphraseInJson(paths.e2eeFile)) {
        process.stdout.write(
          `WARN  legacy passphrase in e2ee.json for ${w.wallet_slug} — run e2ee-passphrase reveal then set to migrate\n`,
        );
        issues++;
      }
      try {
        const e2ee = JSON.parse(await fs.promises.readFile(paths.e2eeFile, 'utf8')) as Record<string, unknown>;
        if (e2ee.registered === true) {
          const ps = await passphraseStatus(paths, cfg.e2eePassphrase);
          if (!ps.set) {
            process.stdout.write(
              `WARN  E2EE registered but no e2ee.passphrase for ${w.wallet_slug} — run e2ee_generate_local or migrate\n`,
            );
            issues++;
          }
        }
      } catch {
        // no e2ee.json
      }
    }
  } catch (err) {
    process.stdout.write(`WARN  list bound wallets: ${err instanceof Error ? err.message : String(err)}\n`);
  }

  const res = await checkSelector(cfg, {});
  process.stdout.write(`GATE  ${res.status}\n`);
  if (res.status !== 'READY') {
    for (const msg of res.messages) process.stdout.write(`      ${msg}\n`);
  }
  if (strict && issues > 0) process.exit(1);
}

export async function runGate(walletSlug?: string): Promise<void> {
  const cfg = loadConfig();
  const res = await checkSelector(cfg, { walletSlug: walletSlug ?? '' });
  for (const msg of res.messages) process.stdout.write(`${msg}\n`);
  for (const w of res.warnings ?? []) process.stdout.write(`WARN: ${w}\n`);
  process.exit(exitCodeForStatus(res.status));
}

export async function runE2eePassphrase(
  args: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const sub = args[0];
  const slug = args[1];
  if (!sub || !slug) {
    throw new Error('usage: e2ee-passphrase reveal|set|status <wallet_slug> [--new "passphrase"]');
  }
  const cfg = loadConfig();
  const rt = await newRuntime(cfg, { walletSlug: slug }, ResolvePolicy.StrictExplicit, AuthMode.Required);

  if (sub === 'status') {
    const status = await passphraseStatus(rt.paths, cfg.e2eePassphrase);
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    return;
  }
  if (sub === 'reveal') {
    const value = await revealPassphraseForProfile(rt);
    if (!value) {
      process.stderr.write('no passphrase found for this wallet\n');
      process.exit(1);
    }
    process.stdout.write(`${value}\n`);
    return;
  }
  if (sub === 'set') {
    const newPassphrase = typeof flags.new === 'string' ? flags.new : args[2];
    if (!newPassphrase?.trim()) {
      throw new Error('set requires --new "passphrase" (min 16 characters)');
    }
    const result = await changePassphraseForProfile(rt, newPassphrase.trim());
    if (!result.ok) {
      process.stderr.write(`${result.error}\n`);
      process.exit(1);
    }
    process.stdout.write('passphrase updated (private key re-encrypted)\n');
    return;
  }
  throw new Error(`unknown e2ee-passphrase subcommand: ${sub}`);
}

export function packageDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}
