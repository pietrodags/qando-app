import { MAX_OPTIONS, type ProposedOption } from '@qando/domain';
import { type DayTimes, NO_TIMES, optionsOf, timesOf, withTimeRead } from './day-times';
import { daysFrom } from './days-from';

/** Days in a row proposed as one option: two at least, both ends included. */
export interface DateRange {
  readonly start: string;
  readonly end: string;
}

/**
 * The dates the organizer has chosen on the wizard's calendar. Every date is a calendar value as
 * `YYYY-MM-DD`. No day is marked twice: not in two ranges, nor in a range and on its own. A saved
 * range is no longer marked: its days are free again, to be marked as other options, though not as
 * that same range again. Only a date of its own has times, and they go with it: unmarked, taken
 * into a range or cleared, it is left with none. Each date of its own, each range and each saved
 * range is one option of the event, and with times asked for a date of its own is one option per
 * different time, marked or saved. The event takes `MAX_OPTIONS` at most: a press or a drag never leaves more, nor two
 * options alike.
 */
export interface DateSelection {
  /** The days marked one by one, each an option of its own even next to another; in order. */
  readonly singles: readonly string[];
  /** The ranges, each one option, in order; two that touch stay two. */
  readonly ranges: readonly DateRange[];
  /**
   * The ranges saved from the calendar, each one option; by first day, then by last day, no two
   * alike and none like a marked range. They can share days with each other and with the marked
   * dates.
   */
  readonly saved: readonly DateRange[];
  /**
   * The times of the dates of their own, marked and saved, by date; a date without times has no
   * entry, and no date has times while they are not asked for.
   */
  readonly times: Readonly<Record<string, DayTimes>>;
  /** The organizer asked for times on the dates of their own. */
  readonly timed: boolean;
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
  /**
   * The saved range from the drag's first day to its last, when there is one: that range is an
   * option already, so the drag leaves the dates as they were. `null` for any other drag.
   */
  readonly alreadySaved: DateRange | null;
  readonly result: DateSelection;
}

export const NO_DATES: DateSelection = {
  singles: [],
  ranges: [],
  saved: [],
  times: {},
  timed: false,
};

/**
 * A press on a day: a free day becomes a date of its own, a marked day is free again, and any day
 * of a range removes the whole range. With every option taken a free day stays free: the same
 * selection.
 */
export function pressDay(selection: DateSelection, date: string): DateSelection {
  const range = rangeOn(selection, date);
  if (range) return { ...selection, ranges: selection.ranges.filter((other) => other !== range) };
  if (selection.singles.includes(date)) {
    return withSingles(
      selection,
      selection.singles.filter((single) => single !== date),
    );
  }
  if (isFull(selection)) return selection;
  return { ...selection, singles: [...selection.singles, date].sort() };
}

/**
 * A drag from the day pressed to another day (or back to itself), in either direction: its days
 * become one range, taking in the dates of their own on the way and stopping at the day next to
 * another range. A drag of one day is a date of its own. From the first or the last day of a
 * range the drag moves that end, the other end staying; from a day between them it does nothing
 * (`null`), as does a drag that would leave more options than an event takes. Over the days of a
 * saved range, from its first to its last, it changes nothing and says which range that is.
 */
export function dragDays(selection: DateSelection, from: string, to: string): Drag | null {
  const held = rangeOn(selection, from);
  if (held && from !== held.start && from !== held.end) return null;
  // A range dragged from one end is made again from its other end.
  const anchor = !held ? from : from === held.start ? held.end : held.start;
  const others = selection.ranges.filter((range) => range !== held);
  const reached = reachedFrom(anchor, to, others);
  const [first, last] = reached < anchor ? [reached, anchor] : [anchor, reached];
  const alreadySaved =
    selection.saved.find((range) => alike(range, { start: first, end: last })) ?? null;
  if (alreadySaved) return { anchor, first, last, alreadySaved, result: selection };
  const singles = selection.singles.filter((single) => single < first || single > last);
  const result =
    first === last
      ? { ...withSingles(selection, [...singles, first].sort()), ranges: others }
      : {
          ...withSingles(selection, singles),
          ranges: [...others, { start: first, end: last }].sort((a, b) =>
            a.start.localeCompare(b.start),
          ),
        };
  return optionCount(result) > MAX_OPTIONS ? null : { anchor, first, last, alreadySaved, result };
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
  return { anchor: date, first: date, last: date, alreadySaved: null, result: selection };
}

/**
 * A range of the calendar is saved: it is no longer marked and is one of the saved ranges. The
 * same selection when the range is not on the calendar.
 */
