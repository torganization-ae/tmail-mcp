/** Extract letter entries from POST /api/tbox/letters/fetch or /threads/letters response. */
export function extractLetterResults(
  out: Record<string, unknown> | null | undefined,
): Record<string, unknown>[] {
  const results = out?.results ?? out?.letters;
  return Array.isArray(results) ? (results as Record<string, unknown>[]) : [];
}

/** Extract failed_letter_ids when present (thread fetch endpoint). */
export function extractFailedLetterIds(
  out: Record<string, unknown> | null | undefined,
): string[] | undefined {
  const failed = out?.failed_letter_ids;
  if (!Array.isArray(failed)) return undefined;
  const ids = failed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return ids.length > 0 ? ids : undefined;
}
