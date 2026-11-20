import type { DateSelection } from './date-selection';
import { type DayTimes, NO_TIMES } from './day-times';

/** What a column is of, before it is known whether it is on screen. */
type Column =
  | { readonly kind: 'day'; readonly date: string; readonly times: DayTimes }
  | { readonly kind: 'range'; readonly start: string; readonly end: string };

/**
 * A column of the times step: a date of its own with its times, marked and saved; or a range of
 * days, marked or saved, which has no times. Each says whether it is one of the columns on screen.
 */
export type TimeColumn = Column & { readonly onScreen: boolean };

/**
 * A column the summary sends back to the times step to be corrected alone: its date, and the
 * place of the first column the summary had on screen, which the times step keeps.
 */
export interface ColumnEdit {
  /** The date of its own whose times are corrected. */
  readonly date: string;
  /** The place of the first column on screen among them all, from 0. */
  readonly first: number;
}

/** The columns of the times step, and which of them are on screen. */
export interface ColumnWindow {
  /** Every column, in order. */
  readonly columns: readonly TimeColumn[];
  /** The years of the days of the columns on screen, in order. */
  readonly years: readonly string[];
  /** The place of the first column on screen among them all, from 0. */
  readonly first: number;
  /** How many places the first column on screen can take: 1 when every column fits. */
  readonly places: number;
}

/**
 * The columns of the times step, the `visible` ones from the one at `first` on screen. The
 * columns are one for each date of its own, each range and each saved range, by first day; on
 * the same day, the date of its own and then the ranges from the shortest. The screen is never
 * left with room after the last column: a `first` too far puts the last columns on screen, and
 * gives the place they start at.
 */
export function columnWindow(
  selection: DateSelection,
  first: number,
  visible: number,
): ColumnWindow {
  const days = selection.singles.map((date): Column => ({
    kind: 'day',
    date,
    times: selection.times[date] ?? NO_TIMES,
  }));
  const ranges = [...selection.ranges, ...selection.saved].map(({ start, end }): Column => ({
    kind: 'range',
    start,
    end,
  }));
  const all = [...days, ...ranges].sort(
    (a, b) => firstDay(a).localeCompare(firstDay(b)) || lastDay(a).localeCompare(lastDay(b)),
  );
  const places = Math.max(all.length - visible, 0) + 1;
  const from = Math.min(Math.max(first, 0), places - 1);
  const columns = all.map((column, place): TimeColumn => ({
    ...column,
    onScreen: place >= from && place < from + visible,
  }));
  const years = columns
    .filter((column) => column.onScreen)
    .flatMap((column) => [firstDay(column), lastDay(column)])
    .map(yearOf);
  return { columns, years: [...new Set(years)], first: from, places };
}

function firstDay(column: Column): string {
  return column.kind === 'day' ? column.date : column.start;
}

function lastDay(column: Column): string {
  return column.kind === 'day' ? column.date : column.end;
}

function yearOf(date: string): string {
  return date.slice(0, 4);
}
