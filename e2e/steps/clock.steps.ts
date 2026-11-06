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

/** The instant the clocks of `timeZone` show `time` on `date`. */
export function localInstant(date: string, time: string, timeZone: string): Date {
  const local = Temporal.PlainDateTime.from(`${date}T${time}`);
  return new Date(local.toZonedDateTime(timeZone).epochMilliseconds);
}
