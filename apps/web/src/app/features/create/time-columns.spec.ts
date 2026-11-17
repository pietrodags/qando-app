import { type DateSelection, NO_DATES, withTimes } from './date-selection';
import type { DayTime } from './day-times';
import { columnWindow } from './time-columns';

const at = (...times: string[]): DayTime[] => times.map((time) => ({ kind: 'single', at: time }));
const hours = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);

describe('the columns of the times step', () => {
  it('are one for each date of its own, with its times', () => {
    const selection = withTimes(
      { ...NO_DATES, singles: ['2026-06-20', '2026-06-21'], timed: true },
      '2026-06-21',
      at('18:00'),
    );

    expect(columnWindow(selection, 0, 4)).toEqual({
      columns: [
        { kind: 'day', date: '2026-06-20', times: [], full: false, onScreen: true },
        { kind: 'day', date: '2026-06-21', times: at('18:00'), full: false, onScreen: true },
      ],
      years: ['2026'],
      first: 0,
      places: 1,
    });
  });

  it('are one for each range and saved range too, all by first day', () => {
    const selection: DateSelection = {
      ...NO_DATES,
      singles: ['2026-06-25', '2026-06-20'].sort(),
      ranges: [{ start: '2026-06-22', end: '2026-06-23' }],
      saved: [{ start: '2026-06-18', end: '2026-06-19' }],
    };

    expect(columnWindow(selection, 0, 4).columns).toEqual([
      { kind: 'range', start: '2026-06-18', end: '2026-06-19', onScreen: true },
      { kind: 'day', date: '2026-06-20', times: [], full: false, onScreen: true },
      { kind: 'range', start: '2026-06-22', end: '2026-06-23', onScreen: true },
      { kind: 'day', date: '2026-06-25', times: [], full: false, onScreen: true },
    ]);
  });

  it('put a day before the ranges that start on it, the shortest range first', () => {
    const selection: DateSelection = {
      ...NO_DATES,
      singles: ['2026-06-20'],
      ranges: [{ start: '2026-06-20', end: '2026-06-25' }],
      saved: [
        { start: '2026-06-20', end: '2026-06-22' },
        { start: '2026-06-20', end: '2026-06-28' },
      ],
    };

    expect(columnWindow(selection, 0, 4).columns).toEqual([
      { kind: 'day', date: '2026-06-20', times: [], full: false, onScreen: true },
      { kind: 'range', start: '2026-06-20', end: '2026-06-22', onScreen: true },
      { kind: 'range', start: '2026-06-20', end: '2026-06-25', onScreen: true },
      { kind: 'range', start: '2026-06-20', end: '2026-06-28', onScreen: true },
    ]);
  });

  describe('on screen', () => {
    const singles = ['20', '21', '22', '23', '24', '25', '26'].map((day) => `2026-06-${day}`);
    const week: DateSelection = { ...NO_DATES, singles };
    /** The days of the columns on screen. */
    const days = (first: number, visible: number): string[] =>
      columnWindow(week, first, visible)
        .columns.filter((column) => column.onScreen)
        .map((column) => (column.kind === 'day' ? column.date.slice(8) : ''));

    it('are told from the ones off screen, which are given too, all in order', () => {
      const columns = columnWindow(week, 2, 3).columns;

      expect(columns.map((column) => column.kind === 'day' && column.date)).toEqual(singles);
      expect(columns.map((column) => column.onScreen)).toEqual([
        false,
        false,
        true,
        true,
        true,
        false,
        false,
      ]);
    });

    it('are as many as fit, from the first one asked for', () => {
      expect(days(0, 3)).toEqual(['20', '21', '22']);
      expect(days(1, 3)).toEqual(['21', '22', '23']);
      expect(days(2, 4)).toEqual(['22', '23', '24', '25']);
      expect(columnWindow(week, 2, 4).first).toBe(2);
    });

    it('take as many places as leave the screen full: one more than the columns left over', () => {
      expect(columnWindow(week, 0, 3).places).toBe(5);
      expect(columnWindow(week, 0, 4).places).toBe(4);
      expect(columnWindow(week, 0, 6).places).toBe(2);
    });

    it('never leave room after the last column: a first one too far is the last place', () => {
      expect(days(4, 3)).toEqual(['24', '25', '26']);
      expect(days(5, 3)).toEqual(['24', '25', '26']);
      expect(columnWindow(week, 5, 3).first).toBe(4);
      expect(days(9, 4)).toEqual(['23', '24', '25', '26']);
      expect(columnWindow(week, 9, 4).first).toBe(3);
    });

    it('start at the first column when asked for one before it', () => {
      expect(days(-1, 3)).toEqual(['20', '21', '22']);
      expect(columnWindow(week, -1, 3).first).toBe(0);
    });

    it('are all of them, in a single place, when they fit', () => {
      expect(days(0, 7)).toEqual(['20', '21', '22', '23', '24', '25', '26']);
      expect(columnWindow(week, 0, 7).places).toBe(1);
      expect(days(3, 9)).toEqual(['20', '21', '22', '23', '24', '25', '26']);
      expect(columnWindow(week, 3, 9)).toMatchObject({ first: 0, places: 1 });
    });
  });

  it('are none without dates', () => {
    expect(columnWindow(NO_DATES, 0, 4)).toEqual({ columns: [], years: [], first: 0, places: 1 });
  });

  it('name every year of the days on screen: a range counts for both its ends', () => {
    const selection: DateSelection = {
      ...NO_DATES,
      singles: ['2026-12-30', '2027-01-02', '2027-01-03'],
      ranges: [{ start: '2026-12-31', end: '2027-01-01' }],
    };
    const years = (first: number, visible: number): readonly string[] =>
      columnWindow(selection, first, visible).years;

    expect(years(0, 4)).toEqual(['2026', '2027']);
    expect(years(0, 1)).toEqual(['2026']);
    expect(years(1, 1)).toEqual(['2026', '2027']);
    expect(years(1, 2)).toEqual(['2026', '2027']);
    expect(years(2, 2)).toEqual(['2027']);
  });

  it('say that a day with a time takes no more once the event is full', () => {
    const dates = ['2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23'];
    const start: DateSelection = { ...NO_DATES, singles: dates, timed: true };
    const two = dates
      .slice(0, 2)
      .reduce((selection, date) => withTimes(selection, date, at(...hours)), start);
    // 24 + 24 + 10 + the date without times: 59 options, and with one more time 60.
    const almost = withTimes(two, '2026-06-22', at(...hours.slice(0, 10)));
    const sixty = withTimes(two, '2026-06-22', at(...hours.slice(0, 11)));
    const full = (selection: DateSelection): (boolean | undefined)[] =>
      columnWindow(selection, 0, 4).columns.map((column) => column.kind === 'day' && column.full);

    expect(full(almost)).toEqual([false, false, false, false]);
    // The date without times takes its first, which adds no option.
    expect(full(sixty)).toEqual([true, true, true, false]);
  });
});
