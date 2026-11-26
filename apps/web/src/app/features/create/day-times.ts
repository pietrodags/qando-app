import type { Option } from '@qando/contracts';
import { withinOneHour } from '@qando/domain';

/**
 * A time of a day, as an option carries it: one time, `{ kind: 'single', at: 'HH:MM' }`, or a time
 * range, `{ kind: 'range', start: 'HH:MM', end: 'HH:MM' }`, which takes two hours of the day at
 * least, so it ends after it starts whatever the minutes of its two ends.
 */
export type DayTime = NonNullable<Option['time']>;

/**
 * The times of a day. Each of its different times, marked or saved, is one option of the event; a
 * day without times is one option, the whole day.
 */
export interface DayTimes {
  /** The times marked on the hours of the day, in order: no two share an hour. */
  readonly marked: readonly DayTime[];
  /**
   * The times saved from the marked ones, by when each starts, then by when it ends, no two
   * alike. They can share hours with each other and with the marked times, and a marked time
   * like a saved one is the same option.
   */
  readonly saved: readonly DayTime[];
}

/** A saved time being edited: the time as it is saved, and as the edit has left it so far. */
export interface SavedEdit {
  readonly saved: DayTime;
  readonly now: DayTime;
}

export const NO_TIMES: DayTimes = { marked: [], saved: [] };

/** What an hour of a day is, by the times marked on the day. */
export interface HourMark {
  /**
   * A free hour, the hour of a time of its own, the first or the last hour of a time range, or an
   * hour between those two.
   */
  readonly part: 'free' | 'single' | 'start' | 'end' | 'between';
  /** The time or the range the hour is of; `null` for a free hour. */
  readonly time: DayTime | null;
  /** The minutes of the time at this hour, as ":15"; ":00" where none is: free, or between. */
  readonly minutes: string;
}

/** A drag over the hours of a day: what it draws, and the times it leaves once released. */
export interface HourDrag {
  /** The range from the hour that stays to the hour reached; a time of its own when they are one. */
  readonly drawn: DayTime;
  /** The times of the day with `drawn` among the marked ones, in order. */
  readonly times: DayTimes;
}

/** The quarters of an hour a time can be at. */
const QUARTERS: readonly string[] = [':00', ':15', ':30', ':45'];

const FREE: HourMark = { part: 'free', time: null, minutes: ':00' };

/**
 * A press on an hour (0 to 23) of a day: a free hour gains a time on the hour, an hour with a
 * time loses it, whatever its quarter, and any hour of a time range removes the whole range. The
 * marked times stay in order, one an hour at most. When the event takes no more options (`full`)
 * a press that would add one leaves the same times.
 */
export function pressHour(day: DayTimes, hour: number, full: boolean): DayTimes {
  const { time } = markAt(day.marked, hour);
  const marked = time
    ? day.marked.filter((other) => other !== time)
    : inOrder([...day.marked, { kind: 'single', at: clock(hour, ':00') }]);
  return within(day, { ...day, marked }, full);
}

/**
 * A drag from the hour pressed to another hour (or back to itself), up or down: its hours become
 * one time range, taking in the times of their own on the way and stopping at the hour next to
 * another range. A drag of one hour is a time of its own. From a time of its own the range keeps
 * that time's minutes at that end. From the first or the last hour of a range the drag moves that
 * end, the other end staying and each with its minutes, also when the range turns around; from an
 * hour between them it does nothing (`null`), as does a drag that would add an option when the
 * event takes no more (`full`).
 */
export function dragHours(day: DayTimes, from: number, to: number, full: boolean): HourDrag | null {
  const times = day.marked;
  const { part, time, minutes } = markAt(times, from);
  if (part === 'between') return null;
  // A range dragged from one end is made again from its other end, which stays.
  const staying = time?.kind === 'range' ? (part === 'start' ? time.end : time.start) : null;
  const anchor = staying === null ? from : hourOf(staying);
  const anchorMinutes = staying === null ? minutes : staying.slice(2);
  const movedMinutes = staying === null ? ':00' : minutes;
  const others = times.filter((other) => other !== time);
  const reached = reachedFrom(anchor, to, others);
  const [first, last] = reached < anchor ? [reached, anchor] : [anchor, reached];
  const drawn: DayTime =
    first === last
      ? { kind: 'single', at: clock(anchor, anchorMinutes) }
      : {
          kind: 'range',
          start: clock(first, first === anchor ? anchorMinutes : movedMinutes),
          end: clock(last, last === anchor ? anchorMinutes : movedMinutes),
        };
  const kept = others.filter(
    (other) => other.kind === 'range' || hourOf(other.at) < first || hourOf(other.at) > last,
  );
  const drawing = { ...day, marked: inOrder([...kept, drawn]) };
  return adds(day, drawing, full) ? null : { drawn, times: drawing };
}

