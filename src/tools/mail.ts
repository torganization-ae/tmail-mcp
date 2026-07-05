import { requireGate } from './guard.js';
import { sanitizeForTool, withProfileContext } from './sanitize.js';
import {
  optionalBool,
  optionalInt,
  optionalString,
  requireString,
  requireStringArray,
  requireBool,
  textError,
  textResult,
  type Runtime,
} from './runtime.js';

export async function listMailboxes(rt: Runtime, args: Record<string, unknown>) {
  requireGate(rt, 'mail_ops');
  const out = await rt.client.post<Record<string, unknown>>('/api/tbox/mailboxes', {
    offset: optionalInt(args, 'offset', 0),
    limit: optionalInt(args, 'limit', 20),
  });
  return textResult(sanitizeForTool('tmail_list_mailboxes', out));
}

export async function getLimits(rt: Runtime) {
  requireGate(rt, 'mail_ops');
  const out = await rt.client.get<Record<string, unknown>>('/api/tbox/limits');
  return textResult(sanitizeForTool('tmail_get_limits', out));
}

export async function listThreads(rt: Runtime, args: Record<string, unknown>) {
  requireGate(rt, 'mail_ops');
  const out = await rt.client.post<Record<string, unknown>>('/api/tbox/threads', {
    mailbox: optionalString(args, 'mailbox'),
    folder: optionalString(args, 'folder'),
    offset: optionalInt(args, 'offset', 0),
    limit: optionalInt(args, 'limit', 20),
    unread_only: optionalBool(args, 'unread_only'),
    include_last_letter: optionalBool(args, 'include_last_letter'),
    as_seceml: optionalBool(args, 'as_seceml'),
    sort_order_timestamp: optionalString(args, 'sort_order_timestamp'),
  });
  return textResult(sanitizeForTool('tmail_list_threads', out));
}

export async function fetchThread(rt: Runtime, args: Record<string, unknown>) {
  requireGate(rt, 'mail_ops');
  let threadId: string;
  try {
    threadId = requireString(args, 'thread_id');
  } catch {
    return textError('thread_id is required');
  }
  const body: Record<string, unknown> = {
    thread_id: threadId,
    mailbox: optionalString(args, 'mailbox'),
    is_draft: optionalBool(args, 'is_draft'),
    as_seceml: optionalBool(args, 'as_seceml'),
  };
  if (typeof args.mark_read === 'boolean') body.mark_read = args.mark_read;
  const out = await rt.client.post<Record<string, unknown>>('/api/tbox/threads/letters', body);
  return textResult(sanitizeForTool('tmail_fetch_thread', out));
}

export async function sendLetter(rt: Runtime, args: Record<string, unknown>) {
  requireGate(rt, 'mail_ops');
  const body: Record<string, unknown> = {};
  const from = optionalString(args, 'from_address');
  if (from) body.from_address = from;
  const to = optionalString(args, 'to');
  if (to) body.to = [to];
  try {
    const toList = requireStringArray(args, 'to_list');
    if (toList.length) body.to = toList;
  } catch {
    // optional
  }
  for (const k of ['subject', 'body_html', 'body_plain', 'in_reply_to', 'thread_id', 'eml_base64'] as const) {
    const v = optionalString(args, k);
    if (v) body[k] = v;
  }
  if (optionalBool(args, 'report_encryption')) body.report_encryption = true;
  const attRaw = optionalString(args, 'attachments_json');
  if (attRaw) {
    try {
      body.attachments = JSON.parse(attRaw) as unknown[];
    } catch {
      return textError('attachments_json must be a JSON array of attachment objects');
    }
  }
  const out = await rt.client.post<Record<string, unknown>>('/api/tbox/letters', body);
  const sanitized = sanitizeForTool('tmail_send_letter', out);
  if (sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)) {
    return textResult(withProfileContext(rt.paths.walletSlug, rt.paths.dir, sanitized as Record<string, unknown>, rt.cfg.redactPaths));
  }
  return textResult(sanitized);
}

export async function fetchLetters(rt: Runtime, args: Record<string, unknown>) {
  requireGate(rt, 'mail_ops');
  let ids: string[];
  try {
    ids = requireStringArray(args, 'letter_ids');
  } catch {
    return textError('letter_ids is required');
  }
  if (ids.length > 100) return textError('letter_ids max 100');
  const body: Record<string, unknown> = { letter_ids: ids };
  const mailbox = optionalString(args, 'mailbox');
  if (mailbox) body.mailbox = mailbox;
  if (optionalBool(args, 'is_draft')) body.is_draft = true;
  if (optionalBool(args, 'as_seceml')) body.as_seceml = true;
  if (typeof args.mark_read === 'boolean') body.mark_read = args.mark_read;
  const out = await rt.client.post<Record<string, unknown>>('/api/tbox/letters/fetch', body);
  return textResult(sanitizeForTool('tmail_fetch_letters', out));
}

export async function listFolders(rt: Runtime, args: Record<string, unknown>) {
  requireGate(rt, 'mail_ops');
  const body: Record<string, unknown> = {};
  const mailbox = optionalString(args, 'mailbox');
  if (mailbox) body.mailbox = mailbox;
  const out = await rt.client.post<Record<string, unknown>>('/api/tbox/folders', body);
  return textResult(sanitizeForTool('tmail_list_folders', out));
}

export async function markThreadsSeen(rt: Runtime, args: Record<string, unknown>) {
  requireGate(rt, 'mail_ops');
  let threadIds: string[];
  let seenFlag: boolean;
  try {
    threadIds = requireStringArray(args, 'thread_ids');
    seenFlag = requireBool(args, 'seen_flag');
  } catch (err) {
    return textError(err instanceof Error ? err.message : 'thread_ids and seen_flag are required');
  }
  const body: Record<string, unknown> = { thread_ids: threadIds, seen_flag: seenFlag };
  const mailbox = optionalString(args, 'mailbox');
  if (mailbox) body.mailbox = mailbox;
  const out = await rt.client.post<Record<string, unknown>>('/api/tbox/threads/seen', body);
  return textResult(sanitizeForTool('tmail_mark_threads_seen', out));
}
