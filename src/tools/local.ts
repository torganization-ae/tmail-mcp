import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageRoot, ENV_FILE_NAME, ENV_PROFILE_DIR, ENV_PROJECT_ROOT, loadConfig, resolveStorageLayout } from '../config/env.js';
import {
  formatMcpHostHints,
  resolveMcpInitTargets,
  type McpHostTarget,
} from '../config/hosts.js';
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

- Gate: tmail_gate_check (MCP) or \`npx @tmail/mcp gate\` before any mail/auth
- Multi-wallet: pass wallet_slug (64hex) to gate / tmail_gate_check
- Never write \`session.json\` manually; never call tmail-recovery on first setup
- WAIT_ENV_BIND → user replies "ready" → SETUP_BIND → tmail_generate_payload → @ton/mcp → tmail_sub_bind
- SETUP_FINISH → tmail_e2ee_generate_local until READY
- AUTH_NEEDS_LOGIN → do TonProof login (no bind_invite)
- Never use owner api_key (tmail_o_*) in sub-agent env/session
- Partial profile (session without meta) → SETUP_FINISH with re-bind hint; legacy _pending → warning only

## TMail MCP-first (mandatory)

- All TMail operations via MCP tools (tmail_*), not raw curl to /api/*
- Gate: tmail_gate_check before any mail/auth
- Auth: tmail_generate_payload → @ton/mcp generate_ton_proof (flat) → tmail_sub_bind / tmail_sub_login (ton_proof_json = flat JSON string; never nested REST proof)
- Mail: tmail_send_letter, tmail_list_threads, tmail_fetch_thread
- Skills: install via \`npx skills add github.com/torganization-ae/tmail-mcp\`
- curl REST = fallback only when MCP server offline
- Reload your MCP host after filling mcpServers.tmail.env
- MCP config: \`npx @tmail/mcp init <api_url>\` auto-merges into detected IDE MCP config(s)`;

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


const DEFAULT_TMAIL_BLOCK = {
  tmail: {
    command: 'npx',
    args: ['-y', '@tmail/mcp'],
    env: {
      TMAIL_API_URL: 'https://your-api.example.com',
      TMAIL_MAIN_DIR: '.tmail',
      TMAIL_BIND_INVITE: '',
    },
  },
} as const;

function buildTmailBlock(apiUrl?: string): Record<string, unknown> {
  const tmail = {
    ...DEFAULT_TMAIL_BLOCK.tmail,
    env: { ...DEFAULT_TMAIL_BLOCK.tmail.env },
  } as Record<string, unknown>;
  const env = { ...(tmail.env as Record<string, string>) };
  delete env.TMAIL_PROJECT_ROOT;
  if (apiUrl) {
    env.TMAIL_API_URL = apiUrl;
  }
  tmail.env = env;
  return { tmail };
}

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