export function saveRange(selection: DateSelection, range: DateRange): DateSelection {
  const ranges = selection.ranges.filter((other) => !alike(other, range));
  if (ranges.length === selection.ranges.length) return selection;
  const saved = [...selection.saved, range].sort(
    (a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
  );
  return { ...selection, ranges, saved };
}

/** The selection without a saved range; what is marked on its days stays. */
export function removeSaved(selection: DateSelection, range: DateRange): DateSelection {
  return { ...selection, saved: selection.saved.filter((other) => !alike(other, range)) };
}

/**
 * The times of a date of its own are now `times`. The same selection for a day that is not a date
 * of its own, and while times are not asked for.
 */
export function withTimes(selection: DateSelection, date: string, times: DayTimes): DateSelection {
  if (!selection.timed || !selection.singles.includes(date)) return selection;
  const others = Object.entries(selection.times).filter(([day]) => day !== date);
  const entries = timesOf(times).length > 0 ? [...others, [date, times] as const] : others;
  return { ...selection, times: Object.fromEntries(entries) };
}

/**
 * The organizer asks for times on the dates of their own, or no longer: the times marked are
 * then forgotten, so asking again starts from none and never brings back more options than the
 * event takes.
 */
export function withTimesAsked(selection: DateSelection, asked: boolean): DateSelection {
  return asked ? { ...selection, timed: true } : { ...selection, timed: false, times: {} };
}

/** The selection with no date, range nor saved range; whether times were asked for is kept. */
export function withoutDates(selection: DateSelection): DateSelection {
  return { ...NO_DATES, timed: selection.timed };
}

/**
 * The options the dates amount to, as they will be voted: each range and each saved range, and
 * each date of its own, which is an option per different time when it has times.
 */
export function optionCount(selection: DateSelection): number {
  const days = selection.singles.reduce(
    (sum, date) => sum + optionsOf(selection.times[date] ?? NO_TIMES),
    0,
  );
  return days + selection.ranges.length + selection.saved.length;
}

/**
 * Every option the dates propose, as the event is created with them: each date of its own, in
 * order, as its whole day or, when it has times, as each of its times (marked and saved, in
 * `timesOf`'s order) and not its whole day; then each range and each saved range, as whole days.
 */
export function proposedOptions(selection: DateSelection): ProposedOption[] {
  const days = selection.singles.flatMap((date): ProposedOption[] => {
    const dates = { kind: 'single', date } as const;
    const times = timesOf(selection.times[date] ?? NO_TIMES);
    return times.length === 0 ? [{ dates, time: null }] : times.map((time) => ({ dates, time }));
  });
  const ranges = [...selection.ranges, ...selection.saved].map(
    ({ start, end }): ProposedOption => ({ dates: { kind: 'range', start, end }, time: null }),
  );
  return [...days, ...ranges];
}

/**
 * The dates and times that propose `options`, as the calendar marks them, each option taken in
 * the order given: a whole day is a date of its own and a range a range, unless they share a day:
 * then the range is saved, whichever came first, as is the later of two ranges that share one; a
 * range given twice is taken once. A time joins the times of its date (`withTimeRead`), and one
 * the hours of a day cannot hold is left out. Times are asked for when a date has one, or when
 * `timed` says so. `proposedOptions` makes the same options of it again.
 */
export function selectionOf(options: readonly ProposedOption[], timed = false): DateSelection {
  const singles: string[] = [];
  let ranges: readonly DateRange[] = [];
  let saved: readonly DateRange[] = [];
  const times = new Map<string, DayTimes>();

  for (const { dates, time } of options) {
    if (dates.kind === 'range') {
      const range = { start: dates.start, end: dates.end };
      if ([...ranges, ...saved].some((other) => alike(other, range))) continue;
      const shared =
        singles.some((single) => within(range, single)) ||
        ranges.some((other) => other.start <= range.end && range.start <= other.end);
      if (shared) saved = [...saved, range];
      else ranges = [...ranges, range];
      continue;
    }
    const over = ranges.find((range) => within(range, dates.date));
    if (over) {
      ranges = ranges.filter((range) => range !== over);
      saved = [...saved, over];
    }
    if (!singles.includes(dates.date)) singles.push(dates.date);
    const held = time && withTimeRead(times.get(dates.date) ?? NO_TIMES, time);
    if (held) times.set(dates.date, held);
  }

  return {
    singles: singles.sort(),
    ranges: [...ranges].sort((a, b) => a.start.localeCompare(b.start)),
    saved: [...saved].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end)),
    times: Object.fromEntries(times),
    timed: timed || times.size > 0,
  };
}

/** The event takes no more options: no new date, and no further time on a date that has one. */
export function isFull(selection: DateSelection): boolean {
  return optionCount(selection) >= MAX_OPTIONS;
}

/**
 * The organizer is asked for times: they were asked for, and a date of its own is there to have
 * them.
 */
export function asksForTimes(selection: DateSelection): boolean {
  return selection.timed && selection.singles.length > 0;
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
  return same ? selection : { ...withSingles(selection, singles), ranges, saved };
}

/** The first day marked, of its own or in a range; none while no day is marked. */
export function firstMarked(selection: DateSelection): string | undefined {
  // A sort leaves what is not there last.
  return [selection.singles[0], selection.ranges[0]?.start].sort()[0];
}

/** The range a day is in, if any. */
export function rangeOn(selection: DateSelection, date: string): DateRange | undefined {
  return selection.ranges.find((range) => range.start <= date && date <= range.end);
}

/** The selection with these dates of its own, and the times of those only. */
function withSingles(selection: DateSelection, singles: readonly string[]): DateSelection {
  const times = Object.fromEntries(
    Object.entries(selection.times).filter(([date]) => singles.includes(date)),
  );
  return { ...selection, singles, times };
}

function alike(a: DateRange, b: DateRange): boolean {
  return a.start === b.start && a.end === b.end;
}

function within(range: DateRange, date: string): boolean {
  return range.start <= date && date <= range.end;
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
