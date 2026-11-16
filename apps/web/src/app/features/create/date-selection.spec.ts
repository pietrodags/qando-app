import {
  type DateSelection,
  NO_DATES,
  dragDays,
  hasDates,
  pressDay,
  withoutDatesBefore,
} from './date-selection';

describe('the dates of the wizard', () => {
  it('start with none', () => {
    expect(NO_DATES).toEqual({ singles: [], ranges: [] });
    expect(hasDates(NO_DATES)).toBe(false);
  });

  it('gain a date of its own when a free day is pressed', () => {
    const selection = pressDay(NO_DATES, '2026-06-20');

    expect(selection).toEqual({ singles: ['2026-06-20'], ranges: [] });
    expect(hasDates(selection)).toBe(true);
  });

  it('keep the dates in order, whatever the order of the presses', () => {
    const pressed = ['2026-07-06', '2026-06-20', '2026-06-21', '2026-06-02'].reduce(
      pressDay,
      NO_DATES,
    );

    expect(pressed.singles).toEqual(['2026-06-02', '2026-06-20', '2026-06-21', '2026-07-06']);
  });

  it('lose a date when its day is pressed again, and only that one', () => {
    const three = ['2026-06-20', '2026-06-21', '2026-06-22'].reduce(pressDay, NO_DATES);

    expect(pressDay(three, '2026-06-21')).toEqual({
      singles: ['2026-06-20', '2026-06-22'],
      ranges: [],
    });
    expect(pressDay(pressDay(NO_DATES, '2026-06-20'), '2026-06-20')).toEqual(NO_DATES);
  });

  it('never change the selection a press started from', () => {
    const before = pressDay(NO_DATES, '2026-06-20');

    pressDay(before, '2026-06-21');
    pressDay(before, '2026-06-20');

    expect(before).toEqual({ singles: ['2026-06-20'], ranges: [] });
  });

  it('lose the dates before a day, and keep that day and the later ones in order', () => {
    const marked = ['2026-06-14', '2026-06-15', '2026-06-16', '2026-07-06'].reduce(
      pressDay,
      NO_DATES,
    );

    expect(withoutDatesBefore(marked, '2026-06-16')).toEqual({
      singles: ['2026-06-16', '2026-07-06'],
      ranges: [],
    });
    expect(withoutDatesBefore(marked, '2026-07-07')).toEqual(NO_DATES);
    expect(marked.singles).toHaveLength(4);
  });

  it('stay the very same selection when no date is before the day', () => {
    const marked = ['2026-06-16', '2026-07-06'].reduce(pressDay, NO_DATES);

    expect(withoutDatesBefore(marked, '2026-06-16')).toBe(marked);
    expect(withoutDatesBefore(NO_DATES, '2026-06-16')).toBe(NO_DATES);
  });
});

/** The selection a drag leaves, starting from the days dragged before it. */
function dragged(drags: readonly (readonly [string, string])[]): DateSelection {
  return drags.reduce<DateSelection>((selection, [from, to]) => {
    const drag = dragDays(selection, from, to);
    if (!drag) throw new Error(`the drag ${from} → ${to} does nothing`);
    return drag.result;
  }, NO_DATES);
}

