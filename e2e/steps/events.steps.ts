import type { DataTable } from 'playwright-bdd';
import { createBdd } from 'playwright-bdd';
import type { EventSeed, OptionSeed, VoteSeed } from '@qando/api/seed';
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
  '{string} owns the named event {string} with the dates {string}, {string} and {string} and the deadline {string}',
  async (
    { events },
    email: string,
    title: string,
    first: string,
    second: string,
    third: string,
    deadline: string,
  ) => {
    await events.store({
      title,
      options: [first, second, third],
      deadline,
      organizer: { name: 'Ana', email },
    });
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

/** `2026-07-07..2026-07-10`: a range of dates. */
function rangeOption(text: string): OptionSeed {
  const [date = '', endDate = ''] = text.split('..');
  return { date, endDate };
}

Given(
  'a named event {string} with the ranges {string} and {string} and the deadline {string}',
  async ({ events }, title: string, first: string, second: string, deadline: string) => {
    await events.store({ title, options: [first, second].map(rangeOption), deadline });
  },
);

/** Stores the event the scenario stored as `title` again, changed: the later steps open the new one. */
async function storedAgain(
  events: StoredEvents,
  title: string,
  change: Pick<EventSeed, 'outcome'> | Pick<EventSeed, 'votes'>,
): Promise<void> {
  const { seed } = events.get(title);
  await events.store({ ...seed, ...change });
}

/** The ISO date of an option of the seed. */
function optionDate(option: OptionSeed): string {
  return typeof option === 'string' ? option : option.date;
}

const VOTE_STATES = new Set<string>(['available', 'preferred', 'unavailable']);

/** A table row's answers, in the order of the event's options, whatever the order of its columns. */
function statesOf(seed: EventSeed, row: Record<string, string>): VoteSeed['states'] {
  return seed.options.map((option) => {
    const state = row[optionDate(option)]?.trim() ?? '';
    if (!VOTE_STATES.has(state)) throw new Error(`No answer "${state}" for ${optionDate(option)}`);
    return state as VoteSeed['states'][number];
  });
}

Given('these votes:', async ({ events }, table: DataTable) => {
  const { seed } = events.get(events.latest.title);
  const votes = table
    .hashes()
    .map((row) => ({ name: row.voter ?? '', states: statesOf(seed, row) }));
  await storedAgain(events, seed.title, { votes });
});

Given('{string} has voted', async ({ events }, name: string) => {
  const { seed } = events.get(events.latest.title);
  await storedAgain(events, seed.title, {
    votes: [{ name, states: seed.options.map(() => 'available') }],
  });
});

Given('every voter marked every option as unavailable', async ({ events }) => {
  const { seed } = events.get(events.latest.title);
  const states = seed.options.map(() => 'unavailable' as const);
  await storedAgain(events, seed.title, {
    votes: [
      { name: 'Luis', states },
      { name: 'Marta', states },
    ],
  });
});

Given(
  'an anonymous event {string} with {int} votes',
  async ({ events }, title: string, count: number) => {
    // The Background's dates and deadline: voting is open on the scenario's day.
    const options = ['2026-07-06', '2026-07-10', '2026-07-11'];
    const states = ['available', 'preferred', 'unavailable'] as const;
    await events.store({
      title,
      options,
      deadline: '2026-07-01',
      anonymous: true,
      votes: Array.from({ length: count }, () => ({ states })),
    });
  },
);

Given('the organizer has confirmed {string}', async ({ events }, date: string) => {
  const { seed } = events.get(events.latest.title);
  const confirmed = seed.options.findIndex((option) => optionDate(option) === date);
  if (confirmed < 0) throw new Error(`"${seed.title}" offers no option on ${date}`);
  await storedAgain(events, seed.title, { outcome: { confirmed } });
});

Given('{string} has been cancelled', async ({ events }, title: string) => {
  await storedAgain(events, title, { outcome: 'cancelled' });
});
