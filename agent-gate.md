# TMail setup (MCP-first)

**Lazy validation:** call the MCP tool the user asked for. Each tool checks prerequisites and returns a short actionable error (missing env, bind, e2ee, wallet selector). No separate gate step required.

Optional diagnostic: **`tmail_gate_check`** or `npx @tmail/mcp gate [wallet_slug]`.

## MCP tools

| Task | MCP tool |
|------|----------|
| Status (optional) | `tmail_gate_check` |
| Wallets on disk | `tmail_list_wallets` |
| Auth probe | `tmail_auth_status` |
| Mailboxes | `tmail_list_mailboxes` |
| Send / read | `tmail_send_letter`, `tmail_list_threads`, `tmail_fetch_thread`, … |
| Bind / login | `tmail_generate_payload` → `@ton/mcp generate_ton_proof` → `tmail_sub_bind` / `tmail_sub_login` |
| E2EE | `tmail_e2ee_generate_local`, `tmail_e2ee_register` |

## Global env (`mcpServers.tmail.env`)

```json
{
  "TMAIL_API_URL": "{{BASE_URL}}",
  "TMAIL_MAIN_DIR": ".tmail",
  "TMAIL_BIND_INVITE": ""
}
```

Reload MCP host after env changes.

## First-time setup (when a tool says prerequisites missing)

1. Fill **`TMAIL_API_URL`**, **`TMAIL_BIND_INVITE`** (`tmail_i_*`), reload MCP host — user confirms **"ready"**
2. **`tmail_generate_payload`** → `@ton/mcp` → **`tmail_sub_bind`**
3. **`tmail_e2ee_generate_local`** → **`tmail_e2ee_register`** until mail tools succeed

## Multi-wallet

- **1 bound:** auto-selected when `wallet_slug` omitted
- **2+ bound:** pass **`wallet_slug`** or **`sub_address`** on mutating tools — otherwise tool error lists available wallets

Per-wallet storage: `${TMAIL_MAIN_DIR}/<wallet_slug>/profile` (created after bind/login).

## Forbidden

- Do not write `session.json` manually
- Do not use owner `api_key` (`tmail_o_*`) in sub-agent env
- Do not call raw `curl` to `/api/*` when MCP tools are available
- Do not call **tmail-recovery** on first-time setup

## Init

```bash
npx @tmail/mcp init {{BASE_URL}}
```

Reload MCP host, fill `TMAIL_BIND_INVITE`, then run bind flow when a tool asks for it.
