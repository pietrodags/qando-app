// The state of an event as people see it. Voting closes at `closesAt` (the deadline's last instant
// in the event's time zone) whether or not anything updated the stored state, so every reader and
// every vote check goes through `currentState` instead of the stored value.

export type EventState = 'open' | 'closed' | 'confirmed';

/** What is stored about an event's lifecycle. */
export interface StoredEventState {
  readonly state: EventState;
  readonly closesAt: Date;
}

/** The event's state at `now`: an open event whose closing instant has come is closed. */
export function currentState(event: StoredEventState, now: Date): EventState {
  if (event.state === 'open' && now.getTime() >= event.closesAt.getTime()) return 'closed';
  return event.state;
}

const day = 24 * 60 * 60 * 1000;

/**
 * When voting closes for a deadline (an ISO date, `2026-07-01`) in an IANA time zone: the last
 * millisecond before the next day starts there. A day whose clocks change ends when the next one
 * starts, even if that day has no midnight.
 */
export function closingInstant(deadline: string, timeZone: string): Date {
  const nextDay = new Date(Date.parse(deadline) + day);
  const nextDate = nextDay.toISOString().slice(0, 10);
  // Read the zone's offset at UTC midnight, then again at the instant it gives: the second read
  // corrects a clock change between both. The day starts at the reading whose millisecond before
  // is still the deadline (a skipped midnight starts it an hour late).
  const first = nextDay.getTime() - offset(nextDay, timeZone);
  const second = nextDay.getTime() - offset(new Date(first), timeZone);
  const startsTheDay = (instant: number) =>
    localDate(new Date(instant), timeZone) === nextDate &&
    localDate(new Date(instant - 1), timeZone) !== nextDate;
  const start = startsTheDay(first) ? first : second;
  return new Date(start - 1);
}

/** How far ahead of UTC the zone's clocks are at `instant`, in milliseconds. */
function offset(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(instant)
      .map(({ type, value }) => [type, Number(value)]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
  const wallClock = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return wallClock - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The calendar date in the zone at `instant`, as an ISO date. */
function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant);
}
