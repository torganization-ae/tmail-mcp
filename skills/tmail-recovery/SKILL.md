---
name: tmail-recovery
description: "Recovery only after Env Gate passed — rotate/revoke, lost keys, max API keys, path migration. Not for first-time setup."
---

# TMail Recovery Playbook (REST)

Use this skill when normal auth flow is broken, keys are lost/revoked, or local `.tmail` paths are inconsistent.

**Not for first-time setup:** If `TMAIL_API_URL` is empty in mcpServers.tmail.env or user never completed bind → use **tmail-agent-setup** Env Gate + bootstrap, **not** this skill.

**§SetupNotRecovery:** Do not use this skill when `TMAIL_BIND_INVITE` is empty and no bound profile exists under `.tmail/<wallet_slug>/profile` — that is first-time setup, not recovery. Do not use refresh/login to bypass missing bind_invite.

This playbook does not introduce new env variables.

---

## Inputs

- Current error condition (`401`, `409`, revoke/rotate event, path collision).
- Available local state (`session.json`, `meta.json`, `.tmail/<wallet_slug>/`).
- Access to owner bind_invite (when re-bind is required).
- `TMAIL_API_URL`.

## Prechecks

1. Call **`tmail_gate_check`** — if `WAIT_ENV_BIND`, `SETUP_BIND`, `SETUP_FINISH`, `STOP`, or `INVALID_SESSION` → **tmail-agent-setup**, not this skill.
2. Recovery requires prior successful bind evidence: `$TMAIL_PROFILE_DIR/meta.json` with non-empty `sub_address`, OR explicit owner rotate/revoke event documented by user.
3. Env Gate from **tmail-agent-setup** passed.
4. Incident type is identified using API response codes and local file state.

## Incident matrix

| Code / symptom | Likely cause | Recovery path | bind_invite needed? |
|---|---|---|---|
| `401 api key invalid or revoked` (sub key) | sub key revoked or owner rotated | `tmail_sub_login` → save inline `api_key` | no (login) |
| `401 sub-account has been revoked` | owner revoked sub | re-bind with `tmail_sub_bind` | yes |
| `401 owner anchor key is revoked` | owner rotated bundle | owner re-issue; sub re-bind | yes (new invite) |
| `409 max API keys` | 3 active keys on sub | human revokes old key via owner API | n/a |
| Lost `session.json` but bind existed | local file loss | `tmail_sub_login` with TonProof | no |
| `§SetupNotRecovery` | empty `TMAIL_BIND_INVITE` + no bound profile; or `401` with no `meta.json` | **STOP** — tmail-agent-setup; fill bind_invite; wait **"ready"**; bind — not refresh/login | yes |
| `§WrongPaths` | stale `.tmail/default/` or obsolete `_pending/` after bind | re-bind; MCP migrates legacy folders into `<slug>/profile` | maybe |
| Path collision | two different `sub_address` same slug folder | **STOP** — user resolves wallet conflict | — |

## Recovery steps (ordered)

1. **`tmail_gate_check`** — confirm not in setup-only state.
2. Identify wallet: **`tmail_list_wallets`** or user-provided `wallet_slug`.
3. **Login path (preferred):** `tmail_generate_payload` → `@ton/mcp` → **`tmail_sub_login`** → persist `api_key` to `${TMAIL_MAIN_DIR}/<wallet_slug>/profile/session.json`.
4. **Re-bind path:** when sub revoked or invite rotated → **`tmail_sub_bind`** with fresh `TMAIL_BIND_INVITE`.
5. Re-run **`tmail_e2ee_generate_local`** if `e2ee.json` missing or `registered=false`.
6. **`tmail_gate_check(wallet_slug=...)`** → must reach **`READY`**.

## Failure handling

| Situation | Action |
|---|---|
| re-bind succeeds but profile write fails | keep API response key safe; report path error; retry bind after fixing FS permissions |
| login succeeds but mailboxes meta empty | re-run bind/login MCP tools; do not hand-edit meta |
| owner rotated mid-recovery | stop sub login attempts; get new `bind_invite` from owner |

## Definition of done

1. **`tmail_gate_check` → `READY`** for target wallet.
2. Path state is canonical (`.tmail/<wallet_slug>/profile/...`).
3. No obsolete `.tmail/_pending/` folder (delete if empty after legacy migration).
