---
name: tmail-nft-domain
description: "BLOCKED until Env Gate + Ready §10 (tmail-agent-setup). Mint @name.mail.ton NFT mailbox via MCP quote/prepare + @ton/mcp."
---

# NFT Domain Mint (MCP-first)

**STOP gate (step 0):** **tmail-agent-setup → Env Gate + §10** + MCP **`tmail_gate_check`** (authoritative: **tmail-agent-setup**, `.tmail/AGENT-GATE.md`). This skill runs only when gate is `READY`.

Scope: **`mailbox:read`**. Payer = authenticated wallet (from Bearer token).

**MCP tools:** `tmail_nft_quote_mint` → user confirms `total_nano` → `tmail_nft_prepare_mint` → `@ton/mcp` broadcast. REST fallback only when MCP offline.

---

## Inputs

- `api_key` with `mailbox:read`.
- Candidate local-part domain name.
- Referral address (`ref_addrs`) for referral-enabled mint flow.

## Prechecks

1. **`tmail_gate_check`** returns **`status: READY`** for active `wallet_slug` (all **tmail-agent-setup §10** checks true). Else → **STOP** per **API timing**.
2. Name passes local regex: lowercase latin, digits, middle hyphen only.
3. Wallet has enough TON for `total_nano`.
4. Caller is ready to submit every tx from `transactions[]`.

## Protocol

0. **tmail_gate_check + Env Gate + Ready §10** — call **`tmail_gate_check`**; if `status` ≠ `READY` → **STOP** (see **tmail-agent-setup → API timing**).
1. **`tmail_nft_quote_mint`** with `{name, ref_addrs?}` — returns price breakdown **without** `transactions`. If `taken:true` → stop and pick another name.
2. Show **`total_nano`** to user; **STOP** until user replies **"confirm mint"** or sends `{confirm_mint:true}`.
3. **`tmail_nft_prepare_mint`** with `user_confirmed:true` and `expected_total_nano` copied from quote. MCP re-checks `taken` and price **after API** — mismatch → re-quote.
4. Broadcast returned `transactions[]` in order via `@ton/mcp`.
5. **`tmail_list_mailboxes`** — confirm purchased row.
6. If user confirms, patch `meta.default_mailbox` to purchased row's `web3_address`.
7. Use that exact `web3_address` as `from_address`.

## Failure Matrix

| Failure | Action |
|---|---|
| name taken | stop and ask next candidate |
| tx submission fails | stop sequence and return failed tx index |
| purchased mailbox not in ownership API for current wallet | **tmail-agent-setup → Multi-wallet profile switch** |
| from_address constructed manually | **STOP** — **tmail-agent-setup → Mailbox address rules** |
| mailbox not visible after tx | refetch mailboxes and report pending state |
| mailbox minted but meta update failed | keep mint success, report meta patch failure and manual fix path |

## Done Criteria

1. All mint transactions submitted without transport error.
2. New mailbox returned by `POST /api/tbox/mailboxes` with expected `name`.
3. Mailbox selectable as `from_address` in `POST /api/tbox/letters` (rules: **tmail-send-letter**).
4. `meta.default_mailbox` updated when user requested update.

---

## Check price (MCP quote)

```
tmail_nft_quote_mint { "name": "alice", "ref_addrs": "UQ..." }
```

REST fallback (offline only):

```http
POST /api/nft/provide-mint
Authorization: Bearer <api_key>

{ "name": "alice", "ref_addrs": "UQ..." }
```

**Taken:**

```json
{ "name": "alice", "taken": true }
```

**Available:**

```json
{
  "name": "alice",
  "taken": false,
  "price_nano": "...",
  "price_full": "...",
  "gas_nano": "50000000",
  "referral_nano": "...",
  "total_nano": "...",
  "transactions": [ ... ]
}
```

**Always show `total_nano`** to the user before confirming.

## Prepare txs (MCP)

```
tmail_nft_prepare_mint {
  "name": "alice",
  "user_confirmed": true,
  "expected_total_nano": "<from quote>"
}
```

Returns `transactions[]` only when post-API price matches quote.

Gas reserve: **0.05 TON** (`50000000` nano). Referral default **10%** of price.

---

## Broadcast

For each item in `transactions[]`, call `@ton/mcp` `send_raw_transaction` with:

- `messages` (from API response item),
- `validUntil` (from API response item),
- `from` (only when explicitly present in response).

Name rules: lowercase `a-z`, `0-9`, hyphen in middle; local part only (strip `@domain`).

---

## Mint execution protocol (strict order)

1. Validate candidate name locally (regex `^[a-z0-9]+(-[a-z0-9]+)*$`).
2. Call `POST /api/nft/provide-mint`.
3. If `taken=true` -> stop and ask for another name.
4. If `taken=false`:
   - show `price_nano`, `gas_nano`, `referral_nano`, `total_nano`,
   - require explicit user confirmation.
5. Broadcast every transaction from `transactions[]` in listed order.
6. Wait for TON tx hashes/acks from `send_raw_transaction`.
7. Refresh mailboxes via `POST /api/tbox/mailboxes`.
8. Confirm new mailbox exists; copy `web3_address` exactly from API (no manual construction).

```mermaid
flowchart TD
    candidate[Candidate name] --> validate[Local regex validation]
    validate --> apiProvide[POST /api/nft/provide-mint]
    apiProvide --> taken{taken}
    taken -->|true| rename[Choose different name]
    taken -->|false| confirm[Show total_nano and confirm]
    confirm --> sendTx[Broadcast transactions[] via @ton/mcp]
    sendTx --> refreshBoxes[POST /api/tbox/mailboxes]
    refreshBoxes --> done[Mailbox appears and usable]
```

---

## After mint

```http
POST /api/tbox/mailboxes
```

New purchased mailbox appears in `mailboxes[]` with `is_free=false`. **`from_address`:** copy row `web3_address` exactly — **tmail-agent-setup → Mailbox address rules**.

Full schema: **tmail-sub-agent-api** · `GET /api/guide/tutorial`.
