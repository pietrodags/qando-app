import type { Option } from '@qando/contracts';

/**
 * A time of a day, as an option carries it: one time, `{ kind: 'single', at: 'HH:MM' }`, or a time
 * range, `{ kind: 'range', start: 'HH:MM', end: 'HH:MM' }`, which takes two hours of the day at
 * least, so it ends after it starts whatever the minutes of its two ends.
 */
export type DayTime = NonNullable<Option['time']>;

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
  /** The times of the day with `drawn` among them, in order. */
  readonly times: readonly DayTime[];
}

/** The quarters of an hour a time can be at. */
const QUARTERS: readonly string[] = [':00', ':15', ':30', ':45'];

const FREE: HourMark = { part: 'free', time: null, minutes: ':00' };

/**
 * A press on an hour (0 to 23) of a day: a free hour gains a time on the hour, an hour with a
 * time loses it, whatever its quarter, and any hour of a time range removes the whole range. The
 * times stay in order, one an hour at most. When no more can be added (`full`) a press on a free
 * hour leaves the same list.
 */
export function pressHour(
  times: readonly DayTime[],
  hour: number,
  full: boolean,
): readonly DayTime[] {
  const { time } = markAt(times, hour);
  if (time) return times.filter((other) => other !== time);
  if (full) return times;
  return inOrder([...times, { kind: 'single', at: clock(hour, ':00') }]);
}

/**
 * A drag from the hour pressed to another hour (or back to itself), up or down: its hours become
 * one time range, taking in the times of their own on the way and stopping at the hour next to
 * another range. A drag of one hour is a time of its own. From a time of its own the range keeps
 * that time's minutes at that end. From the first or the last hour of a range the drag moves that
 * end, the other end staying and each with its minutes, also when the range turns around; from an
 * hour between them it does nothing (`null`), as does a drag that would add a time when no more
 * can be added (`full`).
 */
export function dragHours(
  times: readonly DayTime[],
  from: number,
  to: number,
  full: boolean,
): HourDrag | null {
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
  if (full && kept.length >= times.length) return null;
  return { drawn, times: inOrder([...kept, drawn]) };
}

/**
 * The time of an hour moves a quarter later (`by` 1) or earlier (-1), within its hour: from :00
 * to :45. An end of a time range moves as a time does, the other end staying. At its stop, for an
 * hour with no time or one between the ends of a range, the same list.
 */
export function shiftQuarter(
  times: readonly DayTime[],
  hour: number,
  by: -1 | 1,
): readonly DayTime[] {
  const { part, time, minutes } = markAt(times, hour);
  if (time === null || part === 'between') return times;
  const quarter = QUARTERS[QUARTERS.indexOf(minutes) + by];
  if (quarter === undefined) return times;
  const at = clock(hour, quarter);
  const moved: DayTime =
    time.kind === 'single'
      ? { ...time, at }
      : part === 'start'
        ? { ...time, start: at }
        : { ...time, end: at };
  return times.map((other) => (other === time ? moved : other));
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

/** By the time each begins: no two share an hour. */
function inOrder(times: readonly DayTime[]): readonly DayTime[] {
  return [...times].sort((a, b) => startOf(a).localeCompare(startOf(b)));
}

function startOf(time: DayTime): string {
  return time.kind === 'single' ? time.at : time.start;
}

/** `09:30` → 9. */
function hourOf(time: string): number {
  return Number(time.slice(0, 2));
}

/** 9 and ":30" → `09:30`. */
function clock(hour: number, minutes: string): string {
  return `${String(hour).padStart(2, '0')}${minutes}`;
}
