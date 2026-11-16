import { NO_DATES, pressDay } from './date-selection';
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
