const MAX_ERROR_LEN = 200;
const TMAIL_KEY_PATTERN = /tmail_[osi]_[A-Za-z0-9]+\.[A-Za-z0-9]+/g;

export function safeErrorMessage(msg: string): string {
  let s = msg.trim();
  if (!s) return s;
  s = s.replace(TMAIL_KEY_PATTERN, '[redacted]');
  if (s.length > MAX_ERROR_LEN) {
    return s.slice(0, MAX_ERROR_LEN) + '…';
  }
  return s;
}
