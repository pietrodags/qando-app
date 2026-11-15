import { describe, expect, it } from 'vitest';
import {
  EVENT_TITLE_MAX_LENGTH,
  ORGANIZER_NAME_MAX_LENGTH,
  ORGANIZER_NAME_MIN_LENGTH,
  clipEdit,
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

describe('clipEdit', () => {
  const full = 'Cena del equipo para celebrar juntos este verano!!';

  it('leaves an edit within the limits as it is: the same object, the caret where it was', () => {
    const details = { organizerName: ' Ana ', title: `  ${'b'.repeat(50)} ` };
    expect(clipEdit(details, 'title', 3)).toEqual({ details, caret: 3 });
    expect(clipEdit(details, 'title', 3).details).toBe(details);
  });

  it('drops what was just typed past the limit, the text before and after it untouched', () => {
    expect(full).toHaveLength(EVENT_TITLE_MAX_LENGTH);
    // "X" typed at the start, in the middle and at the end of a full title.
    expect(clipEdit({ ...valid, title: `X${full}` }, 'title', 1)).toEqual({
      details: { ...valid, title: full },
      caret: 0,
    });
    expect(clipEdit({ ...valid, title: `Cena X${full.slice(5)}` }, 'title', 6)).toEqual({
      details: { ...valid, title: full },
      caret: 5,
    });
    expect(clipEdit({ ...valid, organizerName: 'a'.repeat(31) }, 'organizerName', 31)).toEqual({
      details: { ...valid, organizerName: 'a'.repeat(30) },
      caret: 30,
    });
  });

  it('keeps as much of a paste as fits, from its start', () => {
    const name = `${'a'.repeat(10)}xyz${'a'.repeat(18)}`;
    expect(clipEdit({ ...valid, organizerName: name }, 'organizerName', 13)).toEqual({
      details: { ...valid, organizerName: `${'a'.repeat(10)}xy${'a'.repeat(18)}` },
      caret: 12,
    });
  });

  it('never splits a character as people see it', () => {
    // A family emoji is 11 code units and a combining accent 2: the browser's maxlength would
    // cut them, or the 50th character in two.
    const title = `${'c'.repeat(49)}👨‍👩‍👧‍👦`;
    const fits = { ...valid, title };
    expect(clipEdit(fits, 'title', title.length).details).toBe(fits);
    expect(clipEdit({ ...valid, title: `${title}x` }, 'title', title.length + 1)).toEqual({
      details: { ...valid, title },
      caret: title.length,
    });
    expect(clipEdit({ ...valid, title: `${'c'.repeat(50)}👨‍👩‍👧‍👦` }, 'title', 50 + '👨‍👩‍👧‍👦'.length)).toEqual(
      { details: { ...valid, title: 'c'.repeat(50) }, caret: 50 },
    );
    const accents = 'A\u0301'.repeat(31);
    expect(clipEdit({ ...valid, organizerName: accents }, 'organizerName', accents.length)).toEqual(
      { details: { ...valid, organizerName: 'A\u0301'.repeat(30) }, caret: 60 },
    );
  });

  it('does not count the spaces around the text', () => {
    const title = `  ${'b'.repeat(50)} `;
    expect(clipEdit({ ...valid, title }, 'title', 1).details.title).toBe(title);
    expect(clipEdit({ ...valid, title: `  ${'b'.repeat(51)}` }, 'title', 53).details.title).toBe(
      `  ${'b'.repeat(50)}`,
    );
  });
});
