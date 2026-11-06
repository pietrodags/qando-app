import { createBdd } from 'playwright-bdd';
import { test } from './fixtures.js';

const { Given } = createBdd(test);

Given(
  'today is {string} in {string}',
  async ({ clock, $testInfo }, date: string, timeZone: string) => {
    // The browser's zone is the project's (playwright.config.ts): a scenario in another zone
    // would read its dates in Madrid's.
    const browserZone = $testInfo.project.use.timezoneId;
    if (timeZone !== browserZone) {
      throw new Error(`The browser runs in ${browserZone}, not in ${timeZone}`);
    }
    // Midday: the date is the same in the zone whatever its offset or clock change.
    await clock.set(localInstant(date, '12:00', timeZone));
  },
);

/**
 * The instant the clocks of `timeZone` show `time` on `date`: the wall time read as UTC, moved
 * back by the zone's offset the day before or the day after, whichever lands on that wall time.
 * A time the clocks skip or show twice when they change is refused rather than guessed.
 * (`Temporal` would say it in one line, but Node 24 lacks it.)
 */
export function localInstant(date: string, time: string, timeZone: string): Date {
  const wall = Date.parse(`${date}T${time}:00.000Z`);
  const candidates = new Set(
    [wall - day, wall + day].map((nearby) => wall - offset(nearby, timeZone)),
  );
  const [instant, ...others] = [...candidates].filter(
    (candidate) => candidate + offset(candidate, timeZone) === wall,
  );
  if (instant === undefined || others.length > 0) {
    throw new Error(`${date} ${time} is not one single time in ${timeZone}`);
  }
  return new Date(instant);
}

const day = 86_400_000;

/** How far ahead of UTC the clocks of `timeZone` are at `instant`, in milliseconds. */
function offset(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(instant)
      .map(({ type, value }) => [type, Number(value)]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
  const shown = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return shown - Math.floor(instant / 1000) * 1000;
}
