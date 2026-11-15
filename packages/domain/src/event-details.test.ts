import { describe, expect, it } from 'vitest';
import {
  EVENT_TITLE_MAX_LENGTH,
  ORGANIZER_NAME_MAX_LENGTH,
  ORGANIZER_NAME_MIN_LENGTH,
  clipDetails,
  detailsProblems,
} from './event-details.js';

const valid = { organizerName: 'Ana', title: 'Cena de verano' };

describe('detailsProblems', () => {
  it('finds none in a name and a title the event can be created with', () => {
    expect(detailsProblems(valid)).toEqual([]);
  });

  it('allows names of 2 to 30 characters and titles of 1 to 50', () => {
    expect([ORGANIZER_NAME_MIN_LENGTH, ORGANIZER_NAME_MAX_LENGTH, EVENT_TITLE_MAX_LENGTH]).toEqual([
      2, 30, 50,
    ]);
    expect(detailsProblems({ organizerName: 'Al', title: 'C' })).toEqual([]);
    expect(detailsProblems({ organizerName: 'a'.repeat(30), title: 'b'.repeat(50) })).toEqual([]);
  });

  it('lists both missing, the name first, on an untouched step', () => {
    expect(detailsProblems({ organizerName: '', title: '' })).toEqual([
      { code: 'NAME_MISSING' },
      { code: 'TITLE_MISSING' },
    ]);
  });

  it('counts only spaces as missing', () => {
    expect(detailsProblems({ organizerName: '   ', title: ' \t ' })).toEqual([
      { code: 'NAME_MISSING' },
      { code: 'TITLE_MISSING' },
    ]);
  });

  it('tells a name of one character from a missing one', () => {
    expect(detailsProblems({ ...valid, organizerName: ' A ' })).toEqual([
      { code: 'NAME_TOO_SHORT' },
    ]);
  });

  it('finds what is too long', () => {
    expect(detailsProblems({ organizerName: 'a'.repeat(31), title: 'b'.repeat(51) })).toEqual([
      { code: 'NAME_TOO_LONG' },
      { code: 'TITLE_TOO_LONG' },
    ]);
  });

  it('measures once the spaces around are gone', () => {
    expect(
      detailsProblems({ organizerName: `  ${'a'.repeat(30)}  `, title: ` ${'b'.repeat(50)} ` }),
    ).toEqual([]);
  });

  it('counts characters as people see them', () => {
    // 30 family emojis are 30 characters, though each is several code points.
    expect(detailsProblems({ ...valid, organizerName: '👨‍👩‍👧'.repeat(30) })).toEqual([]);
    expect(detailsProblems({ ...valid, title: 'A\u0301'.repeat(50) })).toEqual([]);
  });
});

describe('clipDetails', () => {
  it('leaves values within the limits as they are, spaces included', () => {
    const details = { organizerName: ' Ana ', title: `  ${'b'.repeat(50)} ` };
    // The same object, so a page holding it sees no change.
    expect(clipDetails(details)).toBe(details);
    expect(clipDetails({ organizerName: '', title: '' })).toEqual({ organizerName: '', title: '' });
  });

  it('keeps the first 30 characters of a name and the first 50 of a title', () => {
    expect(clipDetails({ organizerName: 'a'.repeat(31), title: 'b'.repeat(60) })).toEqual({
      organizerName: 'a'.repeat(30),
      title: 'b'.repeat(50),
    });
  });

  it('never splits a character as people see it', () => {
    // A family emoji is 11 code units and a combining accent 2: the browser's maxlength would
    // cut them, or the 50th character in two.
    expect(clipDetails({ ...valid, title: `${'c'.repeat(49)}👨‍👩‍👧‍👦x` }).title).toBe(
      `${'c'.repeat(49)}👨‍👩‍👧‍👦`,
    );
    expect(clipDetails({ ...valid, organizerName: 'A\u0301'.repeat(31) }).organizerName).toBe(
      'A\u0301'.repeat(30),
    );
  });

  it('does not count the spaces before the text', () => {
    expect(clipDetails({ ...valid, title: `  ${'b'.repeat(51)}` }).title).toBe(
      `  ${'b'.repeat(50)}`,
    );
    expect(clipDetails({ ...valid, title: `${'b'.repeat(50)} c` }).title).toBe('b'.repeat(50));
  });
});
