import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../config/env.js';
import { ResolvePolicy } from '../profile/selector.js';
import { ResolveError } from '../profile/errors.js';
import { toolInputSchemas } from '../schemas/tools.zod.js';
import {
  authStatus,
  gateCheck,
  generatePayload,
  listWalletsTool,
  subBind,
  subLogin,
} from './auth.js';
import {
  fetchLetters,
  fetchThread,
  getLimits,
  listFolders,
  listMailboxes,
  listThreads,
  markThreadsSeen,
  sendLetter,
} from './mail.js';
import { e2eeGenerateLocal, e2eeGet, e2eeLookup, e2eeRegister, e2eePassphraseStatusTool, e2eePassphraseRevealTool, e2eeChangePassphraseTool } from './e2ee.js';
import { e2eeDecryptLetters } from './e2ee-decrypt.js';
import { nftPrepareMint, nftQuoteMint } from './nft.js';
import { webhookDelete, webhookGet, webhookRotateSecret, webhookSet } from './webhooks.js';
import { HUMAN_ONLY_ERROR } from './guard.js';
import {
  AuthMode,
  newRuntime,
  parseProfileSelector,
  resolveErrorResult,
  textError,
  type Runtime,
} from './runtime.js';

type ToolHandler = (rt: Runtime, args: Record<string, unknown>) => Promise<unknown>;

interface ToolSpec {
  name: keyof typeof toolInputSchemas;
  description: string;
  policy: ResolvePolicy;
  auth: AuthMode;
  humanOnly?: boolean;
  handler: ToolHandler;
}

