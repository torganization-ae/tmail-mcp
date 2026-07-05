# @tmail/mcp

MCP server for the TMail REST API. Agents call `tmail_*` tools; mail/auth setup is driven by skills and `.tmail/AGENT-GATE.md` after `init`.

**Requires:** Node.js ≥ 18 · TON wallet via `@ton/mcp` (separate MCP entry)

## Quick start

```bash
cd ~/my-agent-project

npx skills add github.com/torganization-ae/tmail-mcp
# or: npx skills add @tmail/mcp

npx -y @tmail/mcp init https://your-api.example.com
```

`init` creates `.tmail/AGENT-GATE.md`, updates `AGENTS.md` / `.gitignore`, and merges a tmail block into your IDE MCP config when detected.

Then:

1. Set `TMAIL_BIND_INVITE` (`tmail_i_*` from owner) in `mcpServers.tmail.env`
2. Reload your MCP host
3. Agent: `tmail_gate_check` → bind flow (`tmail_generate_payload` → `@ton/mcp` → `tmail_sub_bind` → `tmail_e2ee_generate_local`)

Use `tmail_*` MCP tools — not raw `curl` to `/api/*`.

**Manual MCP block** (if auto-detect skipped):

```json
{
  "mcpServers": {
    "tmail": {
      "command": "npx",
      "args": ["-y", "@tmail/mcp"],
      "env": {
        "TMAIL_API_URL": "https://your-api.example.com",
        "TMAIL_MAIN_DIR": ".tmail",
        "TMAIL_BIND_INVITE": ""
      }
    }
  }
}
```

Override config path: `npx @tmail/mcp init <url> --config ./.vscode/mcp.json --root-key servers`

## Environment

Set in **`mcpServers.tmail.env`** (IDE MCP config). Reload the host after changes.

| Variable | Required | Description |
|----------|----------|-------------|
| `TMAIL_API_URL` | yes | TMail API base URL (`https://…`) |
| `TMAIL_MAIN_DIR` | no | Profile root — default `.tmail` (relative to workspace cwd) |
| `TMAIL_BIND_INVITE` | setup | Owner bind invite `tmail_i_*` |

## CLI

| Command | Purpose |
|---------|---------|
| `npx @tmail/mcp` | stdio MCP server (default) |
| `npx @tmail/mcp init <api_url>` | Scaffold `.tmail/` + merge IDE MCP config |
| `npx @tmail/mcp configure` | Re-merge MCP block |
| `npx @tmail/mcp gate [wallet]` | Env gate check |
| `npx @tmail/mcp doctor [--strict]` | Diagnostics |
| `npx @tmail/mcp --http <port>` | HTTP MCP on localhost only (optional) |

HTTP mode: set `TMAIL_MCP_TOKEN` in service env and `X-TMail-Mcp-Token` header. Default workflow uses stdio — no localhost URL needed.

## MCP tools

27 tools — catalog via MCP resource `tmail://tools/catalog` or `subagent-coverage.json` in the package.

Setup flow: `tmail_sub_bind` or `tmail_sub_login` → `tmail_e2ee_generate_local` → `tmail_gate_check` → **READY** → mail ops.

## npm package contents

```
dist/                    cli + programmatic export
skills/                  agent skills (npx skills add)
agent-gate.md            copied to .tmail/ on init
subagent-coverage.json   tool catalog metadata
```

## Development

```bash
git clone https://github.com/torganization-ae/tmail-mcp
cd tmail-mcp
npm install
npm run build
npm test
```
