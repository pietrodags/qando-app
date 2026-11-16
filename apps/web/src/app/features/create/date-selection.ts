import { daysFrom } from './days-from';

/** Days in a row proposed as one option: two at least, both ends included. */
export interface DateRange {
  readonly start: string;
  readonly end: string;
}

/**
 * The dates the organizer has marked on the wizard's calendar. Every date is a calendar value as
 * `YYYY-MM-DD`. No day is marked twice: not in two ranges, nor in a range and on its own.
 */
export interface DateSelection {
  /** The days marked one by one, each an option of its own even next to another; in order. */
  readonly singles: readonly string[];
  /** The ranges, each one option, in order; two that touch stay two. */
  readonly ranges: readonly DateRange[];
}

/** A drag over the calendar: the days it joins, and the dates it leaves once released. */
export interface Drag {
  readonly first: string;
  readonly last: string;
  readonly result: DateSelection;
}

export const NO_DATES: DateSelection = { singles: [], ranges: [] };

/**
 * A press on a day: a free day becomes a date of its own, a marked day is free again, and any day
 * of a range removes the whole range.
 */
export function pressDay(selection: DateSelection, date: string): DateSelection {
  const range = rangeOn(selection, date);
  if (range) return { ...selection, ranges: selection.ranges.filter((other) => other !== range) };
  const singles = selection.singles.includes(date)
    ? selection.singles.filter((single) => single !== date)
    : [...selection.singles, date].sort();
  return { ...selection, singles };
}

/**
 * A drag from the day pressed to another day (or back to itself), in either direction: its days
 * become one range, taking in the dates of their own on the way and stopping at the day next to
 * another range. A drag of one day is a date of its own. From the first or the last day of a
 * range the drag moves that end, the other end staying; from a day between them it does nothing
 * (`null`).
 */
export function dragDays(selection: DateSelection, from: string, to: string): Drag | null {
  const held = rangeOn(selection, from);
  if (held && from !== held.start && from !== held.end) return null;
  // A range dragged from one end is made again from its other end.
  const anchor = !held ? from : from === held.start ? held.end : held.start;
  const others = selection.ranges.filter((range) => range !== held);
  const reached = reachedFrom(anchor, to, others);
  const [first, last] = reached < anchor ? [reached, anchor] : [anchor, reached];
  const singles = selection.singles.filter((single) => single < first || single > last);
  const result =
    first === last
      ? { singles: [...singles, first].sort(), ranges: others }
      : {
          singles,
          ranges: [...others, { start: first, end: last }].sort((a, b) =>
            a.start.localeCompare(b.start),
          ),
        };
  return { first, last, result };
}

/** Some date is marked: the event has at least one option. */
export function hasDates(selection: DateSelection): boolean {
  return selection.singles.length > 0 || selection.ranges.length > 0;
}

/** The selection without the dates before `day`; the same selection when it has none. */
export function withoutDatesBefore(selection: DateSelection, day: string): DateSelection {
  const singles = selection.singles.filter((single) => single >= day);
  return singles.length === selection.singles.length ? selection : { ...selection, singles };
}

/** The range a day is in, if any. */
function rangeOn(selection: DateSelection, date: string): DateRange | undefined {
  return selection.ranges.find((range) => range.start <= date && date <= range.end);
}

/**
 * How far a drag from `anchor` gets towards `to`: to it, or to the day next to the first range in
 * its way. The anchor is in none of the ranges, which come in order.
 */
function reachedFrom(anchor: string, to: string, ranges: readonly DateRange[]): string {
  if (to < anchor) {
    const before = ranges.filter((range) => range.end < anchor).at(-1);
    return before && before.end >= to ? daysFrom(before.end, 1) : to;
  }
  const after = ranges.find((range) => range.start > anchor);
  return after && after.start <= to ? daysFrom(after.start, -1) : to;
}
