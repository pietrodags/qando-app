import { type DateSelection, NO_DATES, dragDays, pressDay } from './date-selection';
import { type DaySpan, addMonths, monthGrid, monthOf, monthWithin, movedDay } from './month-grid';

const june: DaySpan = { first: '2026-06-15', last: '2027-06-15' };

describe('monthGrid', () => {
  it('lists every day of the month with its number', () => {
    const { days } = monthGrid('2026-06', june, NO_DATES);

    expect(days.map(({ day }) => day)).toEqual(Array.from({ length: 30 }, (_, index) => index + 1));
    expect(days[0]?.date).toBe('2026-06-01');
    expect(days.at(-1)?.date).toBe('2026-06-30');
  });

  it.each([
    ['2026-06', 0, 30], // starts on a Monday
    ['2026-07', 2, 31], // on a Wednesday
    ['2026-11', 6, 30], // on a Sunday
    ['2027-02', 0, 28],
    ['2028-02', 1, 29],
    ['2026-12', 1, 31],
  ])(
    'pads %s with %i blanks before the 1st, Monday first, and has %i days',
    (month, blanks, days) => {
      const grid = monthGrid(month, { first: '2026-01-01', last: '2029-01-01' }, NO_DATES);

      expect([grid.leadingBlanks, grid.days.length]).toEqual([blanks, days]);
    },
  );

  it('turns off the days before the first eligible day, which is free itself', () => {
    const { days } = monthGrid('2026-06', june, NO_DATES);

    expect(days.map(({ state }) => state)).toEqual([
      ...Array.from({ length: 14 }, () => 'off'),
      ...Array.from({ length: 16 }, () => 'free'),
    ]);
  });

  it('turns off the days after the last eligible day, which is free itself', () => {
    const { days } = monthGrid('2027-06', june, NO_DATES);

    expect(days.map(({ state }) => state)).toEqual([
      ...Array.from({ length: 15 }, () => 'free'),
      ...Array.from({ length: 15 }, () => 'off'),
    ]);
  });

  it('shows the dates marked one by one as single days, only in their month', () => {
    const selection = ['2026-07-06', '2026-07-07', '2026-08-06'].reduce(pressDay, NO_DATES);

    const marked = (month: string): string[] =>
      monthGrid(month, june, selection)
        .days.filter(({ state }) => state === 'single')
        .map(({ date }) => date);

    expect(marked('2026-07')).toEqual(['2026-07-06', '2026-07-07']);
    expect(marked('2026-08')).toEqual(['2026-08-06']);
    expect(marked('2026-09')).toEqual([]);
  });

  it('keeps a marked day that is no longer eligible off', () => {
    // The page stayed open past midnight: yesterday's mark cannot be pressed any more.
    const selection = pressDay(NO_DATES, '2026-06-14');

    expect(monthGrid('2026-06', june, selection).days[13]?.state).toBe('off');
  });
});

describe('monthOf and addMonths', () => {
  it('name the month of a date', () => {
    expect(monthOf('2026-06-15')).toBe('2026-06');
  });

  it('move a month forward and back, across years', () => {
    expect(addMonths('2026-06', 1)).toBe('2026-07');
    expect(addMonths('2026-06', -1)).toBe('2026-05');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2027-01', -1)).toBe('2026-12');
    expect(addMonths('2026-06', 12)).toBe('2027-06');
    expect(addMonths('2026-10', 0)).toBe('2026-10');
  });
});

describe('monthWithin', () => {
  it('keeps a month that has a day that can be proposed, the first and the last too', () => {
    const eligible: DaySpan = { first: '2026-06-15', last: '2027-06-15' };

    expect(monthWithin('2026-06', eligible)).toBe('2026-06');
    expect(monthWithin('2026-12', eligible)).toBe('2026-12');
    expect(monthWithin('2027-06', eligible)).toBe('2027-06');
  });

  it('gives the first month for an earlier one and the last month for a later one', () => {
    const eligible: DaySpan = { first: '2026-06-15', last: '2027-06-15' };

    expect(monthWithin('2026-05', eligible)).toBe('2026-06');
    expect(monthWithin('2025-12', eligible)).toBe('2026-06');
    expect(monthWithin('2027-07', eligible)).toBe('2027-06');
    expect(monthWithin('2028-01', eligible)).toBe('2027-06');
  });
});