/**
 * The time of an hour moves a quarter later (`by` 1) or earlier (-1), within its hour: from :00
 * to :45. An end of a time range moves as a time does, the other end staying. At its stop, for an
 * hour with no time or one between the ends of a range, the same times; and when the event takes
 * no more options (`full`), for a time like a saved one, which moved would be an option more.
 */
export function shiftQuarter(day: DayTimes, hour: number, by: -1 | 1, full: boolean): DayTimes {
  const { time } = markAt(day.marked, hour);
  const moved = time ? shifted(time, hour, by) : null;
  if (moved === null || moved === time) return day;
  const marked = day.marked.map((other) => (other === time ? moved : other));
  return within(day, { ...day, marked }, full);
}

/**
 * A marked time is saved: it is no longer marked, and is one of the saved times unless one like
 * it is there already. The same times when it is not one of the marked.
 */
export function saveTime(day: DayTimes, time: DayTime): DayTimes {
  const marked = day.marked.filter((other) => other !== time);
  if (marked.length === day.marked.length) return day;
  return { marked, saved: withSaved(day.saved, time) };
}

/** The times without a saved one; what is marked on its hours stays. */
export function removeSavedTime(day: DayTimes, time: DayTime): DayTimes {
  return { ...day, saved: day.saved.filter((other) => other !== time) };
}

/**
 * The time being edited moves a quarter later (`by` 1) or earlier (-1) at `hour`, as a marked
 * time does: its own hour, or the hour of an end of a range. The same edit at its stop, at any
 * other hour, and when the event takes no more options (`full`) and the time moved would be one
 * more.
 */
export function shiftEdited(
  day: DayTimes,
  edit: SavedEdit,
  hour: number,
  by: -1 | 1,
  full: boolean,
): SavedEdit {
  const now = shifted(edit.now, hour, by);
  if (now === edit.now) return edit;
  const moved = { ...edit, now };
  return adds(day, ended(day, moved), full) ? edit : moved;
}

/**
 * The edit ends: the saved time is as the edit left it, in its place among the saved times, or
 * gone into the saved time it has become like. The same times when it ends as it was saved, and
 * when the event takes no more options (`full`) and the time as the edit left it would be one
 * more: the edit is undone.
 */
export function endEdit(day: DayTimes, edit: SavedEdit, full: boolean): DayTimes {
  return within(day, ended(day, edit), full);
}

/**
 * A time read from a phrase joins the times of the day: marked on its hours while they are free.
 * When one of them has a time marked before, whichever of the two is a range is saved, so a time
 * of its own takes the hour of the range marked there; and of two of a kind, the one read later.
 * The same times when one like it is there, marked or saved. `null` for a range the hours of a
 * day cannot hold: one within a single clock hour, by the rule every option follows.
 */
export function withTimeRead(day: DayTimes, time: Extract<DayTime, { kind: 'single' }>): DayTimes;
export function withTimeRead(day: DayTimes, time: DayTime): DayTimes | null;
export function withTimeRead(day: DayTimes, time: DayTime): DayTimes | null {
  if (withinOneHour(time)) return null;
  if (timesOf(day).some((other) => keyOf(other) === keyOf(time))) return day;
  const met = day.marked.find((other) => sharesHour(other, time));
  if (!met) return { ...day, marked: inOrder([...day.marked, time]) };
  if (time.kind === 'range' || met.kind === 'single') {
    return { ...day, saved: withSaved(day.saved, time) };
  }
  return {
    marked: inOrder([...day.marked.filter((other) => other !== met), time]),
    saved: withSaved(day.saved, met),
  };
}

/**
 * The saved time like a time: itself when it is one of them, or the one with its ends; `null`
 * when none is. After an edit has ended, what its saved time now is: the time as the edit left
 * it, or the saved time it joined.
 */
export function savedLike(day: DayTimes, time: DayTime): DayTime | null {
  return day.saved.find((other) => keyOf(other) === keyOf(time)) ?? null;
}

