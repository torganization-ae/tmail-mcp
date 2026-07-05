# TMail Env Gate (MCP-first)

Before any TMail operation (send, read, bind, mailbox, webhook, NFT):

1. **Primary (after MCP install):** MCP tool **`tmail_gate_check`** with explicit **`wallet_slug`** / **`sub_address`** when multiple wallets exist. Do **not** use raw `curl` to `/api/*` for gate or mail ops.
2. **List wallets:** **`tmail_list_wallets`** — use before mutating ops when unsure which profile is active.
3. **CLI equivalent:** `npx @tmail/mcp gate [wallet_slug]` — exit codes: 0 = READY / WAIT_ENV_BIND / AUTH_NEEDS_LOGIN / SETUP_BIND / SETUP_FINISH; 1 = STOP (rare resolver errors); 2 = reserved. **First install:** empty `TMAIL_API_URL` → `WAIT_ENV_BIND` (exit 0), not STOP.
4. Run **tmail-agent-setup → Env Gate** and **Ready-state checklist (§10)** when gate output requires it.
6. If `TMAIL_API_URL` is empty in **`mcpServers.tmail.env`** OR (no non-empty `api_key` in active wallet profile AND `TMAIL_BIND_INVITE` is empty for first bind):
   - Gate returns **`WAIT_ENV_BIND`** (exit 0) with hints — add `.tmail/` to `.gitignore` if missing (warning only, does not block READY)
   - Tell the user to fill **`mcpServers.tmail.env`**: `TMAIL_API_URL`, `TMAIL_BIND_INVITE` (`tmail_i_*` from owner bundle), `TMAIL_MAIN_DIR`
   - **Reload MCP host** after env changes
   - **No mail/domain MCP tools** until env is filled (setup auth allowed after user **"ready"** per **API timing**)
7. Send/read only when **`tmail_gate_check`** returns **`status: READY`** and Ready §10 is fully true.
8. On first-time setup use **tmail-agent-setup**, not **tmail-recovery**.

## MCP tools (primary)

| Task | MCP tool |
|------|----------|
| Gate | `tmail_gate_check` |
| Wallets on disk | `tmail_list_wallets` |
| Auth probe | `tmail_auth_status` |
| Mailboxes | `tmail_list_mailboxes` |
| Limits | `tmail_get_limits` |
| Threads | `tmail_list_threads`, `tmail_fetch_thread` |
| Send | `tmail_send_letter` |
| Bind / login | `tmail_generate_payload` → `@ton/mcp generate_ton_proof` (flat proof) → `tmail_sub_bind` / `tmail_sub_login` (`ton_proof_json` = flat JSON string) |
| Webhook | `tmail_webhook_set`, `tmail_webhook_get`, `tmail_webhook_delete`, `tmail_webhook_rotate_secret` |
| E2EE | `tmail_e2ee_generate_local`, `tmail_e2ee_register` |

**REST fallback:** only when MCP server offline — see **tmail-sub-agent-api**.

## Storage layout (multi-wallet)

**`mcpServers.tmail.env`** holds **global** settings only:

```json
{
  "TMAIL_API_URL": "{{BASE_URL}}",
  "TMAIL_MAIN_DIR": ".tmail",
  "TMAIL_BIND_INVITE": ""
}
```

`TMAIL_MAIN_DIR` — storage root (default `.tmail`, relative to IDE workspace cwd, or absolute path). Per-wallet paths are **derived at runtime** (never pinned in MCP env):

- Pre-bind: **no profile folder** — created only after `tmail_sub_bind` / `tmail_sub_login` succeeds
- Post-bind profile: `${TMAIL_MAIN_DIR}/<wallet_slug>/profile`
- **Mail data:** live API only — no local mail cache on disk
- `wallet_slug` = 64-char hex from `sub_address` (see **tmail-agent-setup → Path layout**)

Multiple sub wallets = sibling folders under one `TMAIL_MAIN_DIR`.

