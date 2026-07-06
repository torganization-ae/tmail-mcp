import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpHost } from '../src/config/hosts.js';
import { MCP_OTHER_HOST_ID } from '../src/config/mcp-by-agent.js';

const multiselect = vi.fn();
const select = vi.fn();
const confirm = vi.fn();
const intro = vi.fn();
const outro = vi.fn();
const cancel = vi.fn();
const logInfo = vi.fn();

vi.mock('@clack/prompts', () => ({
  intro,
  outro,
  cancel,
  log: { info: logInfo },
  isCancel: (value: unknown) => value === Symbol.for('clack:cancel'),
  confirm,
  select,
  multiselect,
}));

describe('promptSelectMcpHosts', () => {
  const installed: McpHost[] = [
    {
      id: 'cursor',
      label: 'Cursor',
      configPath: '.cursor/mcp.json',
      rootKey: 'mcpServers',
      writer: 'json-root',
      format: 'json',
      initWritable: true,
      detectInstalled: () => true,
    },
    {
      id: 'vscode',
      label: 'VS Code',
      configPath: '.vscode/mcp.json',
      rootKey: 'servers',
      writer: 'json-root',
      format: 'json',
      initWritable: true,
      detectInstalled: () => true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('maps multiselect values to hosts', async () => {
    multiselect.mockResolvedValueOnce(['vscode']);
    const { promptSelectMcpHosts } = await import('../src/config/host-prompt.js');

    const selected = await promptSelectMcpHosts(installed);
    expect(selected.map((t) => t.id)).toEqual(['vscode']);
    expect(confirm).not.toHaveBeenCalled();
    expect(multiselect).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Select IDE/CLI'),
        options: expect.arrayContaining([
          expect.objectContaining({ value: 'cursor', label: 'Cursor' }),
          expect.objectContaining({ value: 'vscode', label: 'VS Code' }),
          expect.objectContaining({ value: MCP_OTHER_HOST_ID, label: 'Other (manual setup)' }),
        ]),
      }),
    );
  });

  it('offers other when only one host is installed', async () => {
    select.mockResolvedValueOnce('cursor');
    const { promptSelectMcpHosts } = await import('../src/config/host-prompt.js');

    const selected = await promptSelectMcpHosts([installed[0]!]);
    expect(selected.map((t) => t.id)).toEqual(['cursor']);
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.arrayContaining([
          expect.objectContaining({ value: 'cursor' }),
          expect.objectContaining({ value: MCP_OTHER_HOST_ID }),
        ]),
      }),
    );
    expect(multiselect).not.toHaveBeenCalled();
  });

  it('returns no targets when other is selected alone', async () => {
    select.mockResolvedValueOnce(MCP_OTHER_HOST_ID);
    const { promptSelectMcpHosts } = await import('../src/config/host-prompt.js');

    const selected = await promptSelectMcpHosts([installed[0]!]);
    expect(selected).toEqual([]);
    expect(logInfo).toHaveBeenCalled();
  });

  it('confirms when multiselect picks more than one host', async () => {
    multiselect.mockResolvedValueOnce(['cursor', 'vscode']);
    confirm.mockResolvedValueOnce(true);
    const { promptSelectMcpHosts } = await import('../src/config/host-prompt.js');

    const selected = await promptSelectMcpHosts(installed);
    expect(selected.map((t) => t.id)).toEqual(['cursor', 'vscode']);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('2 config files'),
      }),
    );
  });

  it('throws when multi-host confirm is declined', async () => {
    multiselect.mockResolvedValueOnce(['cursor', 'vscode']);
    confirm.mockResolvedValueOnce(false);
    const { promptSelectMcpHosts } = await import('../src/config/host-prompt.js');

    await expect(promptSelectMcpHosts(installed)).rejects.toThrow(/cancelled/i);
    expect(cancel).toHaveBeenCalled();
  });

  it('throws when selection is cancelled', async () => {
    multiselect.mockResolvedValueOnce(Symbol.for('clack:cancel'));
    const { promptSelectMcpHosts } = await import('../src/config/host-prompt.js');

    await expect(promptSelectMcpHosts(installed)).rejects.toThrow(/cancelled/i);
    expect(cancel).toHaveBeenCalled();
  });
});
