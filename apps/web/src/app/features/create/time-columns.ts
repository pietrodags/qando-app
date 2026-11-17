import { type DateSelection, isFull } from './date-selection';
import type { DayTime } from './day-times';

/**
 * A column of the times step: a date of its own with its times, and whether it takes no more
 * (the event is full and a further time would be one more option); or a range of days, marked or
 * saved, which has no times.
 */
export type TimeColumn =
  | {
      readonly kind: 'day';
      readonly date: string;
      readonly times: readonly DayTime[];
      readonly full: boolean;
    }
  | { readonly kind: 'range'; readonly start: string; readonly end: string };

/** The columns on screen at a time, and the years of their days, in order. */
export interface TimeColumnPage {
  readonly columns: readonly TimeColumn[];
  readonly years: readonly string[];
}

/**
 * The columns of the times step, in pages of `perPage`: one for each date of its own, each range
 * and each saved range, by first day; on the same day, the date of its own and then the ranges
 * from the shortest.
 */
export function timeColumnPages(
  selection: DateSelection,
  perPage: number,
): readonly TimeColumnPage[] {
  const full = isFull(selection);
  const days = selection.singles.map((date): TimeColumn => {
    const times = selection.times[date] ?? [];
    return { kind: 'day', date, times, full: full && times.length > 0 };
  });
  const ranges = [...selection.ranges, ...selection.saved].map(({ start, end }): TimeColumn => ({
    kind: 'range',
    start,
    end,
  }));
  const columns = [...days, ...ranges].sort(
    (a, b) => firstDay(a).localeCompare(firstDay(b)) || lastDay(a).localeCompare(lastDay(b)),
  );
  const pages: TimeColumnPage[] = [];
  for (let from = 0; from < columns.length; from += perPage) {
    const page = columns.slice(from, from + perPage);
    const years = page.flatMap((column) => [firstDay(column), lastDay(column)]).map(yearOf);
    pages.push({ columns: page, years: [...new Set(years)] });
  }
  return pages;
}

function firstDay(column: TimeColumn): string {
  return column.kind === 'day' ? column.date : column.start;
}

function lastDay(column: TimeColumn): string {
  return column.kind === 'day' ? column.date : column.end;
}

function yearOf(date: string): string {
  return date.slice(0, 4);
}
