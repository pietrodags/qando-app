import { randomBytes } from 'node:crypto';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
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

/** What creating an event needs: who creates it, its title, two dates and the deadline. */
interface NewEvent {
  readonly email: string;
  readonly title: string;
  readonly dates: readonly [string, string];
  readonly deadline: string;
}

/** Creates the event through the API, as the wizard does, with a signed-in `client`. */
async function createEvent(
  client: APIRequestContext,
  headers: Record<string, string>,
  apiAnswer: ApiAnswer,
  { email, title, dates, deadline }: NewEvent,
): Promise<void> {
  const answer = await client.post('/api/events', {
    // A new management token, as the wizard makes for each event.
    headers: { ...headers, 'X-Management-Token': randomBytes(16).toString('base64url') },
    data: {
      title,
      organizerName: nameOf(email),
      timeZone: 'Europe/Madrid',
      deadline,
      anonymous: false,
      options: dates.map((date) => ({ dates: { kind: 'single', date }, time: null })),
    },
  });
  expect(answer.status()).toBe(201);
  apiAnswer.status = answer.status();
  apiAnswer.body = await answer.json();
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
    await createEvent(request, headers, apiAnswer, {
      email,
      title,
      dates: [first, second],
      deadline,
    });
  },
);

When(
  'I create the event {string}',
  async ({ page, baseURL, address, clock, mySession, apiAnswer }, title: string) => {
    if (!mySession.email) throw new Error('The scenario has not signed in');
    // With the browser's own session, as the wizard creates it.
    await createEvent(page.request, pageHeaders(baseURL, address, clock), apiAnswer, {
      email: mySession.email,
      title,
      dates: ['2026-07-06', '2026-07-10'],
      deadline: '2026-07-01',
    });
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

// An email that failed, on the management page.

Given('the SMTP server is down', async ({ mailbox }) => {
  await mailbox.goDown();
});

Then(
  'the event {string} exists and its participation link works',
  async ({ page, apiAnswer }, title: string) => {
    const { participationId } = apiAnswer.body as CreatedLinks;
    await page.goto(`/vote/${participationId}`);
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
  },
);

/** The well of the email named `name` ("Resumen del evento") on the management page. */
function emailRow(page: Page, name: string) {
  return page.getByRole('listitem').filter({ hasText: name });
}

/** The state of the created event's summary email, as its organizer's browser reads it. */
async function summaryState(page: Page, participationId: string, headers: Record<string, string>) {
  const read = await page.request.get(`/api/events/${participationId}`, { headers });
  expect(read.status()).toBe(200);
  const { emails } = (await read.json()) as { emails: { type: string; status: string }[] };
  return emails.find(({ type }) => type === 'summary')?.status;
}

Then(
  'after the automatic retries my management page shows the summary email as {string} with {string}',
  async ({ page, request, baseURL, address, clock, apiAnswer }, state: string, button: string) => {
    const { participationId } = apiAnswer.body as CreatedLinks;
    // Five attempts, each due at most an hour after the failure before it: the outbox runs at
    // the scenario's time, an hour later each round, until the email has failed.
    for (let round = 0; ; round += 1) {
      await sendDueEmails(request, baseURL, address, clock);
      const status = await summaryState(
        page,
        participationId,
        pageHeaders(baseURL, address, clock),
      );
      if (status === 'failed') break;
      if (round === 5) throw new Error(`The summary is still ${status} after five rounds`);
      await clock.advance(61 * 60_000);
    }
    await page.goto(`/manage/${participationId}`);
    const row = emailRow(page, 'Resumen del evento');
    await expect(row).toContainText(state);
    await expect(row.getByRole('button', { name: button, exact: true })).toBeVisible();
  },
);

When('the SMTP server is back and I press {string}', async ({ page, mailbox }, button: string) => {
  await mailbox.comeBack();
  await emailRow(page, 'Resumen del evento').getByRole('button', { name: button }).click();
});

Then('my management page shows it as sent', async ({ page }) => {
  const row = emailRow(page, 'Resumen del evento');
  // The page reads the event again every 10 seconds while an email is being sent.
  await expect(row).toContainText('Enviado el', { timeout: 25_000 });
  await expect(row.getByRole('button')).toHaveCount(0);
});

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