describe('movedDay', () => {
  it('moves by days, across weeks, months and years', () => {
    expect(movedDay('2026-06-20', { days: 1 }, june)).toBe('2026-06-21');
    expect(movedDay('2026-06-20', { days: -1 }, june)).toBe('2026-06-19');
    expect(movedDay('2026-06-29', { days: 7 }, june)).toBe('2026-07-06');
    expect(movedDay('2026-07-03', { days: -7 }, june)).toBe('2026-06-26');
    expect(movedDay('2026-12-31', { days: 1 }, june)).toBe('2027-01-01');
  });

  it('moves by months to the same day', () => {
    expect(movedDay('2026-06-20', { months: 1 }, june)).toBe('2026-07-20');
    expect(movedDay('2026-07-20', { months: -1 }, june)).toBe('2026-06-20');
    expect(movedDay('2026-12-20', { months: 1 }, june)).toBe('2027-01-20');
    expect(movedDay('2026-07-05', { months: 1 }, june)).toBe('2026-08-05');
  });

  it('stops at the last day of a shorter month', () => {
    expect(movedDay('2026-08-31', { months: 1 }, june)).toBe('2026-09-30');
    expect(movedDay('2027-03-30', { months: -1 }, june)).toBe('2027-02-28');
  });

  it('never leaves the eligible days', () => {
    expect(movedDay('2026-06-17', { days: -7 }, june)).toBe('2026-06-15');
    expect(movedDay('2026-06-15', { days: -1 }, june)).toBe('2026-06-15');
    expect(movedDay('2026-07-10', { months: -1 }, june)).toBe('2026-06-15');
    expect(movedDay('2027-06-12', { days: 7 }, june)).toBe('2027-06-15');
    expect(movedDay('2027-06-15', { days: 1 }, june)).toBe('2027-06-15');
    expect(movedDay('2027-05-20', { months: 1 }, june)).toBe('2027-06-15');
  });
});

