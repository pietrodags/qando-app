import { expect, type APIRequestContext } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test, type ApiAnswer, type ScenarioClock } from './fixtures.js';
import { pageHeaders } from './sign-in.steps.js';

const { When, Then } = createBdd(test);

// The API asked to create an event as a page would, past the wizard: with the browser's session.

/** An option as the API takes it: a whole day, or a day at a time or time range. */
interface SentOption {
  readonly dates: { readonly kind: 'single'; readonly date: string };
  readonly time:
    | null
    | { readonly kind: 'single'; readonly at: string }
    | { readonly kind: 'range'; readonly start: string; readonly end: string };
}

const wholeDay = (date: string): SentOption => ({ dates: { kind: 'single', date }, time: null });

const onTheSixth = (time: SentOption['time']): SentOption => ({
  dates: { kind: 'single', date: '2026-07-06' },
  time,
});

interface Asker {
  readonly request: APIRequestContext;
  readonly baseURL: string | undefined;
  readonly address: string;
  readonly clock: ScenarioClock;
}

/**
 * Asks to create "Cena de verano" with these options, everything else as the wizard sends it, so
 * only the options can break a rule; keeps the answer.
 */
async function askToCreate(
  { request, baseURL, address, clock }: Asker,
  apiAnswer: ApiAnswer,
  options: readonly SentOption[],
): Promise<void> {
  const answer = await request.post('/api/events', {
    headers: pageHeaders(baseURL, address, clock),
    data: {
      title: 'Cena de verano',
      organizerName: 'Ana',
      timeZone: 'Europe/Madrid',
      deadline: '2026-07-01',
      anonymous: false,
      options,
    },
  });
  apiAnswer.status = answer.status();
  apiAnswer.body = await answer.json();
}

When(
  'the API is asked to create an event with {int} options',
  async ({ page, baseURL, address, clock, apiAnswer }, count: number) => {
    // A day each, from 1 July on.
    const days = Array.from({ length: count }, (_, index) =>
      wholeDay(new Date(Date.UTC(2026, 6, 1 + index)).toISOString().slice(0, 10)),
    );
    await askToCreate({ request: page.request, baseURL, address, clock }, apiAnswer, days);
  },
);

When(
  'the API is asked to create an event with a date on {string}',
  async ({ page, baseURL, address, clock, apiAnswer }, date: string) => {
    const asker = { request: page.request, baseURL, address, clock };
    await askToCreate(asker, apiAnswer, [wholeDay(date)]);
  },
);

When(
  'the API is asked to create an event with the time {string}',
  async ({ page, baseURL, address, clock, apiAnswer }, at: string) => {
    const asker = { request: page.request, baseURL, address, clock };
    await askToCreate(asker, apiAnswer, [onTheSixth({ kind: 'single', at })]);
  },
);

When(
  'the API is asked to create an event with two equal options',
  async ({ page, baseURL, address, clock, apiAnswer }) => {
    const asker = { request: page.request, baseURL, address, clock };
    await askToCreate(asker, apiAnswer, [wholeDay('2026-07-06'), wholeDay('2026-07-06')]);
  },
);

When(
  'the API is asked to create an event with the time range {string}',
  async ({ page, baseURL, address, clock, apiAnswer }, range: string) => {
    const [start = '', end = ''] = range.split('-');
    const asker = { request: page.request, baseURL, address, clock };
    await askToCreate(asker, apiAnswer, [onTheSixth({ kind: 'range', start, end })]);
  },
);

Then(
  'it answers {int} and no event is created',
  async ({ apiAnswer, seeder, mailbox, mySession }, status: number) => {
    expect(apiAnswer.status).toBe(status);
    // Refused by a rule of the options, not because the request broke the contract.
    const details = (apiAnswer.body as { error: { details: { code: string }[] } }).error.details;
    expect(details.length).toBeGreaterThan(0);
    expect(details.map(({ code }) => code)).not.toContain('INVALID_FIELD');
    expect(await seeder.eventsOwnedBy(mailbox.addressOf(mySession.email))).toBe(0);
  },
);
