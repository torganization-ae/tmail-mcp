/** Extract letter entries from POST /api/tbox/letters/fetch or /threads/letters response. */
export function extractLetterResults(
  out: Record<string, unknown> | null | undefined,
): Record<string, unknown>[] {
  const results = out?.results ?? out?.letters;
  return Array.isArray(results) ? (results as Record<string, unknown>[]) : [];
}

/** Extract letter entries with their letter_ids. */
export function extractLetterResultsWithIds(
  out: Record<string, unknown> | null | undefined,
): { results: Record<string, unknown>[]; letter_ids: string[] } {
  const raw = (out?.results ?? out?.letters) as Array<Record<string, unknown>> | undefined;
  const results = Array.isArray(raw) ? raw : [];
  const letter_ids = results.map((r) => typeof r.letter_id === 'string' ? r.letter_id : '');
  return { results, letter_ids };
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
