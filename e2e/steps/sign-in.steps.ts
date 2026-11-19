import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import type { Mailbox } from '../mailbox/mailbox.js';
import { test, type ScenarioClock } from './fixtures.js';

const { Given, When, Then } = createBdd(test);

Given('emails are delivered to a test mailbox', async ({ mailbox }) => {
  // The mailbox answers, and holds nothing yet for the scenario's addresses.
  expect(await mailbox.emailsTo('nobody@example.com')).toEqual([]);
});

// The sign-in page.

Given('I have been sent a code at {string}', async ({ page, mailbox, mySignIn }, email: string) => {
  const own = mailbox.addressOf(email);
  await page.goto('/sign-in');
  await page.getByLabel('Tu email', { exact: true }).fill(own);
  await page.getByRole('button', { name: 'Enviar código', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Escribe el código', exact: true })).toBeVisible();
  await expect(page.getByText(own, { exact: true })).toBeVisible();
  expect(await mailbox.codesSentTo(email)).toHaveLength(1);
  mySignIn.email = email;
});

/** Types `code` in the code field, which checks it at its last digit, and waits for the answer. */
async function typeCode(page: Page, code: string): Promise<void> {
  const answered = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/auth/sign-in',
  );
  await page.getByLabel('Código', { exact: true }).fill(code);
  await answered;
}

/** A 6-digit code that was never emailed for this sign-in nor typed yet. */
function wrongCode(emailed: readonly string[], typed: readonly string[]): string {
  for (let number = Number(emailed.at(-1) ?? 0) + 1; ; number += 1) {
    const code = String(number % 1_000_000).padStart(6, '0');
    if (!emailed.includes(code) && !typed.includes(code)) return code;
  }
}

/** What the page says after the wrong try that leaves `left`. */
const refusalWith = (left: number) =>
  left === 0
    ? 'Demasiados intentos.'
    : `Código incorrecto. ${left === 1 ? 'Te queda 1 intento.' : `Te quedan ${left} intentos.`}`;

const allowedTries = 5;

When(
  /^I type a wrong code(?: (\d+) more times)?$/,
  async ({ page, mailbox, mySignIn }, times: string | undefined) => {
    const emailed = await mailbox.codesSentTo(mySignIn.email);
    for (let more = Number(times ?? 1); more > 0; more -= 1) {
      const code = wrongCode(emailed, mySignIn.wrongCodes);
      await typeCode(page, code);
      mySignIn.wrongCodes.push(code);
      // Each try is answered before the next: the page checks one code at a time.
      const left = allowedTries - mySignIn.wrongCodes.length;
      await expect(page.getByText(refusalWith(left), { exact: true })).toBeVisible();
    }
  },
);

Then(
  'the right code is no longer accepted',
  async ({ page, baseURL, address, clock, mailbox, mySignIn }) => {
    // The page has turned the field off, so the API is asked as the page would.
    await expect(page.getByLabel('Código', { exact: true })).toBeDisabled();
    const code = (await mailbox.codesSentTo(mySignIn.email)).at(-1);
    const answer = await page.request.post('/api/auth/sign-in', {
      headers: pageHeaders(baseURL, address, clock),
      data: { email: mailbox.addressOf(mySignIn.email), code },
    });
    expect(answer.status()).toBe(400);
    expect(await answer.json()).toMatchObject({ error: { code: 'TOO_MANY_ATTEMPTS' } });
  },
);

Then('{string} is disabled with a countdown', async ({ page }, name: string) => {
  // The scenario's time stands still, so the count shows the whole wait.
  await expect(page.getByRole('button', { name: `${name} en 30 s`, exact: true })).toBeDisabled();
});

/** Moves the scenario's time forward and presses the button, once the page lets it. */
async function pressAfter(
  page: Page,
  clock: ScenarioClock,
  seconds: number,
  name: string,
): Promise<void> {
  await clock.advance(seconds * 1000);
  await page.getByRole('button', { name, exact: true }).click();
}

When(
  '{int} seconds have passed and I press {string}',
  async ({ page, clock }, seconds: number, name: string) => {
    await pressAfter(page, clock, seconds, name);
  },
);

When(
  'I press {string} every {int} seconds until {int} codes have been emailed',
  async ({ page, clock, mailbox, mySignIn }, name: string, seconds: number, codes: number) => {
    for (let sent = (await mailbox.codesSentTo(mySignIn.email)).length; sent < codes; sent += 1) {
      await pressAfter(page, clock, seconds, name);
      await expect.poll(() => mailbox.codesSentTo(mySignIn.email)).toHaveLength(sent + 1);
    }
  },
);

Then('a second code is emailed to {string}', async ({ mailbox }, email: string) => {
  await expect.poll(() => mailbox.codesSentTo(email)).toHaveLength(2);
});

Then('the first code is no longer accepted', async ({ page, mailbox, mySignIn }) => {
  const [first, second] = await mailbox.codesSentTo(mySignIn.email);
  if (first === undefined || second === undefined) throw new Error('Two codes were not emailed');
  // One time in a million both codes are the same digits: nothing then tells them apart.
  if (first === second) return;
  await typeCode(page, first);
  await expect(page.getByText(refusalWith(allowedTries - 1), { exact: true })).toBeVisible();
});

Then('I am told {string} and {string}', async ({ page }, limit: string, wait: string) => {
  // One notice: screen readers hear the limit and the wait together.
  const notice = page.getByRole('alert').filter({ hasText: limit });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(wait);
});

Then(
  'only {int} codes have been emailed to {string}',
  async ({ mailbox }, codes: number, email: string) => {
    expect(await mailbox.codesSentTo(email)).toHaveLength(codes);
  },
);

// The API, asked directly.

/** The headers of a request as one of qando's pages sends it in this scenario. */
function pageHeaders(baseURL: string | undefined, address: string, clock: ScenarioClock) {
  if (!baseURL) throw new Error('The run has no base URL');
  const now = clock.now;
  return {
    origin: new URL(baseURL).origin,
    'x-forwarded-for': address,
    ...(now && { 'x-test-now': now.toISOString() }),
  };
}

/** Signs `request` in as the address a step names, with a code emailed to it. */
async function signInThroughTheApi(
  request: APIRequestContext,
  headers: Record<string, string>,
  mailbox: Mailbox,
  email: string,
): Promise<void> {
  const own = mailbox.addressOf(email);
  const sent = await request.post('/api/auth/sign-in-code', { headers, data: { email: own } });
  expect(sent.status()).toBe(200);
  const code = (await mailbox.codesSentTo(email)).at(-1);
  const signedIn = await request.post('/api/auth/sign-in', {
    headers,
    data: { email: own, code },
  });
  expect(signedIn.status()).toBe(200);
}

When(
  'the API is asked for the management data of {string} without a session or its link',
  async ({ request, baseURL, address, clock, events, apiAnswer }, title: string) => {
    const { publicId } = events.get(title).seeded;
    const answer = await request.get(`/api/events/${publicId}`, {
      headers: pageHeaders(baseURL, address, clock),
    });
    apiAnswer.status = answer.status();
  },
);

When(
  '{string}, signed in, asks the API for the management data of {string}',
  async (
    { request, baseURL, address, clock, events, mailbox, apiAnswer },
    email: string,
    title: string,
  ) => {
    const headers = pageHeaders(baseURL, address, clock);
    await signInThroughTheApi(request, headers, mailbox, email);
    const { publicId } = events.get(title).seeded;
    const answer = await request.get(`/api/events/${publicId}`, { headers });
    apiAnswer.status = answer.status();
  },
);
