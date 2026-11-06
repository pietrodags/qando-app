import { createBdd } from 'playwright-bdd';
import { test } from './fixtures.js';

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
