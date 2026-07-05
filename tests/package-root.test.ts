import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packageRoot } from '../src/config/env.js';

describe('packageRoot', () => {
  it('resolves @tmail/mcp root with bundled assets', () => {
    const root = packageRoot();
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { name: string };
    expect(pkg.name).toBe('@tmail/mcp');
    expect(fs.existsSync(path.join(root, 'agent-gate.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'subagent-coverage.json'))).toBe(true);
  });
});