describe('monthGrid with ranges', () => {
  const eligible: DaySpan = { first: '2026-06-15', last: '2027-06-15' };

  function selectionOf(...drags: [string, string][]): DateSelection {
    return drags.reduce(
      (selection, [from, to]) => dragDays(selection, from, to)?.result ?? selection,
      NO_DATES,
    );
  }

  function dayOf(grid: ReturnType<typeof monthGrid>, date: string) {
    const found = grid.days.find((day) => day.date === date);
    if (!found) throw new Error(`No day ${date}`);
    return found;
  }

  it('draws a range as one band: its ends joined to the days between them', () => {
    const selection = selectionOf(['2026-06-16', '2026-06-18']);
    const grid = monthGrid('2026-06', eligible, selection);

    const band = ['2026-06-16', '2026-06-17', '2026-06-18'].map((date) => dayOf(grid, date));
    expect(band.map(({ state }) => state)).toEqual(['range', 'range', 'range']);
    expect(band.map(({ range }) => range)).toEqual(
      Array.from({ length: 3 }, () => selection.ranges[0]),
    );
    expect(
      band.map(({ joinsPrevious, joinsNext, middle }) => [joinsPrevious, joinsNext, middle]),
    ).toEqual([
      [false, true, false],
      [true, true, true],
      [true, false, false],
    ]);
    expect(dayOf(grid, '2026-06-19')).toMatchObject({
      state: 'free',
      range: null,
      joinsPrevious: false,
    });
  });

  it('keeps two ranges that touch as two bands', () => {
    const grid = monthGrid(
      '2026-06',
      eligible,
      selectionOf(['2026-06-16', '2026-06-17'], ['2026-06-18', '2026-06-19']),
    );

    expect(dayOf(grid, '2026-06-17')).toMatchObject({ joinsPrevious: true, joinsNext: false });
    expect(dayOf(grid, '2026-06-18')).toMatchObject({ joinsPrevious: false, joinsNext: true });
  });

  it('cuts a range where it wraps to the next row and where the month ends', () => {
    // Sunday 21 June ends a row; the range goes on into July.
    const selection = selectionOf(['2026-06-20', '2026-06-22'], ['2026-06-29', '2026-07-02']);
    const june = monthGrid('2026-06', eligible, selection);
    const july = monthGrid('2026-07', eligible, selection);

    expect(dayOf(june, '2026-06-21')).toMatchObject({
      joinsPrevious: true,
      cutAfter: true,
      middle: true,
    });
    expect(dayOf(june, '2026-06-22')).toMatchObject({
      cutBefore: true,
      joinsNext: false,
      middle: false,
    });
    expect(dayOf(june, '2026-06-30')).toMatchObject({
      state: 'range',
      joinsPrevious: true,
      cutAfter: true,
    });
    expect(dayOf(july, '2026-07-01')).toMatchObject({
      state: 'range',
      cutBefore: true,
      joinsNext: true,
    });
  });

  it('never joins the dates marked one by one, even in a row', () => {
    const selection = pressDay(pressDay(NO_DATES, '2026-06-16'), '2026-06-17');
    const grid = monthGrid('2026-06', eligible, selection);

    expect(dayOf(grid, '2026-06-16')).toMatchObject({
      state: 'single',
      range: null,
      joinsNext: false,
    });
    expect(dayOf(grid, '2026-06-17')).toMatchObject({ state: 'single', joinsPrevious: false });
  });

  it('does not draw a range on a day that cannot be pressed', () => {
    // Marked before midnight: the 15th is no longer eligible.
    const selection = selectionOf(['2026-06-15', '2026-06-17']);
    const grid = monthGrid('2026-06', { first: '2026-06-16', last: '2027-06-16' }, selection);

    expect(dayOf(grid, '2026-06-15')).toMatchObject({
      state: 'off',
      range: null,
      joinsNext: false,
      drag: null,
    });
  });

  it('draws no drag without one', () => {
    const grid = monthGrid('2026-06', eligible, selectionOf(['2026-06-16', '2026-06-18']));

    expect(new Set(grid.days.map(({ drag }) => drag))).toEqual(new Set([null]));
  });

  it('draws a drag from the day it is made from to the day it reaches, in either direction', () => {
    const forward = monthGrid(
      '2026-06',
      eligible,
      NO_DATES,
      dragDays(NO_DATES, '2026-06-16', '2026-06-19'),
    );
    const backward = monthGrid(
      '2026-06',
      eligible,
      NO_DATES,
      dragDays(NO_DATES, '2026-06-19', '2026-06-16'),
    );
    const parts = (grid: ReturnType<typeof monthGrid>) =>
      ['15', '16', '17', '18', '19', '20'].map((day) => dayOf(grid, `2026-06-${day}`).drag);

    expect(parts(forward)).toEqual([null, 'anchor', 'way', 'way', 'reached', null]);
    expect(parts(backward)).toEqual([null, 'reached', 'way', 'way', 'anchor', null]);
    // Nothing is marked until the drag is released.
    expect(dayOf(forward, '2026-06-17')).toMatchObject({
      state: 'free',
      range: null,
      joinsNext: false,
    });
  });

  it('draws a drag of one day as the day it is made from', () => {
    const grid = monthGrid(
      '2026-06',
      eligible,
      NO_DATES,
      dragDays(NO_DATES, '2026-06-16', '2026-06-16'),
    );

    expect(dayOf(grid, '2026-06-16').drag).toBe('anchor');
  });

  it('keeps a date of its own marked on the way of a drag', () => {
    const selection = pressDay(NO_DATES, '2026-06-17');
    const grid = monthGrid(
      '2026-06',
      eligible,
      selection,
      dragDays(selection, '2026-06-16', '2026-06-18'),
    );

    expect(dayOf(grid, '2026-06-17')).toMatchObject({ state: 'single', drag: 'way' });
  });

  it('draws a range dragged by an end as the drag from its other end, the days it leaves free', () => {
    const selection = selectionOf(['2026-06-16', '2026-06-20'], ['2026-06-23', '2026-06-24']);
    const grid = monthGrid(
      '2026-06',
      eligible,
      selection,
      dragDays(selection, '2026-06-20', '2026-06-18'),
    );

    expect(dayOf(grid, '2026-06-16')).toMatchObject({ state: 'free', drag: 'anchor', range: null });
    expect(dayOf(grid, '2026-06-17')).toMatchObject({
      state: 'free',
      drag: 'way',
      joinsPrevious: false,
    });
    expect(dayOf(grid, '2026-06-18')).toMatchObject({ state: 'free', drag: 'reached' });
    expect(dayOf(grid, '2026-06-19')).toMatchObject({ state: 'free', drag: null, range: null });
    expect(dayOf(grid, '2026-06-20')).toMatchObject({
      state: 'free',
      drag: null,
      joinsPrevious: false,
    });
    // The other range stays as it is.
    expect(dayOf(grid, '2026-06-23')).toMatchObject({
      state: 'range',
      drag: null,
      joinsNext: true,
    });
  });
});

