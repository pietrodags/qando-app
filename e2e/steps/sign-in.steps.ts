import {
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
  type PlaywrightWorkerArgs,
} from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { expectAccessible } from '../accessibility.js';
import type { Mailbox } from '../mailbox/mailbox.js';
import { scenarioHeaders, test, type MySession, type ScenarioClock } from './fixtures.js';
import { openManagementLink } from './manage.steps.js';

const { Given, When, Then } = createBdd(test);

Given('emails are delivered to a test mailbox', async ({ mailbox }) => {
  // The mailbox answers, and holds nothing yet for the scenario's addresses.
  expect(await mailbox.emailsTo('nobody@example.com')).toEqual([]);
});

// The sign-in page.

/**
 * Asks for a code on the sign-in page, already open, and waits for the screen that takes it: one
 * code more is sent (after the one that signed in before, when the session has expired).
 */
async function askForCode(page: Page, mailbox: Mailbox, email: string): Promise<void> {
  const own = mailbox.addressOf(email);
  const sentBefore = (await mailbox.codesSentTo(email)).length;
  await page.getByLabel('Tu email', { exact: true }).fill(own);
  await page.getByRole('button', { name: 'Enviar código', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Escribe el código', exact: true })).toBeVisible();
  await expect(page.getByText(own, { exact: true })).toBeVisible();
  expect(await mailbox.codesSentTo(email)).toHaveLength(sentBefore + 1);
}

Given('I have been sent a code at {string}', async ({ page, mailbox, mySignIn }, email: string) => {
  await page.goto('/sign-in');
  await askForCode(page, mailbox, email);
  mySignIn.email = email;
});

/** The requests that check a typed code: signing in, or deleting the account. */
const codeChecks = new Set(['/api/auth/sign-in', '/api/me/deletion']);

/** Types `code` in the code field, which checks it at its last digit, and waits for the answer. */
async function typeCode(page: Page, code: string): Promise<void> {
  const answered = page.waitForResponse((response) =>
    codeChecks.has(new URL(response.url()).pathname),
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
    const emailed = await mailbox.codesSentTo(mySignIn.email, ['sign-in', 'deletion']);
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

// A private page, opened without a session.

/** The pages only an account signed in opens, by the name the scenarios give them. */
const privatePages: Record<string, string> = {
  'Mis eventos': '/my-events',
  'Apps conectadas': '/connected-apps',
};

When('I open {string} without a session', async ({ page, mySignIn }, name: string) => {
  const path = privatePages[name];
  if (path === undefined) throw new Error(`No private page is called "${name}"`);
  await page.goto(path);
  mySignIn.askedFrom = path;
});

/** Opens a private page, signs in on the sign-in page it leads to and waits to be back on it. */
async function signInTo(page: Page, mailbox: Mailbox, email: string, path: string): Promise<void> {
  await page.goto(path);
  await expect(page).toHaveURL((url) => url.pathname === '/sign-in');
  await askForCode(page, mailbox, email);
  const code = (await mailbox.codesSentTo(email)).at(-1);
  if (code === undefined) throw new Error(`No code was emailed to ${email}`);
  await typeCode(page, code);
  await expect(page).toHaveURL((url) => url.pathname === path);
}

When(
  'I sign in as {string} and open {string}',
  async ({ page, mailbox, mySignIn }, email: string, name: string) => {
    const path = privatePages[name];
    if (path === undefined) throw new Error(`No private page is called "${name}"`);
    await signInTo(page, mailbox, email, path);
    mySignIn.email = email;
  },
);

When(
  'I sign in as {string} and open it from "Mis eventos"',
  async ({ page, mailbox, mySignIn, events }, email: string) => {
    const title = events.opened;
    if (title === undefined) throw new Error('No step named the event to open');
    // In the scenario's own browser, which holds no management link: the session opens it.
    await signInTo(page, mailbox, email, '/my-events');
    mySignIn.email = email;
    await page.getByRole('main').getByRole('link').filter({ hasText: title }).click();
    events.openedOn = undefined;
  },
);

Given('I am on the home page of a new browser', async ({ page }) => {
  // The scenario's own browser is a new one: nothing stored, no session.
  await page.goto('/');
});

When(
  'I press {string} and sign in with {string} and the emailed code',
  async ({ page, mailbox, mySignIn }, name: string, email: string) => {
    await page.getByRole('link', { name, exact: true }).click();
    await askForCode(page, mailbox, email);
    mySignIn.email = email;
    const code = (await mailbox.codesSentTo(email)).at(-1);
    if (code === undefined) throw new Error(`No code was emailed to ${email}`);
    await typeCode(page, code);
  },
);

Then('I am on the sign-in page', async ({ page }) => {
  await expect(page).toHaveURL(({ pathname }) => pathname === '/sign-in');
  await expect(page.getByRole('heading', { name: 'Entrar', exact: true })).toBeVisible();
  await expect(page.getByLabel('Tu email', { exact: true })).toBeVisible();
});

When(
  'I sign in as {string} with the code from my email',
  async ({ page, mailbox, mySignIn }, email: string) => {
    // On the sign-in page, already open; where signing in leads is the next step's to say.
    await askForCode(page, mailbox, email);
    mySignIn.email = email;
    const code = (await mailbox.codesSentTo(email)).at(-1);
    if (code === undefined) throw new Error(`No code was emailed to ${email}`);
    await typeCode(page, code);
    // The sign-in page gives its place to another: one of the app's, loaded whole after the
    // authorization server's answer when a request to connect goes on.
    await page.waitForURL(
      ({ pathname }) => pathname !== '/sign-in' && !pathname.startsWith('/api/'),
    );
  },
);

Then('I am asked to sign in', async ({ page, mySignIn }) => {
  // The sign-in page, which keeps the page asked for in its address.
  await expect(page).toHaveURL(
    ({ pathname, searchParams }) =>
      pathname === '/sign-in' && searchParams.get('returnTo') === mySignIn.askedFrom,
  );
  await expect(page.getByRole('heading', { name: 'Entrar', exact: true })).toBeVisible();
  await expect(page.getByLabel('Tu email', { exact: true })).toBeVisible();
});

When(
  'I sign in with {string} and the emailed code',
  async ({ page, mailbox, mySignIn }, email: string) => {
    await askForCode(page, mailbox, email);
    mySignIn.email = email;
    const code = (await mailbox.codesSentTo(email)).at(-1);
    if (code === undefined) throw new Error(`No code was emailed to ${email}`);
    await typeCode(page, code);
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
export function pageHeaders(baseURL: string | undefined, address: string, clock: ScenarioClock) {
  if (!baseURL) throw new Error('The run has no base URL');
  return { origin: new URL(baseURL).origin, ...scenarioHeaders(clock, address) };
}

/** Signs `request` in as the address a step names, with a code emailed to it. */
export async function signInThroughTheApi(
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

/**
 * What the API answers about the session of `cookie` (`name=value`) to a client that holds
 * nothing else: the cookie is sent as written, from no browser's cookie jar.
 */
async function askedWithCookie(
  newContext: (options: { baseURL: string }) => Promise<APIRequestContext>,
  headers: ReturnType<typeof pageHeaders>,
  cookie: string,
  eventId?: string,
): Promise<{ account: unknown; managementStatus: number | undefined }> {
  const client = await newContext({ baseURL: headers.origin });
  try {
    const sent = { ...headers, cookie };
    const session = await client.get('/api/auth/session', { headers: sent });
    expect(session.status()).toBe(200);
    const managed =
      eventId === undefined
        ? undefined
        : await client.get(`/api/events/${eventId}`, { headers: sent });
    return { account: await session.json(), managementStatus: managed?.status() };
  } finally {
    await client.dispose();
  }
}

// Signed in, and signing out from the header.

/** What signing a scenario's browser in needs: the fixtures a step receives. */
interface SigningIn {
  readonly page: Page;
  readonly context: BrowserContext;
  readonly playwright: PlaywrightWorkerArgs['playwright'];
  readonly baseURL: string | undefined;
  readonly address: string;
  readonly clock: ScenarioClock;
  readonly mailbox: Mailbox;
  readonly mySession: MySession;
}

/** Signs the scenario's browser in as the address a step names, and keeps its session. */
async function signInAs(
  { page, context, playwright, baseURL, address, clock, mailbox, mySession }: SigningIn,
  email: string,
): Promise<void> {
  const headers = pageHeaders(baseURL, address, clock);
  // Through the browser's own requests, so the browser holds the session's cookie.
  await signInThroughTheApi(page.request, headers, mailbox, email);
  const cookie = (await context.cookies(headers.origin)).find(({ name }) =>
    name.endsWith('session_token'),
  );
  if (!cookie) throw new Error('Signing in gave the browser no session cookie');
  mySession.email = email;
  mySession.cookie = `${cookie.name}=${cookie.value}`;
  // The cookie alone, sent by any client, is the session: what signing out must end.
  const { account } = await askedWithCookie(
    (options) => playwright.request.newContext(options),
    headers,
    mySession.cookie,
  );
  expect(account).toMatchObject({ email: mailbox.addressOf(email) });
}

Given(
  'I am signed in as {string}',
  async (
    { page, context, playwright, baseURL, address, clock, mailbox, mySession },
    email: string,
  ) => {
    const signingIn = { page, context, playwright, baseURL, address, clock, mailbox, mySession };
    await signInAs(signingIn, email);
  },
);

Given(
  'I am signed in as {string} in a browser without the management link',
  async (
    { page, context, playwright, baseURL, address, clock, mailbox, mySession },
    email: string,
  ) => {
    // The scenario's own browser, which never opened the link: only the session manages there.
    const signingIn = { page, context, playwright, baseURL, address, clock, mailbox, mySession };
    await signInAs(signingIn, email);
  },
);

Given(
  'I have opened {string} from "Mis eventos"',
  async ({ page, events, mySignIn }, title: string) => {
    await page.goto('/my-events');
    await page.getByRole('main').getByRole('link').filter({ hasText: title }).click();
    await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
    events.opened = title;
    events.openedOn = undefined;
    // The page that asks to sign in once the session is gone, and where signing in comes back.
    mySignIn.askedFrom = new URL(page.url()).pathname;
  },
);

Given(
  'I am signed in as {string} with the name {string}',
  async (
    { page, context, playwright, baseURL, address, clock, mailbox, mySession, seeder },
    email: string,
    name: string,
  ) => {
    // Named as an account is by its first event.
    await seeder.nameAccount(mailbox.addressOf(email), name);
    const signingIn = { page, context, playwright, baseURL, address, clock, mailbox, mySession };
    await signInAs(signingIn, email);
  },
);

Given(
  'I have opened the management page of my event {string}',
  async ({ page, events, mailbox, mySession }, title: string) => {
    if (!mySession.email) throw new Error('The scenario has not signed in');
    // The Background's day: voting is open. The event is the signed-in account's own.
    const event = await events.store({
      title,
      options: ['2026-07-06', '2026-07-10'],
      deadline: '2026-07-01',
      organizer: { name: 'Ana', email: mailbox.addressOf(mySession.email) },
    });
    await openManagementLink(page, event);
    await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
    await expect(page).toHaveURL(({ pathname, hash }) => {
      return pathname === `/manage/${event.publicId}` && hash === '';
    });
    // The browser keeps the link's token: what signing out must forget.
    const kept = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('qando.managementToken.'))
        .map((key) => localStorage.getItem(key)),
    );
    expect(kept).toEqual([event.managementToken]);
  },
);

When('I choose {string} in the header menu', async ({ page }, name: string) => {
  await page
    .getByRole('banner')
    .getByRole('button', { name: /^Cuenta de / })
    .click();
  const menu = page.locator('#account-menu');
  await expect(menu).toBeVisible();
  // The open menu is a state this step leaves, so it is checked here.
  await expectAccessible(page);
  await menu
    .getByRole('button', { name, exact: true })
    .or(menu.getByRole('link', { name, exact: true }))
    .click();
});

Then('I see {string} on the home page', async ({ page }, text: string) => {
  await expect(page).toHaveURL(({ pathname }) => pathname === '/');
  await expect(page.getByText(text, { exact: true })).toBeVisible();
});

Then(
  'the API refuses my old session',
  async ({ playwright, baseURL, address, clock, events, mySession }) => {
    if (!mySession.cookie) throw new Error('The scenario has not signed in');
    const { account, managementStatus } = await askedWithCookie(
      (options) => playwright.request.newContext(options),
      pageHeaders(baseURL, address, clock),
      mySession.cookie,
      events.latest.publicId,
    );
    expect(account).toBeNull();
    expect(managementStatus).toBe(401);
  },
);

Then(
  'this browser no longer opens the management page of {string} without its link',
  async ({ page, events }, title: string) => {
    const path = `/manage/${events.get(title).seeded.publicId}`;
    await page.goto(path);
    // No link and no session left: the page asks to sign in, to come back to it.
    await expect(page).toHaveURL(
      ({ pathname, searchParams }) =>
        pathname === '/sign-in' && searchParams.get('returnTo') === path,
    );
    await expect(page.getByRole('heading', { name: 'Entrar', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
  },
);

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
  'the API is asked for "Mis eventos" without a session',
  async ({ request, baseURL, address, clock, apiAnswer }) => {
    const answer = await request.get('/api/me/events', {
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
