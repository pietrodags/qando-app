import type { DateSelection } from './date-selection';
import { daysFrom } from './days-from';

/** The days the organizer can propose, both included, as `YYYY-MM-DD`. */
export interface DaySpan {
  readonly first: string;
  readonly last: string;
}

/** One day of the month on screen. */
export interface GridDay {
  readonly date: string;
  readonly day: number;
  /**
   * `off`: not an eligible day, it cannot be pressed; `free`: nothing marked on it; `single`:
   * marked as a date of its own.
   */
  readonly state: 'off' | 'free' | 'single';
}

/** A month to draw: blanks for the weekdays before the 1st (Monday first), then every day. */
export interface MonthGrid {
  readonly leadingBlanks: number;
  readonly days: readonly GridDay[];
}

/** How far the keyboard moves from a day: so many days, or so many months to the same day. */
export type DayMove = { readonly days: number } | { readonly months: number };

/** The month (`YYYY-MM`) drawn with what is marked on it; only eligible days can be pressed. */
export function monthGrid(month: string, eligible: DaySpan, selection: DateSelection): MonthGrid {
  const first = `${month}-01`;
  const days = Array.from({ length: daysIn(month) }, (_, index): GridDay => {
    const date = daysFrom(first, index);
    return { date, day: index + 1, state: stateOf(date, eligible, selection) };
  });
  // getUTCDay counts from Sunday.
  return { leadingBlanks: (new Date(first).getUTCDay() + 6) % 7, days };
}

/** The month of a date, as `YYYY-MM`. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** The month so many months after `month` (before it, when negative). */
export function addMonths(month: string, months: number): string {
  const [year, monthOfYear] = month.split('-').map(Number) as [number, number];
  const moved = new Date(Date.UTC(year, monthOfYear - 1 + months, 1));
  return monthOf(moved.toISOString());
}

/**
 * The day the keyboard lands on from `date`: moved by days, or by months to the same day of the
 * month (its last day when the month is shorter), and never outside the eligible days.
 */
export function movedDay(date: string, move: DayMove, eligible: DaySpan): string {
  const moved = 'days' in move ? daysFrom(date, move.days) : sameDay(date, move.months);
  return within(moved, eligible.first, eligible.last);
}

/** `month`, or the nearest month with a day that can be proposed. */
export function monthWithin(month: string, eligible: DaySpan): string {
  return within(month, monthOf(eligible.first), monthOf(eligible.last));
}

/** `value`, or the limit it is beyond: dates and months as text sort by time. */
function within(value: string, first: string, last: string): string {
  if (value < first) return first;
  return value > last ? last : value;
}

function sameDay(date: string, months: number): string {
  const month = addMonths(monthOf(date), months);
  const day = Math.min(Number(date.slice(8)), daysIn(month));
  return `${month}-${String(day).padStart(2, '0')}`;
}

function stateOf(date: string, eligible: DaySpan, selection: DateSelection): GridDay['state'] {
  if (date < eligible.first || date > eligible.last) return 'off';
  return selection.singles.includes(date) ? 'single' : 'free';
}

function daysIn(month: string): number {
  // The day before the 1st of the next month is the last day of this one.
  return Number(daysFrom(`${addMonths(month, 1)}-01`, -1).slice(8));
}