describe('a drag over the wizard’s dates', () => {
  it('joins the days from the first to the last as one range, in either direction', () => {
    expect(dragDays(NO_DATES, '2026-06-18', '2026-06-22')).toEqual({
      first: '2026-06-18',
      last: '2026-06-22',
      result: { singles: [], ranges: [{ start: '2026-06-18', end: '2026-06-22' }] },
    });
    expect(dragDays(NO_DATES, '2026-06-22', '2026-06-18')).toEqual({
      first: '2026-06-18',
      last: '2026-06-22',
      result: { singles: [], ranges: [{ start: '2026-06-18', end: '2026-06-22' }] },
    });
  });

  it('crosses months and years', () => {
    expect(dragged([['2026-12-30', '2027-01-02']]).ranges).toEqual([
      { start: '2026-12-30', end: '2027-01-02' },
    ]);
  });

  it('of one day is a date of its own, not a range', () => {
    expect(dragDays(NO_DATES, '2026-06-18', '2026-06-18')).toEqual({
      first: '2026-06-18',
      last: '2026-06-18',
      result: { singles: ['2026-06-18'], ranges: [] },
    });
  });

  it('of one day over a date of its own keeps it', () => {
    const single = pressDay(NO_DATES, '2026-06-18');

    expect(dragDays(single, '2026-06-18', '2026-06-18')?.result).toEqual(single);
  });

  it('takes in the dates of their own on its way, and leaves the others', () => {
    const singles = ['2026-06-17', '2026-06-18', '2026-06-20', '2026-06-22', '2026-06-23'].reduce(
      pressDay,
      NO_DATES,
    );

    expect(dragDays(singles, '2026-06-18', '2026-06-22')?.result).toEqual({
      singles: ['2026-06-17', '2026-06-23'],
      ranges: [{ start: '2026-06-18', end: '2026-06-22' }],
    });
  });

  it('stops at the day before a range in its way', () => {
    const range = dragged([['2026-06-20', '2026-06-22']]);

    expect(dragDays(range, '2026-06-17', '2026-06-25')).toEqual({
      first: '2026-06-17',
      last: '2026-06-19',
      result: {
        singles: [],
        ranges: [
          { start: '2026-06-17', end: '2026-06-19' },
          { start: '2026-06-20', end: '2026-06-22' },
        ],
      },
    });
    // Also when it ends inside that range.
    expect(dragDays(range, '2026-06-17', '2026-06-21')?.last).toBe('2026-06-19');
  });

  it('stops at the day after a range in its way when it goes backwards', () => {
    const range = dragged([['2026-06-20', '2026-06-22']]);

    expect(dragDays(range, '2026-06-25', '2026-06-17')).toEqual({
      first: '2026-06-23',
      last: '2026-06-25',
      result: {
        singles: [],
        ranges: [
          { start: '2026-06-20', end: '2026-06-22' },
          { start: '2026-06-23', end: '2026-06-25' },
        ],
      },
    });
    expect(dragDays(range, '2026-06-25', '2026-06-20')?.first).toBe('2026-06-23');
  });

  it('stops at the nearest range of several in its way', () => {
    const ranges = dragged([
      ['2026-06-10', '2026-06-11'],
      ['2026-06-20', '2026-06-21'],
      ['2026-06-26', '2026-06-27'],
    ]);

    expect(dragDays(ranges, '2026-06-15', '2026-06-30')?.last).toBe('2026-06-19');
    expect(dragDays(ranges, '2026-06-24', '2026-06-01')?.first).toBe('2026-06-22');
  });

  it('from the day next to a range, towards it, leaves that day as a date of its own', () => {
    const range = dragged([['2026-06-20', '2026-06-22']]);

    expect(dragDays(range, '2026-06-19', '2026-06-21')?.result).toEqual({
      singles: ['2026-06-19'],
      ranges: [{ start: '2026-06-20', end: '2026-06-22' }],
    });
    expect(dragDays(range, '2026-06-23', '2026-06-21')?.result.singles).toEqual(['2026-06-23']);
  });

  it('keeps two ranges that touch as two, in order', () => {
    expect(
      dragged([
        ['2026-07-09', '2026-07-11'],
        ['2026-07-06', '2026-07-08'],
      ]),
    ).toEqual({
      singles: [],
      ranges: [
        { start: '2026-07-06', end: '2026-07-08' },
        { start: '2026-07-09', end: '2026-07-11' },
      ],
    });
  });

  it('never changes the selection it started from', () => {
    const before = dragged([['2026-06-20', '2026-06-22']]);

    dragDays(before, '2026-06-22', '2026-06-25');
    dragDays(before, '2026-06-10', '2026-06-12');

    expect(before).toEqual({ singles: [], ranges: [{ start: '2026-06-20', end: '2026-06-22' }] });
  });
});

