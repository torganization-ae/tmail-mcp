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

  const offset = Math.max(0, optionalInt(args, 'offset', 0));
  const requestedLimit = Math.max(0, optionalInt(args, 'limit', 0));
  const paginated = paginateThread(out, offset, requestedLimit);
  return textResult(sanitizeForTool('tmail_fetch_thread', paginated));
}

// Slice the full-thread response to the requested page without extra API round-trips.
// The backend returns the whole thread (capped at 100 letters) in one shot; we apply
// offset/limit on the client so the agent can walk long threads in bounded chunks.
function paginateThread(
  out: Record<string, unknown>,
  offset: number,
  requestedLimit: number,
): Record<string, unknown> {
  const rawResults = (out.results ?? out.letters) as Array<Record<string, unknown>> | undefined;
  const results: Array<Record<string, unknown>> = Array.isArray(rawResults) ? rawResults : [];
  const allLetterIds = Array.isArray(out.letter_ids)
    ? (out.letter_ids as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];

  const total = results.length;
  if (offset >= total) {
    return {
      ...out,
      results: [],
      letter_ids: [],
      total,
      offset,
      limit: requestedLimit,
      has_more: false,
    };
  }

  const end = requestedLimit > 0 ? Math.min(offset + requestedLimit, total) : total;
  const page = results.slice(offset, end);
  // letter_ids mirrors results[] by index; slice the same window so consumers stay in sync.
  const pageIds = allLetterIds.length === total
    ? allLetterIds.slice(offset, end)
    : page.map((r) => (typeof r.letter_id === 'string' ? r.letter_id : ''));

  return {
    ...out,
    results: page,
    letter_ids: pageIds,
    total,
    offset,
    limit: requestedLimit,
    has_more: end < total,
  };
}

export async function sendLetter(rt: Runtime, args: Record<string, unknown>) {
  requireGate(rt, 'mail_ops');
  const body: Record<string, unknown> = {};
  const from = optionalString(args, 'from_address');
  if (from) body.from_address = from;

  // Collect recipients from `to` (single) and `to_list` (array); to_list wins if non-empty.
  let recipients: string[] = [];
  const toSingle = optionalString(args, 'to');
  if (toSingle) recipients.push(toSingle);
  try {
    const toList = requireStringArray(args, 'to_list');
    if (toList.length) recipients = toList;
  } catch {
    // to_list is optional
  }

  const emlBase64 = optionalString(args, 'eml_base64');
  const subject = optionalString(args, 'subject');
  const bodyHtml = optionalString(args, 'body_html');
  const bodyPlain = optionalString(args, 'body_plain');
  const inReplyTo = optionalString(args, 'in_reply_to');
  const threadId = optionalString(args, 'thread_id');

  // Early validation mirrors backend 422s so the agent gets a readable error
  // without a wasted round-trip. EML path bypasses field-level requirements.
  if (emlBase64) {
    body.eml_base64 = emlBase64;
    // Backend ignores structured letter fields when eml_base64 is set — do not send them.
  } else {
    if (recipients.length === 0) {
      return textError('to or to_list is required when eml_base64 is not provided');
    }
    if (!bodyHtml && !bodyPlain) {
      return textError('body_html or body_plain is required when eml_base64 is not provided');
    }
    if (subject) body.subject = subject;
    if (bodyHtml) body.body_html = bodyHtml;
    if (bodyPlain) body.body_plain = bodyPlain;
  }
  if (recipients.length) body.to = recipients;
  if (inReplyTo) body.in_reply_to = inReplyTo;
  if (threadId) body.thread_id = threadId;
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