/** The different times of the day, marked and saved, by when each starts, then by when it ends. */
export function timesOf(day: DayTimes): readonly DayTime[] {
  return day.marked.reduce(withSaved, day.saved);
}

/** The options the day amounts to: one for each different time, and one without times. */
export function optionsOf(day: DayTimes): number {
  return Math.max(timesOf(day).length, 1);
}

/** What an hour (0 to 23) of the day is: free, or which part of which time. */
export function markAt(times: readonly DayTime[], hour: number): HourMark {
  for (const time of times) {
    if (time.kind === 'single') {
      if (hourOf(time.at) === hour) return { part: 'single', time, minutes: time.at.slice(2) };
    } else if (hourOf(time.start) === hour) {
      return { part: 'start', time, minutes: time.start.slice(2) };
    } else if (hourOf(time.end) === hour) {
      return { part: 'end', time, minutes: time.end.slice(2) };
    } else if (hour > hourOf(time.start) && hour < hourOf(time.end)) {
      return { part: 'between', time, minutes: ':00' };
    }
  }
  return FREE;
}

/** The times once an edit has ended, whatever the options the event takes. */
function ended(day: DayTimes, edit: SavedEdit): DayTimes {
  if (keyOf(edit.now) === keyOf(edit.saved)) return day;
  const others = day.saved.filter((other) => other !== edit.saved);
  return { ...day, saved: withSaved(others, edit.now) };
}

/**
 * The times as a change leaves them, unless the event takes no more options (`full`) and the
 * change would add one: then the times as they were.
 */
function within(before: DayTimes, after: DayTimes, full: boolean): DayTimes {
  return adds(before, after, full) ? before : after;
}

/** The event takes no more options (`full`) and the change would add one. */
function adds(before: DayTimes, after: DayTimes, full: boolean): boolean {
  return full && optionsOf(after) > optionsOf(before);
}

/** The time a quarter later or earlier at `hour`; the same time at its stop and at any other hour. */
function shifted(time: DayTime, hour: number, by: -1 | 1): DayTime {
  const { part, minutes } = markAt([time], hour);
  const quarter = QUARTERS[QUARTERS.indexOf(minutes) + by];
  if (part === 'free' || part === 'between' || quarter === undefined) return time;
  const at = clock(hour, quarter);
  if (time.kind === 'single') return { ...time, at };
  return part === 'start' ? { ...time, start: at } : { ...time, end: at };
}

/** The saved times with one more in its place; the same list when one like it is there. */
function withSaved(saved: readonly DayTime[], time: DayTime): readonly DayTime[] {
  if (saved.some((other) => keyOf(other) === keyOf(time))) return saved;
  return [...saved, time].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}

/** What tells a time from any other, and puts it before those that start, then end, later. */
function keyOf(time: DayTime): string {
  return time.kind === 'single' ? `${time.at} ${time.at}` : `${time.start} ${time.end}`;
}

/** The hour a drag from `anchor` towards `to` gets to: `to`, or the hour next to a range on its way. */
function reachedFrom(anchor: number, to: number, others: readonly DayTime[]): number {
  let reached = to;
  for (const other of others) {
    if (other.kind !== 'range') continue;
    if (hourOf(other.end) < anchor) reached = Math.max(reached, hourOf(other.end) + 1);
    if (hourOf(other.start) > anchor) reached = Math.min(reached, hourOf(other.start) - 1);
  }
  return reached;
}

/** Two times have an hour in common: the hour of a time of its own, or any from a range's first to its last. */
function sharesHour(a: DayTime, b: DayTime): boolean {
  return hourOf(startOf(a)) <= hourOf(endOf(b)) && hourOf(startOf(b)) <= hourOf(endOf(a));
}

/** By the time each begins: no two share an hour. */
function inOrder(times: readonly DayTime[]): readonly DayTime[] {
  return [...times].sort((a, b) => startOf(a).localeCompare(startOf(b)));
}

function startOf(time: DayTime): string {
  return time.kind === 'single' ? time.at : time.start;
}

function endOf(time: DayTime): string {
  return time.kind === 'single' ? time.at : time.end;
}

/** `09:30` → 9. */
function hourOf(time: string): number {
  return Number(time.slice(0, 2));
}

/** 9 and ":30" → `09:30`. */
function clock(hour: number, minutes: string): string {
  return `${String(hour).padStart(2, '0')}${minutes}`;
}
