import type { Option } from '@qando/contracts';

/** A time of a day, as an option carries it: for now one time, `{ kind: 'single', at: 'HH:MM' }`. */
export type DayTime = Extract<NonNullable<Option['time']>, { kind: 'single' }>;

/** The quarters of an hour a time can be at. */
const QUARTERS = ['00', '15', '30', '45'] as const;

/**
 * A press on an hour (0 to 23) of a day: an hour with no time gains one on the hour, and an hour
 * with a time loses it, whatever its quarter. The times stay in order, one an hour at most. When
 * no more can be added (`full`) a press on a free hour leaves the same list.
 */
export function pressHour(
  times: readonly DayTime[],
  hour: number,
  full: boolean,
): readonly DayTime[] {
  if (timeAt(times, hour)) return times.filter((time) => hourOf(time) !== hour);
  if (full) return times;
  const at = `${String(hour).padStart(2, '0')}:00`;
  return [...times, { kind: 'single' as const, at }].sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * The time of an hour moves a quarter later (`by` 1) or earlier (-1), within its hour: from :00
 * to :45. At its stop, or for an hour with no time, the same list.
 */
export function shiftQuarter(
  times: readonly DayTime[],
  hour: number,
  by: -1 | 1,
): readonly DayTime[] {
  const time = timeAt(times, hour);
  if (!time) return times;
  const quarter = QUARTERS[QUARTERS.findIndex((minutes) => time.at.endsWith(minutes)) + by];
  if (quarter === undefined) return times;
  const moved = { ...time, at: `${time.at.slice(0, 3)}${quarter}` };
  return times.map((other) => (other === time ? moved : other));
}

/** The time marked on an hour, if any. */
export function timeAt(times: readonly DayTime[], hour: number): DayTime | undefined {
  return times.find((time) => hourOf(time) === hour);
}

function hourOf(time: DayTime): number {
  return Number(time.at.slice(0, 2));
}
