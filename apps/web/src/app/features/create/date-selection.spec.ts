import { MAX_OPTIONS } from '@qando/domain';
import {
  type DateSelection,
  NO_DATES,
  asksForTimes,
  dragDays,
  hasDates,
  holdDay,
  optionCount,
  pressDay,
  removeSaved,
  saveRange,
  isFull,
  withTimes,
  withoutDates,
  withoutDatesBefore,
} from './date-selection';
import type { DayTime } from './day-times';
import { daysFrom } from './days-from';

describe('the dates of the wizard', () => {
  it('start with none', () => {
    expect(NO_DATES).toEqual({ singles: [], ranges: [], saved: [], times: {}, timed: false });
    expect(hasDates(NO_DATES)).toBe(false);
  });

  it('gain a date of its own when a free day is pressed', () => {
    const selection = pressDay(NO_DATES, '2026-06-20');

    expect(selection).toEqual({
      singles: ['2026-06-20'],
      ranges: [],
      saved: [],
      times: {},
      timed: false,
    });
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
      saved: [],
      times: {},
      timed: false,
    });
    expect(pressDay(pressDay(NO_DATES, '2026-06-20'), '2026-06-20')).toEqual(NO_DATES);
  });

  it('never change the selection a press started from', () => {
    const before = pressDay(NO_DATES, '2026-06-20');

    pressDay(before, '2026-06-21');
    pressDay(before, '2026-06-20');

    expect(before).toEqual({
      singles: ['2026-06-20'],
      ranges: [],
      saved: [],
      times: {},
      timed: false,
    });
  });

  it('lose the dates before a day, and keep that day and the later ones in order', () => {
    const marked = ['2026-06-14', '2026-06-15', '2026-06-16', '2026-07-06'].reduce(
      pressDay,
      NO_DATES,
    );

    expect(withoutDatesBefore(marked, '2026-06-16')).toEqual({
      singles: ['2026-06-16', '2026-07-06'],
      ranges: [],
      saved: [],
      times: {},
      timed: false,
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
      anchor: '2026-06-18',
      first: '2026-06-18',
      last: '2026-06-22',
      alreadySaved: null,
      result: {
        singles: [],
        ranges: [{ start: '2026-06-18', end: '2026-06-22' }],
        saved: [],
        times: {},
        timed: false,
      },
    });
    expect(dragDays(NO_DATES, '2026-06-22', '2026-06-18')).toEqual({
      anchor: '2026-06-22',
      first: '2026-06-18',
      last: '2026-06-22',
      alreadySaved: null,
      result: {
        singles: [],
        ranges: [{ start: '2026-06-18', end: '2026-06-22' }],
        saved: [],
        times: {},
        timed: false,
      },
    });
  });

  it('crosses months and years', () => {
    expect(dragged([['2026-12-30', '2027-01-02']]).ranges).toEqual([
      { start: '2026-12-30', end: '2027-01-02' },
    ]);
  });

  it('of one day is a date of its own, not a range', () => {
    expect(dragDays(NO_DATES, '2026-06-18', '2026-06-18')).toEqual({
      anchor: '2026-06-18',
      first: '2026-06-18',
      last: '2026-06-18',
      alreadySaved: null,
      result: { singles: ['2026-06-18'], ranges: [], saved: [], times: {}, timed: false },
    });
  });

  it('of one day keeps the dates of their own in order', () => {
    const later = pressDay(NO_DATES, '2026-06-20');

    expect(dragDays(later, '2026-06-18', '2026-06-18')?.result.singles).toEqual([
      '2026-06-18',
      '2026-06-20',
    ]);
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
      saved: [],
      times: {},
      timed: false,
    });
  });

  it('stops at the day before a range in its way', () => {
    const range = dragged([['2026-06-20', '2026-06-22']]);

    expect(dragDays(range, '2026-06-17', '2026-06-25')).toEqual({
      anchor: '2026-06-17',
      first: '2026-06-17',
      last: '2026-06-19',
      alreadySaved: null,
      result: {
        singles: [],
        ranges: [
          { start: '2026-06-17', end: '2026-06-19' },
          { start: '2026-06-20', end: '2026-06-22' },
        ],
        saved: [],
        times: {},
        timed: false,
      },
    });
    // Also when it ends inside that range, or on its first day.
    expect(dragDays(range, '2026-06-17', '2026-06-21')?.last).toBe('2026-06-19');
    expect(dragDays(range, '2026-06-17', '2026-06-20')?.last).toBe('2026-06-19');
  });

  it('stops at the day after a range in its way when it goes backwards', () => {
    const range = dragged([['2026-06-20', '2026-06-22']]);

    expect(dragDays(range, '2026-06-25', '2026-06-17')).toEqual({
      anchor: '2026-06-25',
      first: '2026-06-23',
      last: '2026-06-25',
      alreadySaved: null,
      result: {
        singles: [],
        ranges: [
          { start: '2026-06-20', end: '2026-06-22' },
          { start: '2026-06-23', end: '2026-06-25' },
        ],
        saved: [],
        times: {},
        timed: false,
      },
    });
    expect(dragDays(range, '2026-06-25', '2026-06-20')?.first).toBe('2026-06-23');
    // Also when it ends on that range's last day.
    expect(dragDays(range, '2026-06-25', '2026-06-22')?.first).toBe('2026-06-23');
  });

  it('gets to its day when the ranges on its side are farther', () => {
    const ranges = dragged([
      ['2026-06-10', '2026-06-11'],
      ['2026-06-28', '2026-06-29'],
    ]);

    expect(dragDays(ranges, '2026-06-20', '2026-06-15')?.first).toBe('2026-06-15');
    expect(dragDays(ranges, '2026-06-20', '2026-06-25')?.last).toBe('2026-06-25');
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
      saved: [],
      times: {},
      timed: false,
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
      saved: [],
      times: {},
      timed: false,
    });
  });

  it('never changes the selection it started from', () => {
    const before = dragged([['2026-06-20', '2026-06-22']]);

    dragDays(before, '2026-06-22', '2026-06-25');
    dragDays(before, '2026-06-10', '2026-06-12');

    expect(before).toEqual({
      singles: [],
      ranges: [{ start: '2026-06-20', end: '2026-06-22' }],
      saved: [],
      times: {},
      timed: false,
    });
  });
});

