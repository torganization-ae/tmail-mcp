import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Config } from './config/env.js';
import { ENV_MCP_TOKEN, loadConfig } from './config/env.js';
import { registerPrompts } from './prompts/register.js';
import { registerResources } from './resources/register.js';
import { registerTools } from './tools/registry.js';

export interface CreateTmailMCPOptions {
  config?: Config;
  name?: string;
  version?: string;
}

function checkMcpToken(req: IncomingMessage, cfg: Config): boolean {
  const expected = cfg.mcpToken.trim();
  if (!expected) return true;
  const header = req.headers['x-tmail-mcp-token'];
  const token = typeof header === 'string' ? header : Array.isArray(header) ? header[0] : '';
  return token === expected;
}

function unauthorized(res: ServerResponse): void {
  res.statusCode = 401;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'unauthorized — set X-TMail-Mcp-Token header' }));
}

export function createTmailMCP(options: CreateTmailMCPOptions = {}): McpServer {
  const cfg = options.config ?? loadConfig();
  const server = new McpServer({
    name: options.name ?? 'tmail-mcp',
    version: options.version ?? '1.0.0',
  });
  registerTools(server, cfg);
  registerResources(server, cfg);
  registerPrompts(server);
  return server;
}

export async function startStdioMCP(options: CreateTmailMCPOptions = {}): Promise<void> {
  const server = createTmailMCP(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export async function startHttpMCP(port: number, options: CreateTmailMCPOptions = {}): Promise<void> {
  const cfg = options.config ?? loadConfig();
  const mcp = createTmailMCP({ ...options, config: cfg });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  await mcp.connect(transport);
  const httpServer = createServer((req, res) => {
    if (!checkMcpToken(req, cfg)) {
      unauthorized(res);
      return;
    }
    void transport.handleRequest(req, res);
  });
  await new Promise<void>((resolve) => {
    httpServer.listen(port, '127.0.0.1', () => resolve());
  });
  const tokenHint = cfg.mcpToken ? ` (token required: ${ENV_MCP_TOKEN})` : '';
  process.stderr.write(`tmail-mcp HTTP listening on localhost${tokenHint}\n`);
}

export { loadConfig };
