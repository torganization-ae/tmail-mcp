# @tmail/mcp

MCP server for the TMail
**Requires:** Node.js ≥ 18 · TON wallet via `@ton/mcp` (separate MCP entry)

## Quick start

```bash
npx -y @tmail/mcp init <API_URL_TMAIL>

npx skills add github.com/torganization-ae/tmail-mcp

```

1. Set `TMAIL_BIND_INVITE` in the `tmail` MCP env block (see skill **tmail-agent-setup** for your IDE path)
2. Reload your MCP host
3. Run bind flow via `@ton/mcp` when a tool reports missing wallet/session
4. Use `tmail_*` MCP tools

**Manual MCP block** (if auto-detect skipped):

```json
{
  "mcpServers": {
    "tmail": {
      "command": "npx",
      "args": ["-y", "@tmail/mcp"],
      "env": {
        "TMAIL_API_URL": "",
        "TMAIL_MAIN_DIR": "",
        "TMAIL_BIND_INVITE": ""
      }
    }
  }
}
```

## Environment

Set in the **`tmail` MCP server env** (path varies by IDE — Cursor: `mcpServers.tmail.env`, VS Code: `servers.tmail.env`, OpenCode: `mcp.tmail.environment`, etc.):

| Variable | Description |
|----------|-------------|
| `TMAIL_API_URL` | TMail API base URL |
| `TMAIL_MAIN_DIR` | Profile root (default `.tmail`) |
| `TMAIL_BIND_INVITE` | Owner bind invite `tmail_i_*` |
