import { type DateSelection, NO_DATES, withTimes } from './date-selection';
import type { DayTime } from './day-times';
import { timeColumnPages } from './time-columns';

const at = (...times: string[]): DayTime[] => times.map((time) => ({ kind: 'single', at: time }));
const hours = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);

describe('the columns of the times step', () => {
  it('are one for each date of its own, with its times', () => {
    const selection = withTimes(
      { ...NO_DATES, singles: ['2026-06-20', '2026-06-21'], timed: true },
      '2026-06-21',
      at('18:00'),
    );

    expect(timeColumnPages(selection, 4)).toEqual([
      {
        columns: [
          { kind: 'day', date: '2026-06-20', times: [], full: false },
          { kind: 'day', date: '2026-06-21', times: at('18:00'), full: false },
        ],
        years: ['2026'],
      },
    ]);
  });

  it('are one for each range and saved range too, all by first day', () => {
    const selection: DateSelection = {
      ...NO_DATES,
      singles: ['2026-06-25', '2026-06-20'].sort(),
      ranges: [{ start: '2026-06-22', end: '2026-06-23' }],
      saved: [{ start: '2026-06-18', end: '2026-06-19' }],
    };

    expect(timeColumnPages(selection, 4)[0]?.columns).toEqual([
      { kind: 'range', start: '2026-06-18', end: '2026-06-19' },
      { kind: 'day', date: '2026-06-20', times: [], full: false },
      { kind: 'range', start: '2026-06-22', end: '2026-06-23' },
      { kind: 'day', date: '2026-06-25', times: [], full: false },
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

    expect(timeColumnPages(selection, 4)[0]?.columns).toEqual([
      { kind: 'day', date: '2026-06-20', times: [], full: false },
      { kind: 'range', start: '2026-06-20', end: '2026-06-22' },
      { kind: 'range', start: '2026-06-20', end: '2026-06-25' },
      { kind: 'range', start: '2026-06-20', end: '2026-06-28' },
    ]);
  });

  it('come in pages of as many as fit, the last with the rest', () => {
    const singles = ['20', '21', '22', '23', '24', '25', '26'].map((day) => `2026-06-${day}`);
    const selection: DateSelection = { ...NO_DATES, singles };
    const dates = (perPage: number): (string | undefined)[][] =>
      timeColumnPages(selection, perPage).map((page) =>
        page.columns.map((column) => (column.kind === 'day' ? column.date.slice(8) : undefined)),
      );

    expect(dates(3)).toEqual([['20', '21', '22'], ['23', '24', '25'], ['26']]);
    expect(dates(4)).toEqual([
      ['20', '21', '22', '23'],
      ['24', '25', '26'],
    ]);
    expect(dates(7)).toEqual([['20', '21', '22', '23', '24', '25', '26']]);
  });

  it('are none without dates', () => {
    expect(timeColumnPages(NO_DATES, 4)).toEqual([]);
  });

  it('name every year of a page: a range counts for both its ends', () => {
    const selection: DateSelection = {
      ...NO_DATES,
      singles: ['2026-12-30', '2027-01-02', '2027-01-03'],
      ranges: [{ start: '2026-12-31', end: '2027-01-01' }],
    };
    const years = (perPage: number): (readonly string[])[] =>
      timeColumnPages(selection, perPage).map((page) => page.years);

    expect(years(4)).toEqual([['2026', '2027']]);
    expect(years(2)).toEqual([['2026', '2027'], ['2027']]);
    expect(years(1)).toEqual([['2026'], ['2026', '2027'], ['2027'], ['2027']]);
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
      timeColumnPages(selection, 4)[0]?.columns.map(
        (column) => column.kind === 'day' && column.full,
      ) ?? [];

    expect(full(almost)).toEqual([false, false, false, false]);
    // The date without times takes its first, which adds no option.
    expect(full(sixty)).toEqual([true, true, true, false]);
  });
});
