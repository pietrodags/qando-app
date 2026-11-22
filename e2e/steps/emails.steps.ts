import { randomBytes } from 'node:crypto';
import { expect, type APIRequestContext } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import type { SeededEvent } from '@qando/api/seed';
import { test, type ApiAnswer, type ScenarioClock, type StoredEvents } from './fixtures.js';
import { pageHeaders, signInThroughTheApi } from './sign-in.steps.js';

const { Given, When, Then } = createBdd(test);

// The emails of an event to its organizer. The API run by the tests sends none on its own: each
// is sent when a step asks the outbox to send what is due at the scenario's time.

/** The links an event was created with, as the API answered them. */
interface CreatedLinks {
  readonly participationId: string;
  readonly resultsId: string;
}

/** The organizer name of an account named by its email: "ana@example.com" is Ana. */
function nameOf(email: string): string {
  const [local = ''] = email.split('@');
  return local.charAt(0).toUpperCase() + local.slice(1);
}

When(
  '{string} creates the event {string} with the dates {string} and {string} and the deadline {string}',
  async (
    { request, baseURL, address, clock, mailbox, apiAnswer },
    email: string,
    title: string,
    first: string,
    second: string,
    deadline: string,
  ) => {
    const headers = pageHeaders(baseURL, address, clock);
    await signInThroughTheApi(request, headers, mailbox, email);
    const answer = await request.post('/api/events', {
      // A new management token, as the wizard makes for each event.
      headers: { ...headers, 'X-Management-Token': randomBytes(16).toString('base64url') },
      data: {
        title,
        organizerName: nameOf(email),
        timeZone: 'Europe/Madrid',
        deadline,
        anonymous: false,
        options: [first, second].map((date) => ({ dates: { kind: 'single', date }, time: null })),
      },
    });
    expect(answer.status()).toBe(201);
    apiAnswer.status = answer.status();
    apiAnswer.body = await answer.json();
  },
);

/** Asks the outbox to send every email due at the scenario's time. */
async function sendDueEmails(
  request: APIRequestContext,
  baseURL: string | undefined,
  address: string,
  clock: ScenarioClock,
): Promise<void> {
  const answer = await request.post('/api/test/send-due-emails', {
    headers: pageHeaders(baseURL, address, clock),
  });
  expect(answer.status()).toBe(204);
}

Then(
  '{string} receives one summary email for {string}',
  async ({ request, baseURL, address, clock, mailbox }, email: string, title: string) => {
    await sendDueEmails(request, baseURL, address, clock);
    const summaries = async () =>
      (await mailbox.emailsTo(email)).filter(
        ({ subject }) => subject === `Resumen de tu evento: ${title}`,
      );
    // Another scenario's run of the outbox may be the one sending it, a moment later.
    await expect.poll(async () => (await summaries()).length).toBe(1);
    mailbox.read = (await summaries())[0];
  },
);

Then(
  'it contains the options, the deadline with its time zone, the participation link and the management link',
  ({ mailbox, apiAnswer, baseURL }) => {
    if (!mailbox.read) throw new Error('No step read an email');
    if (!baseURL) throw new Error('The run has no base URL');
    const { participationId } = apiAnswer.body as CreatedLinks;
    const { text } = mailbox.read;
    // The scenario's dates and deadline, as the email writes them.
    expect(text).toContain('- Lun 6 Jul\n- Vie 10 Jul\nHora de Madrid\n');
    expect(text).toContain(
      'Se puede votar hasta el miércoles 1 de julio de 2026 (hora de Madrid).',
    );
    expect(text).toContain(`: ${new URL(`/vote/${participationId}`, baseURL).href}\n`);
    expect(text).toContain(`: ${new URL(`/manage/${participationId}`, baseURL).href}\n`);
  },
);

// Retrying an email: who may, and which emails.

for (const [phrase, status] of [
  ['failed', 'failed'],
  ['was sent', 'sent'],
] as const) {
  Given(`the summary email of {string} ${phrase}`, async ({ events, mailbox }, title: string) => {
    await events.store({
      title,
      options: ['2026-07-06', '2026-07-10'],
      deadline: '2026-07-01',
      organizer: { name: 'Ana', email: mailbox.addressOf('ana@example.com') },
      emails: { summary: status },
    });
  });
}

/** Asks the API to retry the summary email of the event stored last, with the token given. */
async function askToRetry(
  { request, baseURL, address, clock, events, apiAnswer }: RetryAsker,
  token: (event: SeededEvent) => string,
): Promise<void> {
  const event = events.latest;
  const answer = await request.post(`/api/events/${event.publicId}/emails/summary/retry`, {
    headers: { ...pageHeaders(baseURL, address, clock), 'X-Management-Token': token(event) },
  });
  apiAnswer.status = answer.status();
  apiAnswer.body = await answer.json();
}

interface RetryAsker {
  readonly request: APIRequestContext;
  readonly baseURL: string | undefined;
  readonly address: string;
  readonly clock: ScenarioClock;
  readonly events: StoredEvents;
  readonly apiAnswer: ApiAnswer;
}

// playwright-bdd reads each step's fixtures from the destructuring of its first parameter.
When(
  'someone asks the API to retry it with the participation link',
  ({ request, baseURL, address, clock, events, apiAnswer }) =>
    askToRetry({ request, baseURL, address, clock, events, apiAnswer }, ({ publicId }) => publicId),
);

When(
  'someone asks the API to retry it with the results link',
  ({ request, baseURL, address, clock, events, apiAnswer }) =>
    askToRetry(
      { request, baseURL, address, clock, events, apiAnswer },
      ({ resultsId }) => resultsId,
    ),
);

When(
  'the organizer asks the API to retry it',
  ({ request, baseURL, address, clock, events, apiAnswer }) =>
    askToRetry(
      { request, baseURL, address, clock, events, apiAnswer },
      ({ managementToken }) => managementToken,
    ),
);

Then(
  'it answers {int} and nothing is sent',
  async ({ request, baseURL, address, clock, events, mailbox, apiAnswer }, status: number) => {
    expect(apiAnswer.status).toBe(status);
    const event = events.latest;
    const { emails } = events.get(event.title).seed;
    const read = await request.get(`/api/events/${event.publicId}`, {
      headers: {
        ...pageHeaders(baseURL, address, clock),
        'X-Management-Token': event.managementToken,
      },
    });
    expect(read.status()).toBe(200);
    // The summary is as the scenario set it up: a failed one was not made due again.
    expect(((await read.json()) as { emails: unknown }).emails).toEqual([
      expect.objectContaining({ type: 'summary', status: emails?.summary }),
    ]);
    await sendDueEmails(request, baseURL, address, clock);
    expect(await mailbox.emailsTo('ana@example.com')).toEqual([]);
  },
);
