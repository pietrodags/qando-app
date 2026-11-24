import type { DataTable } from 'playwright-bdd';
import { createBdd } from 'playwright-bdd';
import type { EventSeed, OptionSeed, SeededEvent, VoteSeed } from '@qando/api/seed';
import type { Mailbox } from '../mailbox/mailbox.js';
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

/** Stores the event again with one vote of `name`, available on every option. */
async function votedOn(events: StoredEvents, title: string, name: string): Promise<void> {
  const { seed } = events.get(title);
  await storedAgain(events, title, {
    votes: [{ name, states: seed.options.map(() => 'available') }],
  });
}

Given('{string} has voted', async ({ events }, name: string) => {
  await votedOn(events, events.latest.title, name);
});

Given('{string} has voted on {string}', async ({ events }, name: string, title: string) => {
  await votedOn(events, title, name);
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

// The organizer's email is the scenario's own address for it (the test mailbox's), so the account
// that signs in with it owns the event and scenarios running at once never share an account.

Given(
  '{string} owns the event {string} with the dates {string} and {string} and the deadline {string}',
  async (
    { events, mailbox },
    email: string,
    title: string,
    first: string,
    second: string,
    deadline: string,
  ) => {
    await events.store({
      title,
      options: [first, second],
      deadline,
      organizer: { name: 'Ana', email: mailbox.addressOf(email) },
    });
  },
);

/** An event of the account of `email`, on two July dates, with the deadline on 1 July if none. */
export async function storeOwned(
  events: StoredEvents,
  mailbox: Mailbox,
  email: string,
  title: string,
  deadline = '2026-07-01',
): Promise<SeededEvent> {
  const name = email.slice(0, 1).toUpperCase() + email.slice(1, email.indexOf('@'));
  return events.store({
    title,
    options: ['2026-07-06', '2026-07-10'],
    deadline,
    organizer: { name, email: mailbox.addressOf(email) },
  });
}

Given(
  '{string} owns the event {string}',
  async ({ events, mailbox }, email: string, title: string) => {
    await storeOwned(events, mailbox, email, title);
  },
);

Given(
  '{string} owns the event {string} with the deadline {string}',
  async ({ events, mailbox }, email: string, title: string, deadline: string) => {
    await storeOwned(events, mailbox, email, title, deadline);
  },
);

Given(
  '{string} created {string} after {string}',
  async ({ events, mailbox }, email: string, title: string, earlier: string) => {
    events.get(earlier);
    await storeOwned(events, mailbox, email, title);
  },
);

Given(
  'the account {string} owns the events {string} and {string}',
  async ({ events, mailbox }, email: string, first: string, second: string) => {
    await storeOwned(events, mailbox, email, first);
    await storeOwned(events, mailbox, email, second);
  },
);

Given(
  '{string} and {string} have voted, so that {string} is recommended',
  async ({ events }, first: string, second: string, recommended: string) => {
    const { seed } = events.get(events.latest.title);
    // Both can come only on the recommended date: it is the one winner whatever the tie-breaks.
    const states = seed.options.map((option) =>
      optionDate(option) === recommended ? ('available' as const) : ('unavailable' as const),
    );
    if (!states.includes('available')) {
      throw new Error(`"${seed.title}" offers no option on ${recommended}`);
    }
    await storedAgain(events, seed.title, {
      votes: [
        { name: first, states },
        { name: second, states },
      ],
    });
  },
);

Given(
  'an event {string} owned by {string} with no votes',
  async ({ events }, title: string, email: string) => {
    // The Background's dates and deadline: voting is open on the scenario's day.
    await events.store({
      title,
      options: ['2026-07-06', '2026-07-10'],
      deadline: '2026-07-01',
      organizer: { name: 'Ana', email },
    });
  },
);
