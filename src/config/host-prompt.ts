import * as p from '@clack/prompts';
import { MCP_MANUAL_SETUP_HINT, MCP_OTHER_HOST_ID } from './mcp-by-agent.js';
import type { McpHost } from './hosts.js';

export function isInteractiveTTY(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

const OTHER_OPTION = {
  value: MCP_OTHER_HOST_ID,
  label: 'Other (manual setup)',
  hint: 'Skip auto-merge — configure MCP in your IDE/CLI',
};

function hostOption(host: McpHost) {
  return {
    value: host.id,
    label: host.label,
    hint: `${host.configPath} · ${host.rootKey} · ${host.format}`,
  };
}

function hostsFromIds(installed: McpHost[], ids: string[]): McpHost[] {
  const byId = new Map(installed.map((host) => [host.id, host]));
  return ids.map((id) => {
    const host = byId.get(id);
    if (!host) throw new Error(`unknown MCP host selection: ${id}`);
    return host;
  });
}

function cancelSelection(): never {
  p.cancel('MCP host selection cancelled');
  throw new Error('MCP host selection cancelled');
}

function logManualSetupHint(): void {
  p.log.info(MCP_MANUAL_SETUP_HINT);
}

export async function promptSelectMcpHosts(installed: McpHost[]): Promise<McpHost[]> {
  p.intro('TMail MCP setup');

  if (installed.length === 0) {
    const choice = await p.select({
      message: 'No supported IDE/CLI detected on this machine',
      options: [OTHER_OPTION],
    });
    if (p.isCancel(choice) || choice !== MCP_OTHER_HOST_ID) {
      cancelSelection();
    }
    logManualSetupHint();
    p.outro('Manual setup selected');
    return [];
  }

  if (installed.length === 1) {
    const host = installed[0]!;
    const choice = await p.select({
      message: 'Where should the tmail MCP block be written?',
      options: [hostOption(host), OTHER_OPTION],
    });
    if (p.isCancel(choice)) cancelSelection();
    if (choice === MCP_OTHER_HOST_ID) {
      logManualSetupHint();
      p.outro('Manual setup selected');
      return [];
    }
    p.log.info(`${host.label} → ${host.configPath}`);
    p.outro('Host selected');
    return [host];
  }

  const picked = await p.multiselect({
    message: 'Select IDE/CLI host(s) for the tmail MCP block',
    options: [...installed.map(hostOption), OTHER_OPTION],
    initialValues: [installed[0]!.id],
    required: true,
  });

  if (p.isCancel(picked)) cancelSelection();

  const ids = picked as string[];
  const mergeIds = ids.filter((id) => id !== MCP_OTHER_HOST_ID);

  if (mergeIds.length === 0) {
    logManualSetupHint();
    p.outro('Manual setup selected');
    return [];
  }

  if (mergeIds.length > 1) {
    const paths = mergeIds
      .map((id) => {
        const host = installed.find((h) => h.id === id);
        return host ? `${host.label} → ${host.configPath}` : id;
      })
      .join('\n  ');
    const confirmed = await p.confirm({
      message: `Write tmail block to ${mergeIds.length} config files?\n  ${paths}`,
      active: 'Yes',
      inactive: 'No',
      initialValue: true,
    });
    if (p.isCancel(confirmed) || !confirmed) cancelSelection();
  }

  p.outro(`${mergeIds.length} host(s) selected`);
  return hostsFromIds(installed, mergeIds);
}
