import { defineConfig } from 'rolldown';

export default defineConfig([
  {
    input: 'src/cli.ts',
    output: { dir: 'dist', format: 'esm', entryFileNames: 'cli.js' },
    platform: 'node',
    external: [/^node:/, '@modelcontextprotocol/sdk', '@noble/curves', 'zod'],
  },
  {
    input: 'src/index.ts',
    output: { dir: 'dist', format: 'esm', entryFileNames: 'index.js' },
    platform: 'node',
    external: [/^node:/, '@modelcontextprotocol/sdk', '@noble/curves', 'zod'],
  },
]);