describe('monthGrid with saved ranges', () => {
  const eligible: DaySpan = { first: '2026-06-15', last: '2027-06-15' };
  const week = { start: '2026-06-22', end: '2026-06-26' };

  /** The parts of the days of June in a strip, by their number: "<" goes on before, ">" after. */
  function parts(
    grid: ReturnType<typeof monthGrid>,
    strip: 'saved' | 'viewed',
  ): Record<number, string> {
    return Object.fromEntries(
      grid.days.flatMap((day) => {
        const part = day[strip];
        return part ? [[day.day, `${part.before ? '<' : ''}${part.after ? '>' : ''}`]] : [];
      }),
    );
  }

  it('draws a band along the days of a saved range, from its first day to its last', () => {
    const grid = monthGrid('2026-06', eligible, { ...NO_DATES, saved: [week] });

    expect(parts(grid, 'saved')).toEqual({ 22: '>', 23: '<>', 24: '<>', 25: '<>', 26: '<' });
    expect(grid.days.every(({ state }) => state === 'off' || state === 'free')).toBe(true);
  });

  it('has no band without saved ranges', () => {
    expect(parts(monthGrid('2026-06', eligible, NO_DATES), 'saved')).toEqual({});
  });

  it('leaves the band off the marked days: it ends next to them', () => {
    const selection: DateSelection = {
      singles: ['2026-06-23'],
      ranges: [{ start: '2026-06-26', end: '2026-06-28' }],
      saved: [week],
    };

    expect(parts(monthGrid('2026-06', eligible, selection), 'saved')).toEqual({
      22: '',
      24: '>',
      25: '<',
    });
  });

  it('draws saved ranges that share days or meet as one band', () => {
    const selection: DateSelection = {
      ...NO_DATES,
      saved: [
        { start: '2026-06-16', end: '2026-06-18' },
        { start: '2026-06-18', end: '2026-06-19' },
        { start: '2026-06-20', end: '2026-06-21' },
      ],
    };

    expect(parts(monthGrid('2026-06', eligible, selection), 'saved')).toEqual({
      16: '>',
      17: '<>',
      18: '<>',
      19: '<>',
      20: '<>',
      21: '<',
    });
  });

  it('goes on with the band into the next month', () => {
    const selection: DateSelection = {
      ...NO_DATES,
      saved: [{ start: '2026-06-29', end: '2026-07-02' }],
    };

    expect(parts(monthGrid('2026-06', eligible, selection), 'saved')).toEqual({
      29: '>',
      30: '<>',
    });
    expect(parts(monthGrid('2026-07', eligible, selection), 'saved')).toEqual({ 1: '<>', 2: '<' });
  });

  it('leaves the band off the days of a drag going on, and of the range it would leave', () => {
    const selection: DateSelection = {
      singles: [],
      ranges: [{ start: '2026-06-26', end: '2026-06-28' }],
      saved: [week],
    };
    // The range 26–28 is dragged from its first day back to the 24th: 24–28.
    const drag = dragDays(selection, '2026-06-26', '2026-06-24');

    expect(parts(monthGrid('2026-06', eligible, selection, drag), 'saved')).toEqual({
      22: '>',
      23: '<',
    });
  });

  it('leaves the band off a day held for a range, and off nothing else', () => {
    const selection: DateSelection = { ...NO_DATES, saved: [week] };
    const held = dragDays(selection, '2026-06-22', '2026-06-22');

    expect(parts(monthGrid('2026-06', eligible, selection, held), 'saved')).toEqual({
      23: '>',
      24: '<>',
      25: '<>',
      26: '<',
    });
  });

  it('marks the days of the saved range looked at, whatever is marked on them', () => {
    const selection: DateSelection = {
      singles: ['2026-06-23'],
      ranges: [{ start: '2026-06-26', end: '2026-06-28' }],
      saved: [week],
    };
    const grid = monthGrid('2026-06', eligible, selection, null, week);

    expect(parts(grid, 'viewed')).toEqual({ 22: '>', 23: '<>', 24: '<>', 25: '<>', 26: '<' });
    expect(parts(monthGrid('2026-06', eligible, selection), 'viewed')).toEqual({});
  });

  it('marks the range looked at across two months, and under a drag too', () => {
    const across = { start: '2026-06-29', end: '2026-07-02' };
    const selection: DateSelection = { ...NO_DATES, saved: [across] };
    const drag = dragDays(selection, '2026-06-30', '2026-06-30');

    expect(parts(monthGrid('2026-06', eligible, selection, drag, across), 'viewed')).toEqual({
      29: '>',
      30: '<>',
    });
    expect(parts(monthGrid('2026-07', eligible, selection, null, across), 'viewed')).toEqual({
      1: '<>',
      2: '<',
    });
  });

  it('marks the days that cannot be chosen when the range looked at holds them', () => {
    const grid = monthGrid('2026-06', eligible, NO_DATES, null, {
      start: '2026-06-13',
      end: '2026-06-15',
    });

    expect(parts(grid, 'viewed')).toEqual({ 13: '>', 14: '<>', 15: '<' });
    expect(parts(grid, 'saved')).toEqual({});
  });
});
