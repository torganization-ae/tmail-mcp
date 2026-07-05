import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'tmail-onboarding',
    {
      description: 'Owner/sub-agent onboarding: Env Gate → bind → Ready §10',
    },
    async () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `1. Run tmail_gate_check — mail ops only when READY. Use tmail_list_wallets when multiple profiles exist.
2. If WAIT_ENV_BIND: fill TMAIL_BIND_INVITE in mcpServers.tmail.env, Reload MCP host, user confirms "ready".
3. If SETUP_BIND: tmail_generate_payload → @ton/mcp → tmail_sub_bind (MCP only, not curl; no Authorization header).
4. If SETUP_FINISH: tmail_e2ee_generate_local(wallet_slug=..., register=true).
5. If AUTH_NEEDS_LOGIN: tmail_generate_payload → @ton/mcp → tmail_sub_login (no invite; no Authorization header).
6. Daily ops: pass wallet_slug on strict mutators; tmail_send_letter, tmail_list_threads — never raw curl to /api/*.
7. Never use owner api_key (tmail_o_*) in sub-agent context.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'tmail-sub-bind-flow',
    {
      description: 'Sub-agent bind/login decision tree',
    },
    async () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Gate: tmail_gate_check (pass wallet_slug when 2+ bound wallets)
Wallets: tmail_list_wallets
- WAIT_ENV_BIND → fill TMAIL_BIND_INVITE in mcpServers.tmail.env, Reload MCP host, user "ready"
- SETUP_BIND → tmail_generate_payload → @ton/mcp → tmail_sub_bind (MCP only; AuthModeNone — no Bearer)
- SETUP_FINISH → tmail_e2ee_generate_local(wallet_slug=..., register=true)
- AUTH_NEEDS_LOGIN → tmail_generate_payload → @ton/mcp → tmail_sub_login (no invite; AuthModeNone)
- READY → use tmail_* mail tools with permanent api_key from session.json
- INVALID_SESSION → delete session.json, refill invite, bind again via MCP
- STOP → hard error (empty TMAIL_API_URL in mcpServers.tmail.env) — fix env, Reload MCP host, bootstrap`,
          },
        },
      ],
    }),
  );
}
