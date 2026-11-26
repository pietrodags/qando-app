import { describe, expect, it } from 'vitest';
import { refusedAsStored } from './refused-as-stored.js';

/** An error of PostgreSQL's driver, which says what was refused by its code. */
const refused = (code: string) => Object.assign(new Error('refused'), { code });

describe('refusedAsStored', () => {
  it('is true for a row refused because one with its key is stored already', () => {
    expect(refusedAsStored(refused('23505'))).toBe(true);
  });

  it('is true when that refusal is the cause of the error, however deep', () => {
    const query = new Error('Failed query', { cause: refused('23505') });

    expect(refusedAsStored(new Error('Request failed', { cause: query }))).toBe(true);
  });

  it('is false for another refusal, also as a cause', () => {
    expect(refusedAsStored(refused('23503'))).toBe(false);
    expect(refusedAsStored(new Error('Failed query', { cause: refused('23503') }))).toBe(false);
  });

  it('is false for an error without a code or a cause, and for what is not an error', () => {
    expect(refusedAsStored(new Error('connection lost'))).toBe(false);
    expect(refusedAsStored({ code: '23505' })).toBe(false);
    expect(refusedAsStored('23505')).toBe(false);
    expect(refusedAsStored(undefined)).toBe(false);
  });
});
