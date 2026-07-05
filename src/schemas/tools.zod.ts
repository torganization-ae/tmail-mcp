import { z } from 'zod';

export const walletSelectorSchema = {
  wallet_slug: z.string().optional().describe('64-char hex wallet slug from tmail_sub_bind response'),
  sub_address: z.string().optional().describe('TON sub_address 0:<64hex> (alternative to wallet_slug)'),
  api_key_prefix: z.string().optional().describe('Optional api_key prefix for disambiguation'),
};

export const toolInputSchemas: Record<string, z.ZodRawShape> = {
  tmail_gate_check: { ...walletSelectorSchema },
  tmail_list_wallets: { ...walletSelectorSchema },
  tmail_auth_status: { ...walletSelectorSchema },
  tmail_list_mailboxes: {
    ...walletSelectorSchema,
    offset: z.number().optional(),
    limit: z.number().optional(),
  },
  tmail_get_limits: { ...walletSelectorSchema },
  tmail_list_threads: {
    ...walletSelectorSchema,
    mailbox: z.string().optional(),
    folder: z.string().optional(),
    offset: z.number().optional(),
    limit: z.number().optional(),
    unread_only: z.boolean().optional(),
    include_last_letter: z.boolean().optional(),
    as_seceml: z.boolean().optional(),
    sort_order_timestamp: z.string().optional(),
  },
  tmail_fetch_thread: {
    ...walletSelectorSchema,
    thread_id: z.string(),
    mailbox: z.string().optional(),
    is_draft: z.boolean().optional(),
    as_seceml: z.boolean().optional(),
    mark_read: z.boolean().optional(),
  },
  tmail_send_letter: {
    ...walletSelectorSchema,
    from_address: z.string().optional(),
    to: z.string().optional(),
    to_list: z.array(z.string()).optional(),
    subject: z.string().optional(),
    body_html: z.string().optional(),
    body_plain: z.string().optional(),
    in_reply_to: z.string().optional(),
    thread_id: z.string().optional(),
    eml_base64: z.string().optional(),
    report_encryption: z.boolean().optional(),
    attachments_json: z.string().optional(),
  },
  tmail_generate_payload: { ...walletSelectorSchema },
  tmail_sub_bind: {
    wallet_slug: z.string().optional(),
    bind_invite: z.string().optional(),
    ton_proof_json: z
      .string()
      .describe(
        'TonProof JSON string: preferred flat @ton/mcp generate_ton_proof (domainValue, walletStateInit, timestamp). MCP also auto-converts nested REST { address, proof: { domain } }.',
      ),
    payload: z.string().optional(),
    name: z.string().optional(),
    lang_code: z.string().optional(),
  },
  tmail_sub_login: {
    ...walletSelectorSchema,
    ton_proof_json: z
      .string()
      .describe(
        'TonProof JSON string: preferred flat @ton/mcp generate_ton_proof (domainValue, walletStateInit, timestamp). MCP also auto-converts nested REST { address, proof: { domain } }.',
      ),
    payload: z.string().optional(),
    name: z.string().optional(),
    lang_code: z.string().optional(),
  },
  tmail_webhook_set: {
    ...walletSelectorSchema,
    url: z.string(),
    secret: z.string().optional().describe('Optional — auto-generated if omitted (min 16 chars)'),
  },
  tmail_webhook_get: { ...walletSelectorSchema },
  tmail_webhook_delete: { ...walletSelectorSchema },
  tmail_webhook_rotate_secret: {
    ...walletSelectorSchema,
    new_secret: z.string().optional(),
  },
  tmail_e2ee_generate_local: {
    ...walletSelectorSchema,
    passphrase: z.string().optional().describe('Deprecated — omit for auto-generate; use CLI for manual passphrase'),
    register: z.boolean().optional(),
  },
  tmail_e2ee_passphrase_status: { ...walletSelectorSchema },
  tmail_e2ee_passphrase_reveal: { ...walletSelectorSchema },
  tmail_e2ee_change_passphrase: {
    ...walletSelectorSchema,
    new_passphrase: z.string().describe('New passphrase (min 16 chars) — human-only via CLI preferred'),
  },
  tmail_e2ee_register: {
    ...walletSelectorSchema,
    pub_key_base64: z.string(),
  },
  tmail_e2ee_get: { ...walletSelectorSchema },
  tmail_e2ee_lookup: {
    ...walletSelectorSchema,
    addresses: z.array(z.string()),
  },
  tmail_nft_quote_mint: {
    ...walletSelectorSchema,
    name: z.string(),
    ref_addrs: z.string().optional(),
  },
  tmail_nft_prepare_mint: {
    ...walletSelectorSchema,
    name: z.string(),
    ref_addrs: z.string().optional(),
    user_confirmed: z.boolean(),
    expected_total_nano: z.string(),
  },
  tmail_fetch_letters: {
    ...walletSelectorSchema,
    letter_ids: z.array(z.string()),
    mailbox: z.string().optional(),
    is_draft: z.boolean().optional(),
    as_seceml: z.boolean().optional(),
    mark_read: z.boolean().optional(),
  },
  tmail_list_folders: {
    ...walletSelectorSchema,
    mailbox: z.string().optional(),
  },
  tmail_mark_threads_seen: {
    ...walletSelectorSchema,
    thread_ids: z.array(z.string()),
    seen_flag: z.boolean(),
    mailbox: z.string().optional(),
  },
};

