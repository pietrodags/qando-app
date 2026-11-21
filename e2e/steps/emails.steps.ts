import { randomBytes } from 'node:crypto';
import { expect, type APIRequestContext } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test, type ScenarioClock } from './fixtures.js';
import { pageHeaders, signInThroughTheApi } from './sign-in.steps.js';

const { When, Then } = createBdd(test);

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