describe('a drag from a day of a range', () => {
  it('from its last day makes it longer or shorter, its first day staying', () => {
    const range = dragged([['2026-06-10', '2026-06-14']]);

    expect(dragDays(range, '2026-06-14', '2026-06-17')).toEqual({
      first: '2026-06-10',
      last: '2026-06-17',
      result: { singles: [], ranges: [{ start: '2026-06-10', end: '2026-06-17' }] },
    });
    expect(dragDays(range, '2026-06-14', '2026-06-12')?.result.ranges).toEqual([
      { start: '2026-06-10', end: '2026-06-12' },
    ]);
  });

  it('from its first day makes it longer or shorter, its last day staying', () => {
    const range = dragged([['2026-06-10', '2026-06-14']]);

    expect(dragDays(range, '2026-06-10', '2026-06-08')?.result.ranges).toEqual([
      { start: '2026-06-08', end: '2026-06-14' },
    ]);
    expect(dragDays(range, '2026-06-10', '2026-06-13')?.result.ranges).toEqual([
      { start: '2026-06-13', end: '2026-06-14' },
    ]);
  });

  it('from an end, back onto itself, leaves the range as it was', () => {
    const range = dragged([['2026-06-10', '2026-06-14']]);

    expect(dragDays(range, '2026-06-14', '2026-06-14')).toEqual({
      first: '2026-06-10',
      last: '2026-06-14',
      result: range,
    });
    expect(dragDays(range, '2026-06-10', '2026-06-10')?.result).toEqual(range);
  });

  it('from an end to the other end leaves that day as a date of its own', () => {
    const range = dragged([['2026-06-10', '2026-06-14']]);

    expect(dragDays(range, '2026-06-14', '2026-06-10')?.result).toEqual({
      singles: ['2026-06-10'],
      ranges: [],
    });
    expect(dragDays(range, '2026-06-10', '2026-06-14')?.result).toEqual({
      singles: ['2026-06-14'],
      ranges: [],
    });
  });

  it('from an end past the other end turns the range around it', () => {
    const range = dragged([['2026-06-10', '2026-06-14']]);

    expect(dragDays(range, '2026-06-14', '2026-06-08')?.result.ranges).toEqual([
      { start: '2026-06-08', end: '2026-06-10' },
    ]);
    expect(dragDays(range, '2026-06-10', '2026-06-16')?.result.ranges).toEqual([
      { start: '2026-06-14', end: '2026-06-16' },
    ]);
  });

  it('works from either day of a range of two days', () => {
    const range = dragged([['2026-06-10', '2026-06-11']]);

    expect(dragDays(range, '2026-06-11', '2026-06-13')?.result.ranges).toEqual([
      { start: '2026-06-10', end: '2026-06-13' },
    ]);
    expect(dragDays(range, '2026-06-10', '2026-06-08')?.result.ranges).toEqual([
      { start: '2026-06-08', end: '2026-06-11' },
    ]);
  });

  it('from a day between its ends does nothing', () => {
    const range = dragged([['2026-06-10', '2026-06-14']]);

    expect(dragDays(range, '2026-06-12', '2026-06-16')).toBeNull();
    expect(dragDays(range, '2026-06-11', '2026-06-08')).toBeNull();
    expect(dragDays(range, '2026-06-13', '2026-06-13')).toBeNull();
  });

  it('stops at another range and takes in the dates of their own, as a new drag does', () => {
    const marked = pressDay(
      dragged([
        ['2026-06-10', '2026-06-12'],
        ['2026-06-16', '2026-06-18'],
      ]),
      '2026-06-14',
    );

    expect(dragDays(marked, '2026-06-12', '2026-06-17')).toEqual({
      first: '2026-06-10',
      last: '2026-06-15',
      result: {
        singles: [],
        ranges: [
          { start: '2026-06-10', end: '2026-06-15' },
          { start: '2026-06-16', end: '2026-06-18' },
        ],
      },
    });
  });

  it('leaves the other ranges and their order alone', () => {
    const ranges = dragged([
      ['2026-06-02', '2026-06-03'],
      ['2026-06-10', '2026-06-12'],
      ['2026-06-20', '2026-06-21'],
    ]);

    expect(dragDays(ranges, '2026-06-12', '2026-06-11')?.result.ranges).toEqual([
      { start: '2026-06-02', end: '2026-06-03' },
      { start: '2026-06-10', end: '2026-06-11' },
      { start: '2026-06-20', end: '2026-06-21' },
    ]);
  });
});

describe('a press on a day of a range', () => {
  it('removes the whole range, from any of its days, and nothing else', () => {
    const marked = pressDay(
      dragged([
        ['2026-06-10', '2026-06-14'],
        ['2026-06-15', '2026-06-16'],
      ]),
      '2026-06-20',
    );
    const without = {
      singles: ['2026-06-20'],
      ranges: [{ start: '2026-06-15', end: '2026-06-16' }],
    };

    expect(pressDay(marked, '2026-06-10')).toEqual(without);
    expect(pressDay(marked, '2026-06-12')).toEqual(without);
    expect(pressDay(marked, '2026-06-14')).toEqual(without);
  });

  it('leaves an event with only ranges with dates, and with none once they are removed', () => {
    const range = dragged([['2026-06-10', '2026-06-14']]);

    expect(hasDates(range)).toBe(true);
    expect(pressDay(range, '2026-06-11')).toEqual(NO_DATES);
    expect(hasDates(pressDay(range, '2026-06-11'))).toBe(false);
  });
});