function mergeConfig(
  cfg: Record<string, unknown>,
  rootKey: string,
  tmailBlock: Record<string, unknown>,
  preferIncomingEnv: string[] = [],
) {
  const root = { ...cfg };
  const servers = (root[rootKey] as Record<string, unknown>) ?? {};
  const existing = (servers.tmail as Record<string, unknown>) ?? {};
  const incoming = ((tmailBlock.tmail as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  const oldEnv = (existing.env as Record<string, string>) ?? {};
  const newEnv = (incoming.env as Record<string, string>) ?? {};
  servers.tmail = { ...existing, ...incoming, env: mergeEnv(oldEnv, newEnv, preferIncomingEnv) };
  root[rootKey] = servers;
  return root;
}

async function mergeTmailMcpConfig(opts: {
  projectRoot: string;
  configPath: string;
  rootKey: string;
  apiUrl?: string;
  force?: boolean;
  preferIncomingEnv?: string[];
}): Promise<string> {
  const projectRoot = path.resolve(opts.projectRoot);
  const resolved = path.resolve(projectRoot, opts.configPath);
  const rel = path.relative(projectRoot, resolved);
  if (!opts.force && (rel.startsWith('..') || path.isAbsolute(rel))) {
    throw new Error(`config path must be inside project root (${projectRoot}); use --force to override`);
  }
  const tmailBlock = buildTmailBlock(opts.apiUrl);
  let cfg: Record<string, unknown> = {};
  if (fs.existsSync(resolved)) {
    cfg = JSON.parse(fs.readFileSync(resolved, 'utf8')) as Record<string, unknown>;
  }
  const merged = mergeConfig(cfg, opts.rootKey, tmailBlock, opts.preferIncomingEnv ?? []);
  await fs.promises.mkdir(path.dirname(resolved), { recursive: true });
  const tmp = `${resolved}.tmp.${process.pid}`;
  await fs.promises.writeFile(tmp, JSON.stringify(merged, null, 2) + '\n');
  await fs.promises.rename(tmp, resolved);
  return resolved;
}

function resolveInitOptions(
  argv: string[],
  flags: Record<string, string | boolean>,
): {
  apiUrl: string;
  explicitConfig?: string;
  explicitRootKey?: string;
  skipMcpConfig: boolean;
  force: boolean;
} {
  let explicitConfig: string | undefined;
  let explicitRootKey: string | undefined;
  let skipMcpConfig = Boolean(flags['skip-mcp-config']);
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--skip-mcp-config') {
      skipMcpConfig = true;
    } else if (arg === '--config' && argv[i + 1]) {
      explicitConfig = argv[++i];
    } else if (arg === '--root-key' && argv[i + 1]) {
      explicitRootKey = argv[++i];
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }
  if (typeof flags.config === 'string') explicitConfig = flags.config;
  if (typeof flags['root-key'] === 'string') explicitRootKey = flags['root-key'];
  const apiUrl = (positional[0] || '').replace(/\/+$/, '');
  return { apiUrl, explicitConfig, explicitRootKey, skipMcpConfig, force: Boolean(flags.force) };
}

async function mergeMcpTargets(
  projectRoot: string,
  targets: McpHostTarget[],
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
      apiUrl,
      force,
      preferIncomingEnv: ['TMAIL_API_URL'],
    });
    merged.push(path.relative(projectRoot, resolved));
  }
  return merged;
}

export async function runInit(argv: string[], flags: Record<string, string | boolean> = {}): Promise<void> {
  const { apiUrl, explicitConfig, explicitRootKey, skipMcpConfig, force } = resolveInitOptions(argv, flags);
  if (!apiUrl) {
    throw new Error('Usage: npx @tmail/mcp init <api_url> [--config ./path/mcp.json] [--skip-mcp-config]');
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
    const targets = resolveMcpInitTargets(projectRoot, {
      explicitConfig,
      explicitRootKey,
    });
    if (targets.length === 0) {
      mcpLines = `  - (no IDE MCP config detected — run npx @tmail/mcp init <api_url> or add tmail block manually)\n\nKnown host paths:\n${formatMcpHostHints()}`;
    } else {
      const merged = await mergeMcpTargets(projectRoot, targets, apiUrl, force);
      mcpLines = merged.map((rel) => `  - ${rel} (tmail block, TMAIL_API_URL=${apiUrl})`).join('\n');
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
  2. Reload MCP host once, then tell your agent: "env is set" → tmail_gate_check → setup flow
`);
}

export async function runConfigure(argv: string[], flags: Record<string, string | boolean>): Promise<void> {
  let explicitConfig: string | undefined;
  let explicitRootKey: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--config' && argv[i + 1]) explicitConfig = argv[++i];
    else if (argv[i] === '--root-key' && argv[i + 1]) explicitRootKey = argv[++i];
  }
  if (typeof flags.config === 'string') explicitConfig = flags.config;
  if (typeof flags['root-key'] === 'string') explicitRootKey = flags['root-key'];

  const projectRoot = process.cwd();
  const targets = resolveMcpInitTargets(projectRoot, {
    explicitConfig,
    explicitRootKey,
  });
  if (targets.length === 0) {
    throw new Error(`no MCP host config detected; use --config or create one of:\n${formatMcpHostHints()}`);
  }
  const merged = await mergeMcpTargets(projectRoot, targets, '', Boolean(flags.force));
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
        `WARN  legacy ${ENV_FILE_NAME} mode ${mode.toString(8)} — use mcpServers.tmail.env; remove file or chmod 0600\n`,
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
      `WARN  ${ENV_PROJECT_ROOT} is deprecated — remove from mcpServers.tmail.env; use TMAIL_MAIN_DIR only (IDE cwd = project root)\n`,
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
