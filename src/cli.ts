#!/usr/bin/env node
import { runConfigure, runDoctor, runE2eePassphrase, runGate, runInit } from './tools/local.js';
import { startHttpMCP, startStdioMCP } from './factory.js';

function printHelp(): void {
  process.stdout.write(`@tmail/mcp — TMail MCP server (TypeScript)

Usage:
  npx @tmail/mcp                    Start stdio MCP server
  npx @tmail/mcp --http <port>       Start HTTP MCP on localhost (port required)
  npx @tmail/mcp init <api_url>     Scaffold .tmail/ + merge IDE MCP config
    --host cursor                     Pick MCP host (cursor, vscode, windsurf, …)
    --config ./path/mcp.json          Force a specific MCP config path
    --root-key mcpServers             Root key when using --config (VS Code: servers)
    --skip-mcp-config                 Skip MCP config merge (manual paste)
    --force                           Allow config outside project root
    -y, --yes                         Non-interactive (requires --host or .tmail/host-lock.json)
  npx @tmail/mcp configure          Re-merge tmail block into MCP config
    --host cursor                     MCP host when no project mcp.json exists yet
    --config ./path/mcp.json          Force config path
    --force                         Allow config outside project root
    -y, --yes                         Non-interactive (requires --host or .tmail/host-lock.json)
  npx @tmail/mcp gate [wallet]      Env gate check
  npx @tmail/mcp doctor [--strict]  Diagnostics
  npx @tmail/mcp e2ee-passphrase reveal|set|status <wallet_slug>
                                    Human-only passphrase ops (run as service user)

See README.md and skills/ for setup.
`);
}

function parseFlags(argv: string[]): { flags: Record<string, string | boolean>; rest: string[] } {
  const flags: Record<string, string | boolean> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') flags.force = true;
    else if (arg === '-y' || arg === '--yes') flags.yes = true;
    else if (arg === '--help' || arg === '-h') flags.help = true;
    else if (arg === '--strict') flags.strict = true;
    else if (arg === '--http') {
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        flags.http = next;
        i++;
      } else {
        flags.http = true;
      }
    } else if (arg.startsWith('--')) {
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        flags[arg.slice(2)] = next;
        i++;
      } else {
        flags[arg.slice(2)] = true;
      }
    } else {
      rest.push(arg);
    }
  }
  return { flags, rest };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { flags, rest } = parseFlags(argv);

  if (flags.help) {
    printHelp();
    return;
  }

  const sub = rest[0];
  if (sub === 'init') {
    await runInit(rest.slice(1), flags);
    return;
  }
  if (sub === 'configure') {
    await runConfigure(rest.slice(1), flags);
    return;
  }
  if (sub === 'gate') {
    await runGate(rest[1]);
    return;
  }
  if (sub === 'doctor') {
    await runDoctor(Boolean(flags.strict));
    return;
  }
  if (sub === 'e2ee-passphrase') {
    await runE2eePassphrase(rest.slice(1), flags);
    return;
  }

  if (flags.http !== undefined) {
    if (flags.http === true) {
      process.stderr.write('usage: npx @tmail/mcp --http <port>\n');
      process.exit(1);
    }
    const port = Number(flags.http);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      process.stderr.write('invalid port — use: npx @tmail/mcp --http <port>\n');
      process.exit(1);
    }
    await startHttpMCP(port);
    return;
  }

  await startStdioMCP();
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
