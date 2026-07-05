import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { writeJsonAtomic } from '../profile/jsonfields.js';
import { requireGate } from './guard.js';
import { sanitizeForTool, withProfileContext } from './sanitize.js';
import { optionalString, requireString, textError, textResult, type Runtime } from './runtime.js';

function generateWebhookSecret(): string {
  return randomBytes(24).toString('base64url');
}

async function readLocalWebhook(profileDir: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.promises.readFile(path.join(profileDir, 'webhook.json'), 'utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
}

export async function webhookSet(rt: Runtime, args: Record<string, unknown>) {
  requireGate(rt, 'mail_ops');
  let url: string;
  try {
    url = requireString(args, 'url');
  } catch (err) {
    return textError(err instanceof Error ? err.message : 'url is required');
  }
  let secret = optionalString(args, 'secret');
  if (!secret) {
    secret = generateWebhookSecret();
  }
  if (secret.length < 16) return textError('secret must be at least 16 characters');
  const out = await rt.client.put<Record<string, unknown>>('/api/tbox/webhook', { url, secret });
  await writeJsonAtomic(path.join(rt.paths.dir, 'webhook.json'), {
    url,
    secret,
    previous_secret: '',
    previous_secret_valid_until: null,
  });
  const sanitized = sanitizeForTool('tmail_webhook_set', out) as Record<string, unknown>;
  sanitized.secret_auto_generated = !optionalString(args, 'secret');
  return textResult(withProfileContext(rt.paths.walletSlug, rt.paths.dir, sanitized, rt.cfg.redactPaths));
}

export async function webhookGet(rt: Runtime) {
  requireGate(rt, 'mail_ops');
  const out = await rt.client.get<Record<string, unknown>>('/api/tbox/webhook');
  return textResult(sanitizeForTool('tmail_webhook_get', out));
}

export async function webhookDelete(rt: Runtime) {
  requireGate(rt, 'mail_ops');
  const out = await rt.client.delete<Record<string, unknown>>('/api/tbox/webhook');
  await fs.promises.unlink(path.join(rt.paths.dir, 'webhook.json')).catch(() => {});
  return textResult(sanitizeForTool('tmail_webhook_delete', out));
}

export async function webhookRotateSecret(rt: Runtime, args: Record<string, unknown>) {
  requireGate(rt, 'mail_ops');
  const body: Record<string, unknown> = {};
  let newSecret = optionalString(args, 'new_secret');
  if (newSecret) {
    if (newSecret.length < 8) return textError('new_secret must be at least 8 characters');
    body.new_secret = newSecret;
  } else {
    newSecret = generateWebhookSecret();
    body.new_secret = newSecret;
  }
  const out = await rt.client.post<Record<string, unknown>>('/api/tbox/webhook/rotate-secret', body);
  const local = await readLocalWebhook(rt.paths.dir);
  const prevSecret = typeof local.secret === 'string' ? local.secret : '';
  const prevUntil =
    typeof out.previous_secret_valid_until === 'string' ? out.previous_secret_valid_until : null;
  const resolvedNew =
    typeof out.new_secret === 'string' && out.new_secret.trim()
      ? out.new_secret
      : typeof out.secret === 'string' && out.secret.trim()
        ? out.secret
        : newSecret;
  await writeJsonAtomic(path.join(rt.paths.dir, 'webhook.json'), {
    url: typeof local.url === 'string' ? local.url : '',
    secret: resolvedNew,
    previous_secret: prevSecret,
    previous_secret_valid_until: prevUntil,
  });
  const sanitized = sanitizeForTool('tmail_webhook_rotate_secret', out) as Record<string, unknown>;
  sanitized.secret_auto_generated = !optionalString(args, 'new_secret');
  return textResult(withProfileContext(rt.paths.walletSlug, rt.paths.dir, sanitized, rt.cfg.redactPaths));
}