- **0 bound:** gate checks env only (no on-disk profile).
- **1 bound:** auto-selects that wallet when selector omitted (read ops).
- **2+ bound:** **must** pass `wallet_slug` or `sub_address` — otherwise gate returns **`SETUP_FINISH`** with wallet list (exit 0), not hard STOP.
- **Strict ops** (send, E2EE local/register, webhook set/rotate, NFT): `wallet_slug` **required** even with one wallet if policy is strict — use value from bind response.

**Note:** In skills, `$TMAIL_PROFILE_DIR` means **derived** path `.tmail/<wallet_slug>/profile` — not the `TMAIL_PROFILE_DIR` env var (ignored; doctor warns if set).

## Source of truth (only these)

1. **`mcpServers.tmail.env`** → `TMAIL_MAIN_DIR`, `TMAIL_BIND_INVITE`, `TMAIL_API_URL`
2. Derived paths from `sub_address` + files at those paths only
3. **Never** chat history, old `tmail-profile-*` folders, keys from logs, or guessed secrets
4. **Never** put per-wallet paths in MCP env — blocks multi-wallet

## Forbidden (hard stop)

- Do not write or edit `session.json` manually — credentials live in profile files after bind/login MCP tools (not in tool response text)
- Do not use chat transcripts or stale profile folders as auth state
- Do not call **tmail-recovery** if Ready §10 was never true
- Do not call mail/domain MCP tools until **`tmail_gate_check` → READY** and §10 true
- Do not use raw `curl` to `/api/*` when MCP tools are available (including `/api/auth/generate-payload` during setup)
- Do not pass broken proof JSON to **`tmail_sub_bind`** / **`tmail_sub_login`** — prefer **flat** `@ton/mcp generate_ton_proof` in **`ton_proof_json`** (MCP auto-converts nested REST if needed)
- Setup auth (`tmail_generate_payload`, `tmail_sub_bind`, `tmail_sub_login`, `tmail_e2ee_generate_local`, `tmail_e2ee_register`) allowed on **WAIT_ENV_BIND**, **SETUP_BIND**, **SETUP_FINISH**, **AUTH_NEEDS_LOGIN** per **tmail-agent-setup → API timing**

## Human-only key operations

- Sub-agent must never use owner `api_key` (`tmail_o_*`) or ask user to place it into sub-agent env.
- Sub-agent key rotation/revoke flows are human-only (`/api/acc/keys/*` management, owner rotate/revoke).
- TON operator key rotation tools are human-only (`agentic_rotate_operator_key`, `agentic_complete_rotate_operator_key`).
- Sub-agent auth: **`tmail_sub_bind`** / **`tmail_sub_login`** with TonProof from the sub-agent wallet; persist session via MCP bind/login (read `session.json`, never parse tool output for secrets).
- **`tmail_generate_payload`**, **`tmail_sub_bind`**, **`tmail_sub_login`** use **AuthModeNone** — MCP never sends `Authorization: Bearer` on these unauthenticated endpoints.
- After bind/login API OK, MCP verifies **Ton proof address matches `sub_address`** (T14) before writing `session.json`.
- `bind_invite` is allowed with sub-agent TonProof on **`tmail_sub_bind`** (first bind). Owner wallet proof is forbidden.

## Partial / legacy profile artifacts

If a profile `session.json` has `api_key` BUT `meta.json` is missing, or obsolete `.tmail/_pending/` exists:

- **`tmail_gate_check`** → **`SETUP_FINISH`** (or **`SETUP_BIND`** on zero-wallet first install) with **`warnings`**
- Obsolete `_pending`: `rm -rf .tmail/_pending` (safe)
- Corrupt bound session: delete `session.json`, re-run **`tmail_sub_bind`** / **`tmail_sub_login`** via MCP

## User confirmation gate

Between **WAIT_ENV_BIND** and bind: user must reply **"ready"** / **"env is set"** after filling **`mcpServers.tmail.env`** and **Reload MCP host**.

Setup (project scaffold in cwd):

```bash
npx -y @tmail/mcp@1.0.0 init "$TMAIL_API_URL"
```

Run `npx @tmail/mcp init {{BASE_URL}}` (auto-merges IDE MCP config when detected). Reload your MCP host. Then use **`tmail_gate_check`** (or `npx @tmail/mcp gate`) before mail/domain ops.
