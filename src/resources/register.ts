import fs from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import path from 'node:path';
import type { Config } from '../config/env.js';
import { packageRoot } from '../config/env.js';
import { ApiClient } from '../client/api-client.js';

const coveragePath = path.join(packageRoot(), 'subagent-coverage.json');

export function registerResources(server: McpServer, cfg: Config): void {
  const api = new ApiClient(cfg.apiUrl);

  server.registerResource(
    'tmail-guide-tutorial',
    'tmail://guide/tutorial',
    { description: 'TMail developer guide (machine-readable)', mimeType: 'application/json' },
    async () => ({
      contents: [
        {
          uri: 'tmail://guide/tutorial',
          mimeType: 'application/json',
          text: await api.getRaw('/api/guide/tutorial'),
        },
      ],
    }),
  );

  server.registerResource(
    'tmail-guide-scopes',
    'tmail://guide/scopes',
    { description: 'TMail API scopes reference', mimeType: 'application/json' },
    async () => ({
      contents: [
        {
          uri: 'tmail://guide/scopes',
          mimeType: 'application/json',
          text: await api.getRaw('/api/guide/scopes'),
        },
      ],
    }),
  );

  server.registerResource(
    'tmail-openapi',
    'tmail://openapi',
    { description: 'OpenAPI schema for TMail REST API', mimeType: 'application/json' },
    async () => ({
      contents: [
        {
          uri: 'tmail://openapi',
          mimeType: 'application/json',
          text: await api.getRaw('/openapi.json'),
        },
      ],
    }),
  );

  server.registerResource(
    'tmail-tools-catalog',
    'tmail://tools/catalog',
    { description: 'TMail MCP tool catalog (scope, gate, REST mapping — no secrets)', mimeType: 'application/json' },
    async () => {
      const reg = JSON.parse(fs.readFileSync(coveragePath, 'utf8')) as { tools: unknown[] };
      return {
        contents: [
          {
            uri: 'tmail://tools/catalog',
            mimeType: 'application/json',
            text: JSON.stringify(reg.tools, null, 2),
          },
        ],
      };
    },
  );
}