export interface ToolContract {
  name: string;
  method: string;
  path: string;
  operationId?: string;
  scope?: string;
  gateCategory: string;
}

export function toolContracts(): ToolContract[] {
  return [
    { name: 'tmail_auth_status', method: 'GET', path: '/api/tbox/limits', operationId: 'tbox-get-limits', scope: 'mail:read', gateCategory: 'setup_auth' },
    { name: 'tmail_generate_payload', method: 'POST', path: '/api/auth/generate-payload', operationId: 'generate-payload', gateCategory: 'setup_auth' },
    { name: 'tmail_sub_bind', method: 'POST', path: '/api/subacc/auth/bind', operationId: 'subaccount-bind', gateCategory: 'setup_auth' },
    { name: 'tmail_sub_login', method: 'POST', path: '/api/subacc/auth/login', operationId: 'subaccount-login', gateCategory: 'setup_auth' },
    { name: 'tmail_list_mailboxes', method: 'POST', path: '/api/tbox/mailboxes', operationId: 'tbox-list-mailboxes', scope: 'mailbox:read', gateCategory: 'mail_ops' },
    { name: 'tmail_get_limits', method: 'GET', path: '/api/tbox/limits', operationId: 'tbox-get-limits', scope: 'mail:read', gateCategory: 'mail_ops' },
    { name: 'tmail_list_threads', method: 'POST', path: '/api/tbox/threads', operationId: 'tbox-list-threads', scope: 'mail:read', gateCategory: 'mail_ops' },
    { name: 'tmail_fetch_thread', method: 'POST', path: '/api/tbox/threads/letters', operationId: 'tbox-fetch-thread-letters', scope: 'mail:read', gateCategory: 'mail_ops' },
    { name: 'tmail_send_letter', method: 'POST', path: '/api/tbox/letters', operationId: 'tbox-send-letter', scope: 'mail:send', gateCategory: 'mail_ops' },
    { name: 'tmail_webhook_set', method: 'PUT', path: '/api/tbox/webhook', operationId: 'tbox-set-webhook', scope: 'webhook:manage', gateCategory: 'mail_ops' },
    { name: 'tmail_webhook_get', method: 'GET', path: '/api/tbox/webhook', operationId: 'tbox-get-webhook', scope: 'webhook:manage', gateCategory: 'mail_ops' },
    { name: 'tmail_webhook_delete', method: 'DELETE', path: '/api/tbox/webhook', operationId: 'tbox-delete-webhook', scope: 'webhook:manage', gateCategory: 'mail_ops' },
    { name: 'tmail_webhook_rotate_secret', method: 'POST', path: '/api/tbox/webhook/rotate-secret', operationId: 'tbox-rotate-webhook-secret', scope: 'webhook:manage', gateCategory: 'mail_ops' },
    { name: 'tmail_e2ee_generate', method: 'POST', path: '/api/tbox/keys/generate', operationId: 'tbox-generate-key-pair', scope: 'e2ee:manage', gateCategory: 'setup_auth' },
    { name: 'tmail_e2ee_generate_local', method: 'PUT', path: '/api/tbox/keys', operationId: 'tbox-update-pub-key', scope: 'e2ee:manage', gateCategory: 'setup_auth' },
    { name: 'tmail_e2ee_register', method: 'PUT', path: '/api/tbox/keys', operationId: 'tbox-update-pub-key', scope: 'e2ee:manage', gateCategory: 'setup_auth' },
    { name: 'tmail_e2ee_get', method: 'GET', path: '/api/tbox/keys', operationId: 'tbox-get-pub-key', scope: 'e2ee:manage', gateCategory: 'mail_ops' },
    { name: 'tmail_e2ee_lookup', method: 'POST', path: '/api/tbox/keys/lookup', operationId: 'tbox-lookup-pub-keys', scope: 'e2ee:manage', gateCategory: 'mail_ops' },
    { name: 'tmail_nft_quote_mint', method: 'POST', path: '/api/nft/provide-mint', operationId: 'nft-provide-mint', scope: 'mailbox:read', gateCategory: 'mail_ops' },
    { name: 'tmail_nft_prepare_mint', method: 'POST', path: '/api/nft/provide-mint', operationId: 'nft-provide-mint', scope: 'mailbox:read', gateCategory: 'mail_ops' },
    { name: 'tmail_fetch_letters', method: 'POST', path: '/api/tbox/letters/fetch', operationId: 'tbox-fetch-letters', scope: 'mail:read', gateCategory: 'mail_ops' },
    { name: 'tmail_list_folders', method: 'POST', path: '/api/tbox/folders', operationId: 'tbox-list-folders', scope: 'mail:read', gateCategory: 'mail_ops' },
    { name: 'tmail_mark_threads_seen', method: 'POST', path: '/api/tbox/threads/seen', operationId: 'tbox-mark-threads-seen', scope: 'mail:write', gateCategory: 'mail_ops' },
  ];
}
