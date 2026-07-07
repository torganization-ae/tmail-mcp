import { describe, expect, it } from 'vitest';
import {
  extractFailedLetterIds,
  extractLetterResults,
} from '../src/client/letter-results.js';

describe('extractLetterResults', () => {
  it('reads results array from API response', () => {
    const item = { letter_id: 'a', seceml_base64: 'abc' };
    expect(extractLetterResults({ results: [item] })).toEqual([item]);
  });

  it('falls back to legacy letters field', () => {
    const item = { letter_id: 'b', seceml_base64: 'def' };
    expect(extractLetterResults({ letters: [item] })).toEqual([item]);
  });

  it('prefers results over letters when both present', () => {
    const fromResults = { letter_id: 'r' };
    const fromLetters = { letter_id: 'l' };
    expect(extractLetterResults({ results: [fromResults], letters: [fromLetters] })).toEqual([fromResults]);
  });

  it('does not fall back when results is empty array', () => {
    const fromLetters = { letter_id: 'l' };
    expect(extractLetterResults({ results: [], letters: [fromLetters] })).toEqual([]);
  });

  it('returns empty array for missing or invalid payload', () => {
    expect(extractLetterResults(undefined)).toEqual([]);
    expect(extractLetterResults(null)).toEqual([]);
    expect(extractLetterResults({})).toEqual([]);
    expect(extractLetterResults({ results: 'not-array' })).toEqual([]);
  });
});

describe('extractFailedLetterIds', () => {
  it('returns string ids when present', () => {
    expect(extractFailedLetterIds({ failed_letter_ids: ['id1', 'id2'] })).toEqual(['id1', 'id2']);
  });

  it('returns undefined when missing or empty', () => {
    expect(extractFailedLetterIds({})).toBeUndefined();
    expect(extractFailedLetterIds({ failed_letter_ids: [] })).toBeUndefined();
    expect(extractFailedLetterIds({ failed_letter_ids: [1, ''] })).toBeUndefined();
  });
});
