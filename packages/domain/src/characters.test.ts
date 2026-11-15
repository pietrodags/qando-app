import { describe, expect, it } from 'vitest';
import { clipBefore, countCharacters } from './characters.js';

describe('countCharacters', () => {
  it('counts characters as people see them', () => {
    expect(countCharacters('')).toBe(0);
    expect(countCharacters('Ana')).toBe(3);
    expect(countCharacters('👨‍👩‍👧')).toBe(1);
    expect(countCharacters('Á')).toBe(1);
  });
});

describe('clipBefore', () => {
  const full = 'Cena del equipo para celebrar juntos este verano!!';

  it('leaves an edit within the limit as it is, the caret where it was', () => {
    const title = `  ${'b'.repeat(50)} `;
    expect(clipBefore(title, 50, 3)).toEqual({ text: title, caret: 3 });
    expect(clipBefore('Ana', 30, 7)).toEqual({ text: 'Ana', caret: 7 });
  });

  it('drops what was just typed past the limit, the text before and after it untouched', () => {
    expect(full).toHaveLength(50);
    // "X" typed at the start, in the middle and at the end of a full title.
    expect(clipBefore(`X${full}`, 50, 1)).toEqual({ text: full, caret: 0 });
    expect(clipBefore(`Cena X${full.slice(5)}`, 50, 6)).toEqual({ text: full, caret: 5 });
    expect(clipBefore('a'.repeat(31), 30, 31)).toEqual({ text: 'a'.repeat(30), caret: 30 });
  });

  it('keeps as much of a paste as fits, from its start', () => {
    const name = `${'a'.repeat(10)}xyz${'a'.repeat(18)}`;
    expect(clipBefore(name, 30, 13)).toEqual({
      text: `${'a'.repeat(10)}xy${'a'.repeat(18)}`,
      caret: 12,
    });
  });

  it('takes a caret past the end as the end', () => {
    expect(clipBefore('a'.repeat(31), 30, 40)).toEqual({ text: 'a'.repeat(30), caret: 30 });
  });

  it('cuts a whole document pasted by mistake at once', () => {
    // Counted again for each character dropped, 20,000 would take seconds and freeze the page.
    const pasted = 'd'.repeat(20_000);
    expect(clipBefore(pasted, 50, pasted.length)).toEqual({ text: 'd'.repeat(50), caret: 50 });
    expect(clipBefore(`Ce${pasted}na`, 50, 2 + pasted.length)).toEqual({
      text: `Ce${'d'.repeat(46)}na`,
      caret: 48,
    });
  });

  it('never splits a character as people see it', () => {
    // A family emoji is 11 code units and a combining accent 2: the browser's maxlength would
    // cut them, or the 50th character in two.
    const title = `${'c'.repeat(49)}👨‍👩‍👧‍👦`;
    expect(clipBefore(title, 50, title.length)).toEqual({ text: title, caret: title.length });
    expect(clipBefore(`${title}x`, 50, title.length + 1)).toEqual({
      text: title,
      caret: title.length,
    });
    expect(clipBefore(`${'c'.repeat(50)}👨‍👩‍👧‍👦`, 50, 50 + '👨‍👩‍👧‍👦'.length)).toEqual({
      text: 'c'.repeat(50),
      caret: 50,
    });
    const accents = 'Á'.repeat(31);
    expect(clipBefore(accents, 30, accents.length)).toEqual({
      text: 'Á'.repeat(30),
      caret: 60,
    });
  });

  it('does not count the spaces around the text', () => {
    expect(clipBefore(' '.repeat(60), 50, 60)).toEqual({ text: ' '.repeat(60), caret: 60 });
    const title = `  ${'b'.repeat(50)} `;
    expect(clipBefore(title, 50, 1).text).toBe(title);
    expect(clipBefore(`  ${'b'.repeat(51)}`, 50, 53).text).toBe(`  ${'b'.repeat(50)}`);
  });
});
