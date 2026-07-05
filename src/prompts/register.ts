import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'tmail-onboarding',
    {
      description: 'Owner/sub-agent onboarding: bind → e2ee → mail ops',
    },
    async () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Call the MCP tool the user needs — errors tell you what to fix next.
1. Missing env: fill TMAIL_BIND_INVITE in mcpServers.tmail.env, reload MCP host, user confirms "ready".
2. Bind: tmail_generate_payload → @ton/mcp → tmail_sub_bind (MCP only; no Authorization header).
3. E2EE: tmail_e2ee_generate_local(wallet_slug=..., register=true).
4. Re-login: tmail_generate_payload → @ton/mcp → tmail_sub_login (no invite).
5. Multi-wallet: tmail_list_wallets; pass wallet_slug on strict mutators.
6. Never use owner api_key (tmail_o_*) in sub-agent context.`,
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
            text: `Tools block with actionable errors — no separate gate step.
Wallets: tmail_list_wallets (pass wallet_slug when 2+ bound)
- Missing env → fill TMAIL_BIND_INVITE, reload MCP host, user "ready"
- Bind → tmail_generate_payload → @ton/mcp → tmail_sub_bind
- E2EE → tmail_e2ee_generate_local(register=true)
- Re-login → tmail_sub_login (no invite)
- Corrupt session → delete session.json, bind again
- Hard STOP → fix TMAIL_API_URL in mcpServers.tmail.env, reload MCP host`,
          },
        },
      ],
    }),
  );
}
