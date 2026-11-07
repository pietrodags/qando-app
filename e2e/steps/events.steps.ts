import { createBdd } from 'playwright-bdd';
import type { OptionSeed, Outcome } from '@qando/api/seed';
import { type StoredEvents, test } from './fixtures.js';

const { Given } = createBdd(test);

Given(
  'a named event {string} with the dates {string}, {string} and {string} and the deadline {string}',
  async (
    { events },
    title: string,
    first: string,
    second: string,
    third: string,
    deadline: string,
  ) => {
    await events.store({ title, options: [first, second, third], deadline });
  },
);

Given(
  'an anonymous event {string} with the date {string}',
  async ({ events }, title: string, date: string) => {
    // No deadline in the scenario: one that leaves the event open on the scenario's day.
    await events.store({ title, options: [date], deadline: date, anonymous: true });
  },
);

/** `2026-07-06 18:00` or `2026-07-06 19:30-21:00`: a day with a time or a range of times. */
function timedOption(text: string): OptionSeed {
  const [date = '', time = ''] = text.split(' ');
  const [startTime, endTime] = time.split('-');
  return { date, ...(startTime && { startTime }), ...(endTime && { endTime }) };
}

Given(
  'a named event {string} with the times {string}, {string} and {string} and the deadline {string}',
  async (
    { events },
    title: string,
    first: string,
    second: string,
    third: string,
    deadline: string,
  ) => {
    await events.store({ title, options: [first, second, third].map(timedOption), deadline });
  },
);

/** Stores the event the scenario stored as `title` again, now with `outcome`: the later steps open it. */
async function storedAgain(events: StoredEvents, title: string, outcome: Outcome): Promise<void> {
  const { seed } = events.get(title);
  await events.store({ ...seed, outcome });
}

Given('the organizer has confirmed {string}', async ({ events }, date: string) => {
  const { seed } = events.get(events.latest.title);
  const confirmed = seed.options.findIndex(
    (option) => (typeof option === 'string' ? option : option.date) === date,
  );
  if (confirmed < 0) throw new Error(`"${seed.title}" offers no option on ${date}`);
  await storedAgain(events, seed.title, { confirmed });
});

Given('{string} has been cancelled', async ({ events }, title: string) => {
  await storedAgain(events, title, 'cancelled');
});