describe('a drag from a day of a range', () => {
  it('from its last day makes it longer or shorter, its first day staying', () => {
    const range = dragged([['2026-06-10', '2026-06-14']]);

    expect(dragDays(range, '2026-06-14', '2026-06-17')).toEqual({
      anchor: '2026-06-10',
      first: '2026-06-10',
      last: '2026-06-17',
      alreadySaved: null,
      result: {
        singles: [],
        ranges: [{ start: '2026-06-10', end: '2026-06-17' }],
        saved: [],
        times: {},
        timed: false,
      },
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
      anchor: '2026-06-10',
      first: '2026-06-10',
      last: '2026-06-14',
      alreadySaved: null,
      result: range,
    });
    expect(dragDays(range, '2026-06-10', '2026-06-10')?.result).toEqual(range);
  });

  it('from an end to the other end leaves that day as a date of its own', () => {
    const range = dragged([['2026-06-10', '2026-06-14']]);

    expect(dragDays(range, '2026-06-14', '2026-06-10')?.result).toEqual({
      singles: ['2026-06-10'],
      ranges: [],
      saved: [],
      times: {},
      timed: false,
    });
    expect(dragDays(range, '2026-06-10', '2026-06-14')?.result).toEqual({
      singles: ['2026-06-14'],
      ranges: [],
      saved: [],
      times: {},
      timed: false,
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
      anchor: '2026-06-10',
      first: '2026-06-10',
      last: '2026-06-15',
      alreadySaved: null,
      result: {
        singles: [],
        ranges: [
          { start: '2026-06-10', end: '2026-06-15' },
          { start: '2026-06-16', end: '2026-06-18' },
        ],
        saved: [],
        times: {},
        timed: false,
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

describe('the ranges, once a day has passed', () => {
  it('leave whole when their first day is before the day, and stay when it is that day', () => {
    const marked = pressDay(
      dragged([
        ['2026-06-14', '2026-06-18'],
        ['2026-06-19', '2026-06-20'],
      ]),
      '2026-06-25',
    );

    expect(withoutDatesBefore(marked, '2026-06-14')).toBe(marked);
    expect(withoutDatesBefore(marked, '2026-06-15')).toEqual({
      singles: ['2026-06-25'],
      ranges: [{ start: '2026-06-19', end: '2026-06-20' }],
      saved: [],
      times: {},
      timed: false,
    });
    expect(withoutDatesBefore(marked, '2026-06-20')).toEqual({
      singles: ['2026-06-25'],
      ranges: [],
      saved: [],
      times: {},
      timed: false,
    });
    expect(marked.ranges).toHaveLength(2);
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
      saved: [],
      times: {},
      timed: false,
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

describe('the saved ranges of the wizard', () => {
  const week = { start: '2026-06-22', end: '2026-06-26' };
  const weekend = { start: '2026-06-19', end: '2026-06-21' };
  const drawn: DateSelection = {
    singles: ['2026-06-17'],
    ranges: [weekend, week],
    saved: [],
    times: {},
    timed: false,
  };

  it('take a range from the calendar: its days are free again', () => {
    const selection = saveRange(drawn, week);

    expect(selection).toEqual({
      singles: ['2026-06-17'],
      ranges: [weekend],
      saved: [week],
      times: {},
      timed: false,
    });
  });

  it('are kept by first day, then by last day, whatever the order they were saved in', () => {
    const long = { start: '2026-06-19', end: '2026-06-30' };
    const short = { start: '2026-06-19', end: '2026-06-20' };
    const saved = [week, long, weekend, short].reduce(
      (selection, range) => saveRange({ ...selection, ranges: [range] }, range),
      NO_DATES,
    );

    expect(saved.saved).toEqual([short, weekend, long, week]);
  });

  it('are not made again: a drag over the days of one leaves the dates as they were', () => {
    const selection: DateSelection = {
      singles: ['2026-06-23'],
      ranges: [weekend],
      saved: [week],
      times: {},
      timed: false,
    };

    const drag = dragDays(selection, week.end, week.start);

    expect(drag).toEqual({
      anchor: week.end,
      first: week.start,
      last: week.end,
      alreadySaved: week,
      result: selection,
    });
    expect(drag?.result).toBe(selection);
    expect(drag?.alreadySaved).toBe(week);
  });

  it('are not made again by a range moved by an end, which stays as it was', () => {
    const short = { start: week.start, end: '2026-06-25' };
    const selection: DateSelection = {
      singles: [],
      ranges: [short],
      saved: [week],
      times: {},
      timed: false,
    };

    const drag = dragDays(selection, short.end, week.end);

    expect(drag?.alreadySaved).toBe(week);
    expect(drag?.result).toBe(selection);
  });

  it('are told by both their days: a range a day longer or a day earlier is made', () => {
    const selection: DateSelection = {
      singles: [],
      ranges: [],
      saved: [week],
      times: {},
      timed: false,
    };
    const longer = { start: week.start, end: '2026-06-27' };
    const earlier = { start: '2026-06-21', end: week.end };

    expect(dragDays(selection, longer.start, longer.end)).toMatchObject({
      alreadySaved: null,
      result: { ranges: [longer] },
    });
    expect(dragDays(selection, earlier.start, earlier.end)).toMatchObject({
      alreadySaved: null,
      result: { ranges: [earlier] },
    });
  });

  it('save nothing that is not a range of the calendar', () => {
    expect(saveRange(drawn, { start: '2026-06-22', end: '2026-06-25' })).toBe(drawn);
    expect(saveRange(drawn, { start: '2026-06-23', end: '2026-06-26' })).toBe(drawn);
  });

  it('lose a range when it is removed, and nothing else', () => {
    const selection: DateSelection = {
      singles: ['2026-06-24'],
      ranges: [weekend],
      saved: [weekend, week],
      times: {},
      timed: false,
    };

    expect(removeSaved(selection, { ...week })).toEqual({
      singles: ['2026-06-24'],
      ranges: [weekend],
      saved: [weekend],
      times: {},
      timed: false,
    });
    expect(removeSaved(selection, { start: week.start, end: '2026-06-27' }).saved).toHaveLength(2);
    expect(removeSaved(selection, { start: '2026-06-21', end: week.end }).saved).toHaveLength(2);
  });

  it('are options too: an event with only a saved range has dates', () => {
    expect(hasDates({ singles: [], ranges: [], saved: [week], times: {}, timed: false })).toBe(
      true,
    );
  });

  it('leave their days free: a press marks one and a drag goes through them', () => {
    const selection: DateSelection = {
      singles: [],
      ranges: [],
      saved: [week],
      times: {},
      timed: false,
    };

    expect(pressDay(selection, '2026-06-24')).toEqual({
      singles: ['2026-06-24'],
      ranges: [],
      saved: [week],
      times: {},
      timed: false,
    });
    expect(dragDays(selection, '2026-06-20', '2026-06-28')?.result).toEqual({
      singles: [],
      ranges: [{ start: '2026-06-20', end: '2026-06-28' }],
      saved: [week],
      times: {},
      timed: false,
    });
    expect(dragDays(selection, '2026-06-24', '2026-06-24')?.result).toEqual({
      singles: ['2026-06-24'],
      ranges: [],
      saved: [week],
      times: {},
      timed: false,
    });
  });

  it('are gone after midnight when they began before the new today, whole', () => {
    const selection: DateSelection = {
      singles: [],
      ranges: [],
      saved: [weekend, week],
      times: {},
      timed: false,
    };

    expect(withoutDatesBefore(selection, '2026-06-20')).toEqual({
      singles: [],
      ranges: [],
      saved: [week],
      times: {},
      timed: false,
    });
    expect(withoutDatesBefore(selection, '2026-06-19')).toBe(selection);
  });
});

describe('a day held as the first of a range', () => {
  const dates: DateSelection = {
    singles: ['2026-06-10'],
    ranges: [{ start: '2026-06-17', end: '2026-06-19' }],
    saved: [],
    times: {},
    timed: false,
  };

  it('is the drag of that one day: left there, a date of its own', () => {
    const held = holdDay(dates, '2026-06-20');

    expect(held).toEqual(dragDays(dates, '2026-06-20', '2026-06-20'));
    expect(held?.result.singles).toEqual(['2026-06-10', '2026-06-20']);
    expect(holdDay(dates, '2026-06-10')?.result).toEqual(dates);
  });

  it('is made from the other end when it is the first or the last day of a range', () => {
    expect(holdDay(dates, '2026-06-19')?.anchor).toBe('2026-06-17');
    expect(holdDay(dates, '2026-06-17')?.anchor).toBe('2026-06-19');
  });

  it('holds nothing between the ends of a range', () => {
    expect(holdDay(dates, '2026-06-18')).toBeNull();
  });
});

describe('the 60 options of an event', () => {
  const range = { start: '2026-09-01', end: '2026-09-03' };
  const saved = { start: '2026-09-10', end: '2026-09-12' };
  /** A range, a saved range and as many dates of their own in a row, from 1 July 2026. */
  function withSingles(count: number): DateSelection {
    const singles = Array.from({ length: count }, (_, place) => daysFrom('2026-07-01', place));
    return { singles, ranges: [range], saved: [saved], times: {}, timed: false };
  }
  const full = withSingles(58);

  it('are each date of its own, each range and each saved range', () => {
    expect(optionCount(NO_DATES)).toBe(0);
    expect(
      optionCount({
        singles: ['2026-06-20', '2026-06-21'],
        ranges: [],
        saved: [],
        times: {},
        timed: false,
      }),
    ).toBe(2);
    expect(optionCount({ singles: [], ranges: [range], saved: [], times: {}, timed: false })).toBe(
      1,
    );
    expect(
      optionCount({ singles: [], ranges: [], saved: [saved, range], times: {}, timed: false }),
    ).toBe(2);
    expect(optionCount(full)).toBe(60);
  });

  it('are reached by a press, and take no 61st: a free day stays free', () => {
    const reached = pressDay(withSingles(57), '2026-06-20');

    expect(optionCount(reached)).toBe(60);
    expect(pressDay(reached, '2026-06-21')).toBe(reached);
  });

  it('still lose a date or a range to a press', () => {
    expect(optionCount(pressDay(full, '2026-07-01'))).toBe(59);
    expect(pressDay(full, '2026-09-02').ranges).toEqual([]);
  });

  it('are reached by a drag, and take no 61st: the drag does nothing', () => {
    const almost = withSingles(57);

    expect(dragDays(almost, '2026-06-20', '2026-06-22')?.result.ranges).toHaveLength(2);
    expect(dragDays(almost, '2026-06-20', '2026-06-20')?.result.singles).toHaveLength(58);
    expect(dragDays(full, '2026-06-20', '2026-06-22')).toBeNull();
    expect(dragDays(full, '2026-06-20', '2026-06-20')).toBeNull();
  });

  it('let a drag take dates of their own into a range: no more options than there were', () => {
    // From the day before the first date: one date taken in, still 60.
    const one = dragDays(full, '2026-06-30', '2026-07-01');
    const two = dragDays(full, '2026-06-30', '2026-07-02');

    expect(one && optionCount(one.result)).toBe(60);
    expect(two && optionCount(two.result)).toBe(59);
  });

  it('let a free day be held, for a range that takes dates of their own in: left there it stays free', () => {
    const held = holdDay(full, '2026-06-30');

    expect(held).toEqual({
      anchor: '2026-06-30',
      first: '2026-06-30',
      last: '2026-06-30',
      alreadySaved: null,
      result: full,
    });
    expect(held?.result).toBe(full);
    // Between the ends of a range nothing is held, with every option taken either.
    expect(holdDay(full, '2026-09-02')).toBeNull();
    expect(holdDay(full, '2026-09-03')?.anchor).toBe('2026-09-01');
  });

  it('let a drag move the end of a range', () => {
    const moved = dragDays(full, '2026-09-03', '2026-09-05');

    expect(moved?.result.ranges).toEqual([{ start: '2026-09-01', end: '2026-09-05' }]);
    // Shrunk to one day, the range is a date of its own: one option still.
    expect(dragDays(full, '2026-09-03', '2026-09-01')?.result.singles).toHaveLength(59);
  });

  describe('with times', () => {
    const at = (...times: string[]): DayTime[] =>
      times.map((time) => ({ kind: 'single', at: time }));
    const days = (...singles: string[]): DateSelection => ({ ...NO_DATES, singles, timed: true });

    it('keep the times of a date of its own, by date', () => {
      const selection = withTimes(days('2026-06-20', '2026-06-21'), '2026-06-21', at('18:00'));

      expect(selection.times).toEqual({ '2026-06-21': at('18:00') });
      expect(selection.singles).toEqual(['2026-06-20', '2026-06-21']);
    });

    it('keep no entry for a date left without times', () => {
      const timed = withTimes(days('2026-06-20'), '2026-06-20', at('18:00'));

      expect(withTimes(timed, '2026-06-20', []).times).toEqual({});
    });

    it('give no times to a day that is not a date of its own', () => {
      const selection: DateSelection = {
        ...days('2026-06-20'),
        ranges: [{ start: '2026-06-22', end: '2026-06-24' }],
      };

      expect(withTimes(selection, '2026-06-23', at('18:00'))).toBe(selection);
      expect(withTimes(selection, '2026-06-25', at('18:00'))).toBe(selection);
    });

    it('lose the times of a date that is unmarked: marked again, it has none', () => {
      const timed = withTimes(days('2026-06-20', '2026-06-21'), '2026-06-20', at('18:00'));
      const both = withTimes(timed, '2026-06-21', at('09:00'));

      const without = pressDay(both, '2026-06-20');

      expect(without.times).toEqual({ '2026-06-21': at('09:00') });
      expect(pressDay(without, '2026-06-20').times).toEqual({ '2026-06-21': at('09:00') });
    });

    it('lose the times of the dates a drag takes into a range', () => {
      const timed = withTimes(days('2026-06-20', '2026-06-25'), '2026-06-20', at('18:00'));
      const both = withTimes(timed, '2026-06-25', at('09:00'));

      const drag = dragDays(both, '2026-06-19', '2026-06-21');

      expect(drag?.result.times).toEqual({ '2026-06-25': at('09:00') });
    });

    it('lose the times of the dates before a day', () => {
      const timed = withTimes(days('2026-06-20', '2026-06-25'), '2026-06-20', at('18:00'));
      const both = withTimes(timed, '2026-06-25', at('09:00'));

      expect(withoutDatesBefore(both, '2026-06-21').times).toEqual({ '2026-06-25': at('09:00') });
      expect(withoutDatesBefore(both, '2026-06-20')).toBe(both);
    });

    it('are cleared with every date, and whether times were asked for is kept', () => {
      const selection: DateSelection = {
        ...withTimes(days('2026-06-20'), '2026-06-20', at('18:00')),
        ranges: [{ start: '2026-06-22', end: '2026-06-24' }],
        saved: [{ start: '2026-07-01', end: '2026-07-02' }],
      };

      expect(withoutDates(selection)).toEqual({ ...NO_DATES, timed: true });
      expect(withoutDates({ ...selection, timed: false })).toEqual(NO_DATES);
    });

    it('count an option for each time of a date after its first', () => {
      const selection: DateSelection = {
        ...days('2026-06-20', '2026-06-21', '2026-06-22'),
        ranges: [{ start: '2026-06-24', end: '2026-06-25' }],
      };
      const one = withTimes(selection, '2026-06-20', at('18:00'));
      const three = withTimes(one, '2026-06-21', at('09:00', '10:15', '18:00'));

      expect(optionCount(selection)).toBe(4);
      expect(optionCount(one)).toBe(4);
      expect(optionCount(three)).toBe(6);
    });

    it('count no times while they are not asked for, and keep them', () => {
      const timed = withTimes(days('2026-06-20'), '2026-06-20', at('09:00', '10:00', '18:00'));
      const off: DateSelection = { ...timed, timed: false };

      expect(optionCount(timed)).toBe(3);
      expect(optionCount(off)).toBe(1);
      expect(off.times).toEqual(timed.times);
    });

    it('take no new day once the times fill the event', () => {
      const hours = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);
      const first = ['2026-06-20', '2026-06-21', '2026-06-22'];
      const full = first
        .slice(0, 2)
        .reduce((selection, date) => withTimes(selection, date, at(...hours)), days(...first));
      const sixty = withTimes(full, '2026-06-22', at(...hours.slice(0, 12)));

      expect(optionCount(sixty)).toBe(MAX_OPTIONS);
      expect(pressDay(sixty, '2026-06-23')).toBe(sixty);
      expect(dragDays(sixty, '2026-06-23', '2026-06-24')).toBeNull();
      expect(pressDay({ ...sixty, timed: false }, '2026-06-23').singles).toHaveLength(4);
    });

    it('are full at as many options as an event takes', () => {
      const hours = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);
      const dates = ['2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23'];
      const almost = dates
        .slice(0, 2)
        .reduce((selection, date) => withTimes(selection, date, at(...hours)), days(...dates));
      // 24 + 24 + 10 + the date without times: 59.
      const fiftyNine = withTimes(almost, '2026-06-22', at(...hours.slice(0, 10)));
      const sixty = withTimes(almost, '2026-06-22', at(...hours.slice(0, 11)));

      expect(isFull(fiftyNine)).toBe(false);
      expect(isFull(sixty)).toBe(true);
      expect(isFull({ ...sixty, timed: false })).toBe(false);
    });

    it('ask for times while the switch is on and a date of its own can have them', () => {
      const range = { start: '2026-06-22', end: '2026-06-24' };

      expect(asksForTimes(days('2026-06-20'))).toBe(true);
      expect(asksForTimes({ ...days('2026-06-20'), timed: false })).toBe(false);
      expect(asksForTimes({ ...days(), ranges: [range], saved: [range] })).toBe(false);
      expect(asksForTimes(NO_DATES)).toBe(false);
    });
  });
});
