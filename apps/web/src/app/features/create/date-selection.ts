import { MAX_OPTIONS } from '@qando/domain';
import { daysFrom } from './days-from';

/** Days in a row proposed as one option: two at least, both ends included. */
export interface DateRange {
  readonly start: string;
  readonly end: string;
}

/**
 * The dates the organizer has chosen on the wizard's calendar. Every date is a calendar value as
 * `YYYY-MM-DD`. No day is marked twice: not in two ranges, nor in a range and on its own. A saved
 * range is no longer marked: its days are free again, to be marked as other options. Each date of
 * its own, each range and each saved range is one option of the event, which takes `MAX_OPTIONS`
 * at most: a press or a drag never leaves more.
 */
export interface DateSelection {
  /** The days marked one by one, each an option of its own even next to another; in order. */
  readonly singles: readonly string[];
  /** The ranges, each one option, in order; two that touch stay two. */
  readonly ranges: readonly DateRange[];
  /**
   * The ranges saved from the calendar, each one option; by first day, then by last day, and no
   * two alike. They can share days with each other and with the marked dates.
   */
  readonly saved: readonly DateRange[];
}

/** A drag over the calendar: the days it joins, and the dates it leaves once released. */
export interface Drag {
  /**
   * The day the drag is made from, one of its two ends: the day pressed, or the other end of the
   * range when the day pressed is an end of one.
   */
  readonly anchor: string;
  readonly first: string;
  readonly last: string;
  readonly result: DateSelection;
}

export const NO_DATES: DateSelection = { singles: [], ranges: [], saved: [] };

/**
 * A press on a day: a free day becomes a date of its own, a marked day is free again, and any day
 * of a range removes the whole range. With every option taken a free day stays free: the same
 * selection.
 */
export function pressDay(selection: DateSelection, date: string): DateSelection {
  const range = rangeOn(selection, date);
  if (range) return { ...selection, ranges: selection.ranges.filter((other) => other !== range) };
  if (selection.singles.includes(date)) {
    return { ...selection, singles: selection.singles.filter((single) => single !== date) };
  }
  if (optionCount(selection) >= MAX_OPTIONS) return selection;
  return { ...selection, singles: [...selection.singles, date].sort() };
}

/**
 * A drag from the day pressed to another day (or back to itself), in either direction: its days
 * become one range, taking in the dates of their own on the way and stopping at the day next to
 * another range. A drag of one day is a date of its own. From the first or the last day of a
 * range the drag moves that end, the other end staying; from a day between them it does nothing
 * (`null`), as does a drag that would leave more options than an event takes.
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
      ? { ...selection, singles: [...singles, first].sort(), ranges: others }
      : {
          ...selection,
          singles,
          ranges: [...others, { start: first, end: last }].sort((a, b) =>
            a.start.localeCompare(b.start),
          ),
        };
  return optionCount(result) > MAX_OPTIONS ? null : { anchor, first, last, result };
}

/**
 * A day held as the first of a range whose last day is still to be chosen: the drag of that one
 * day, which left there is a date of its own. With every option taken a free day is held all the
 * same, for a range that takes in dates of their own, and left there it stays free: the same
 * selection. A day between the ends of a range holds nothing (`null`).
 */
export function holdDay(selection: DateSelection, date: string): Drag | null {
  const drag = dragDays(selection, date, date);
  if (drag || rangeOn(selection, date)) return drag;
  return { anchor: date, first: date, last: date, result: selection };
}

/**
 * A range of the calendar is saved: it is no longer marked and is one of the saved ranges. The
 * same selection when the range is not on the calendar, or one like it is saved already.
 */
export function saveRange(selection: DateSelection, range: DateRange): DateSelection {
  const ranges = selection.ranges.filter((other) => !alike(other, range));
  if (ranges.length === selection.ranges.length || isSaved(selection, range)) return selection;
  const saved = [...selection.saved, range].sort(
    (a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
  );
  return { ...selection, ranges, saved };
}

/** A range from the same first day to the same last day is saved. */
export function isSaved(selection: DateSelection, range: DateRange): boolean {
  return selection.saved.some((other) => alike(other, range));
}

/** The selection without a saved range; what is marked on its days stays. */
export function removeSaved(selection: DateSelection, range: DateRange): DateSelection {
  return { ...selection, saved: selection.saved.filter((other) => !alike(other, range)) };
}

/** The options the dates amount to: each date of its own, each range and each saved range. */
export function optionCount(selection: DateSelection): number {
  return selection.singles.length + selection.ranges.length + selection.saved.length;
}

/** Some date is marked or some range saved: the event has at least one option. */
export function hasDates(selection: DateSelection): boolean {
  return optionCount(selection) > 0;
}

/**
 * The selection without the dates before `day`: the days of their own before it, and every range
 * that starts before it, marked or saved, whole. The same selection when it has none.
 */
export function withoutDatesBefore(selection: DateSelection, day: string): DateSelection {
  const singles = selection.singles.filter((single) => single >= day);
  const ranges = selection.ranges.filter((range) => range.start >= day);
  const saved = selection.saved.filter((range) => range.start >= day);
  const same =
    singles.length === selection.singles.length &&
    ranges.length === selection.ranges.length &&
    saved.length === selection.saved.length;
  return same ? selection : { singles, ranges, saved };
}

/** The range a day is in, if any. */
export function rangeOn(selection: DateSelection, date: string): DateRange | undefined {
  return selection.ranges.find((range) => range.start <= date && date <= range.end);
}

function alike(a: DateRange, b: DateRange): boolean {
  return a.start === b.start && a.end === b.end;
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
