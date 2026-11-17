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

/** The columns of the times step that are on screen, out of them all. */
export interface ColumnWindow {
  /** The columns on screen, in order. */
  readonly columns: readonly TimeColumn[];
  /** The years of their days, in order. */
  readonly years: readonly string[];
  /** The place of the first column on screen among them all, from 0. */
  readonly first: number;
  /** How many places the first column on screen can take: 1 when every column fits. */
  readonly places: number;
}

/**
 * The `visible` columns of the times step from the one at `first`. The columns are one for each
 * date of its own, each range and each saved range, by first day; on the same day, the date of
 * its own and then the ranges from the shortest. The screen is never left with room after the
 * last column: a `first` too far gives the last columns, and the place they start at.
 */
export function columnWindow(
  selection: DateSelection,
  first: number,
  visible: number,
): ColumnWindow {
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
  const all = [...days, ...ranges].sort(
    (a, b) => firstDay(a).localeCompare(firstDay(b)) || lastDay(a).localeCompare(lastDay(b)),
  );
  const places = Math.max(all.length - visible, 0) + 1;
  const from = Math.min(Math.max(first, 0), places - 1);
  const columns = all.slice(from, from + visible);
  const years = columns.flatMap((column) => [firstDay(column), lastDay(column)]).map(yearOf);
  return { columns, years: [...new Set(years)], first: from, places };
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