const TOOL_SPECS: ToolSpec[] = [
  {
    name: 'tmail_gate_check',
    description: 'Diagnostic setup status (read-only, no API). Tools block with actionable errors when prerequisites are missing.',
    policy: ResolvePolicy.ExplicitIfMulti,
    auth: AuthMode.Optional,
    handler: (rt) => gateCheck(rt),
  },
  {
    name: 'tmail_list_wallets',
    description: 'List bound wallet profiles on disk (no secrets).',
    policy: ResolvePolicy.ExplicitIfMulti,
    auth: AuthMode.Optional,
    handler: (rt) => listWalletsTool(rt),
  },
  {
    name: 'tmail_auth_status',
    description: 'Probe API auth via limits endpoint. Use on 401 errors.',
    policy: ResolvePolicy.ExplicitIfMulti,
    auth: AuthMode.Optional,
    handler: (rt) => authStatus(rt),
  },
  {
    name: 'tmail_list_mailboxes',
    description: 'List mailboxes for authenticated wallet.',
    policy: ResolvePolicy.ExplicitIfMulti,
    auth: AuthMode.Required,
    handler: (rt, args) => listMailboxes(rt, args),
  },
  {
    name: 'tmail_get_limits',
    description: 'Get daily send limits and mailbox storage.',
    policy: ResolvePolicy.ExplicitIfMulti,
    auth: AuthMode.Required,
    handler: (rt) => getLimits(rt),
  },
  {
    name: 'tmail_list_threads',
    description: 'List mail threads.',
    policy: ResolvePolicy.ExplicitIfMulti,
    auth: AuthMode.Required,
    handler: (rt, args) => listThreads(rt, args),
  },
  {
    name: 'tmail_fetch_thread',
    description: 'Fetch all letters in a thread.',
    policy: ResolvePolicy.ExplicitIfMulti,
    auth: AuthMode.Required,
    handler: (rt, args) => fetchThread(rt, args),
  },
  {
    name: 'tmail_send_letter',
    description: 'Send a letter via TMail API.',
    policy: ResolvePolicy.StrictExplicit,
    auth: AuthMode.Required,
    handler: (rt, args) => sendLetter(rt, args),
  },
  {
    name: 'tmail_generate_payload',
    description:
      'Primary path for TON proof payload. Use this MCP tool, not curl POST /api/auth/generate-payload. Then @ton/mcp generate_ton_proof.',
    policy: ResolvePolicy.ExplicitIfMulti,
    auth: AuthMode.None,
    handler: (rt) => generatePayload(rt),
  },
  {
    name: 'tmail_sub_bind',
    description:
      'Sub-agent bind: bind_invite + ton_proof_json (flat @ton/mcp preferred; nested REST auto-converted). Creates .tmail/<wallet_slug>/profile.',
    policy: ResolvePolicy.UnboundOK,
    auth: AuthMode.None,
    handler: (rt, args) => subBind(rt, args),
  },
  {
    name: 'tmail_sub_login',
    description:
      'Sub-agent login: ton_proof_json (flat @ton/mcp preferred; nested REST auto-converted). Writes profile under .tmail/<wallet_slug>/profile.',
    policy: ResolvePolicy.ExplicitIfMulti,
    auth: AuthMode.None,
    handler: (rt, args) => subLogin(rt, args),
  },
  {
    name: 'tmail_webhook_set',
    description: 'Register or update webhook (secret min 16 chars).',
    policy: ResolvePolicy.StrictExplicit,
    auth: AuthMode.Required,
    handler: (rt, args) => webhookSet(rt, args),
  },
  {
    name: 'tmail_webhook_get',
    description: 'Get current webhook configuration.',
    policy: ResolvePolicy.ExplicitIfMulti,
    auth: AuthMode.Required,
    handler: (rt) => webhookGet(rt),
  },
  {
    name: 'tmail_webhook_delete',
    description: 'Delete webhook.',
    policy: ResolvePolicy.ExplicitIfMulti,
    auth: AuthMode.Required,
    handler: (rt) => webhookDelete(rt),
  },
  {
    name: 'tmail_webhook_rotate_secret',
    description: 'Rotate webhook HMAC secret.',
    policy: ResolvePolicy.StrictExplicit,
    auth: AuthMode.Required,
    handler: (rt, args) => webhookRotateSecret(rt, args),
  },
  {
    name: 'tmail_e2ee_generate_local',
    description:
      'Generate E2EE key pair client-side. Auto-generates passphrase if store empty. Passphrase never in tool output or e2ee.json.',
    policy: ResolvePolicy.StrictExplicit,
    auth: AuthMode.Required,
    handler: (rt, args) => e2eeGenerateLocal(rt, args),
  },
  {
    name: 'tmail_e2ee_passphrase_status',
    description: 'E2EE passphrase metadata (set, user_set, length) — no secret value.',
    policy: ResolvePolicy.StrictExplicit,
    auth: AuthMode.Required,
    handler: (rt) => e2eePassphraseStatusTool(rt),
  },
  {
    name: 'tmail_e2ee_passphrase_reveal',
    description: 'Human-only: reveal passphrase (blocked for agents — use CLI e2ee-passphrase reveal).',
    policy: ResolvePolicy.StrictExplicit,
    auth: AuthMode.Required,
    humanOnly: true,
    handler: (rt) => e2eePassphraseRevealTool(rt),
  },
  {
    name: 'tmail_e2ee_change_passphrase',
    description: 'Human-only: change passphrase and re-encrypt private key (blocked for agents — use CLI).',
    policy: ResolvePolicy.StrictExplicit,
    auth: AuthMode.Required,
    humanOnly: true,
    handler: (rt, args) => e2eeChangePassphraseTool(rt, args),
  },
  {
    name: 'tmail_e2ee_register',
    description: 'Register E2EE public key via PUT /api/tbox/keys (pub_key_e2e). Updates e2ee.json registered flag.',
    policy: ResolvePolicy.StrictExplicit,
    auth: AuthMode.Required,
    handler: (rt, args) => e2eeRegister(rt, args),
  },
  {
    name: 'tmail_e2ee_get',
    description: 'Get own registered E2EE public key from server.',
    policy: ResolvePolicy.ExplicitIfMulti,
    auth: AuthMode.Required,
    handler: (rt) => e2eeGet(rt),
  },
  {
    name: 'tmail_e2ee_decrypt_letters',
    description: 'Auto-fetch encrypted letters from API (as_seceml:true) and decrypt fields+attachments using local E2EE keys. Returns plaintext subject, body, from, to, and optionally attachment contents. One-step replacement for agent-side decrypt scripts.',
    policy: ResolvePolicy.StrictExplicit,
    auth: AuthMode.Required,
    handler: (rt, args) => e2eeDecryptLetters(rt, args),
  },
  {
    name: 'tmail_e2ee_lookup',
    description: 'Look up E2EE public keys for recipient addresses (mail:send scope).',
    policy: ResolvePolicy.ExplicitIfMulti,
    auth: AuthMode.Required,
    handler: (rt, args) => e2eeLookup(rt, args),
  },
  {
    name: 'tmail_nft_quote_mint',
    description: 'Quote NFT domain mint price (no transactions). Requires READY gate.',
    policy: ResolvePolicy.StrictExplicit,
    auth: AuthMode.Required,
    handler: (rt, args) => nftQuoteMint(rt, args),
  },
  {
    name: 'tmail_nft_prepare_mint',
    description: 'Prepare NFT mint transactions after user confirms total_nano from quote.',
    policy: ResolvePolicy.StrictExplicit,
    auth: AuthMode.Required,
    handler: (rt, args) => nftPrepareMint(rt, args),
  },
  {
    name: 'tmail_fetch_letters',
    description: 'Bulk fetch letter contents by ID (mark_read defaults true on API when omitted).',
    policy: ResolvePolicy.ExplicitIfMulti,
    auth: AuthMode.Required,
    handler: (rt, args) => fetchLetters(rt, args),
  },
  {
    name: 'tmail_list_folders',
    description: 'List mailbox folders with counts.',
    policy: ResolvePolicy.ExplicitIfMulti,
    auth: AuthMode.Required,
    handler: (rt, args) => listFolders(rt, args),
  },
  {
    name: 'tmail_mark_threads_seen',
    description: 'Mark threads read or unread (UNSEEN label side-effect).',
    policy: ResolvePolicy.ExplicitIfMulti,
    auth: AuthMode.Required,
    handler: (rt, args) => markThreadsSeen(rt, args),
  },
];

export function registerTools(server: McpServer, cfg: Config): void {
  for (const spec of TOOL_SPECS) {
    server.registerTool(
      spec.name,
      {
        description: spec.description,
        inputSchema: toolInputSchemas[spec.name],
      },
      async (args: Record<string, unknown>) => {
        if (spec.humanOnly) {
          return textError(HUMAN_ONLY_ERROR);
        }
        const sel = parseProfileSelector(args);
        try {
          const rt = await newRuntime(cfg, sel, spec.policy, spec.auth);
          return (await spec.handler(rt, args)) as { content: [{ type: 'text'; text: string }]; isError?: boolean };
        } catch (err) {
          if (err instanceof ResolveError) {
            return resolveErrorResult(err);
          }
          return textError(err instanceof Error ? err.message : String(err));
        }
      },
    );
  }
}

export { TOOL_SPECS };
