import { expect, type Page, type PlaywrightWorkerArgs } from '@playwright/test';
import type { Seeder } from '@qando/api/seed';
import { createBdd } from 'playwright-bdd';
import {
  everyPermission,
  type AccessClaims,
  type Assistant,
  type Assistants,
  type Called,
  type ToolAnswer,
} from '../assistants.js';
import type { Mailbox } from '../mailbox/mailbox.js';
import { test, type ApiSessions, type ScenarioClock } from './fixtures.js';
import { pageHeaders, signInThroughTheApi } from './sign-in.steps.js';

const { Given, When, Then } = createBdd(test);

// The metadata of the authorization server as an application read it, kept for the step that
// checks it.
let serverMetadata: Record<string, unknown> | undefined;

When("an application reads the metadata of qando's authorization server", async ({ page }) => {
  // As an application finds it, through the web's address: the connector's metadata names the
  // authorization server, whose own metadata is at the well-known address of its site, with
  // the server's path after it.
  const connector = await page.request.get('/.well-known/oauth-protected-resource/api/mcp');
  expect(connector.status()).toBe(200);
  const { authorization_servers: servers } = (await connector.json()) as {
    authorization_servers: string[];
  };
  const server = new URL(servers[0] ?? '');
  const answer = await page.request.get(
    `${server.origin}/.well-known/oauth-authorization-server${server.pathname}`,
  );
  expect(answer.status()).toBe(200);
  serverMetadata = (await answer.json()) as Record<string, unknown>;
});

Then('the metadata offers no address to register at', () => {
  expect(serverMetadata).toHaveProperty('issuer');
  expect(serverMetadata).not.toHaveProperty('registration_endpoint');
});

// Connecting: the application opens the browser with its request, as an assistant does when
// qando is added to it.

/** The pages the scenario's browser showed since an application last sent it with a request. */
const shownSince = new WeakMap<Page, string[]>();

When('{string} asks to connect to qando', async ({ page, assistants }, name: string) => {
  const shown: string[] = [];
  if (!shownSince.has(page)) {
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) shownSince.get(page)?.push(frame.url());
    });
  }
  shownSince.set(page, shown);
  await page.goto(assistants.named(name).request());
  // The authorization server sends the browser on: to one of qando's pages, or straight back.
  await page.waitForURL(({ pathname }) => !pathname.startsWith('/api/'));
});

Then(
  'the consent page names {string} and says it will see, create and manage my events',
  async ({ page, assistants, mailbox, mySignIn, mySession }, name: string) => {
    await expect(page).toHaveURL(({ pathname }) => pathname === '/connect');
    const consent = page.getByRole('main');
    await expect(
      consent.getByRole('heading', { name: `Conectar ${name} con qando`, exact: true, level: 1 }),
    ).toBeVisible();
    // Who asks (its name, and the host its document is published at) and for which account.
    const account = mailbox.addressOf(mySignIn.email || mySession.email);
    await expect(
      consent.getByText(
        `${name} (${assistants.named(name).host}) quiere usar tu cuenta ${account}.`,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(consent.getByRole('listitem')).toHaveText([
      'Ver tus eventos y sus resultados',
      'Crear eventos y gestionarlos por ti (confirmar la fecha, por ejemplo)',
    ]);
    // One answer for everything: nothing to tick.
    await expect(consent.getByRole('checkbox')).toHaveCount(0);
    await expect(consent.getByRole('button', { name: 'Cancelar', exact: true })).toBeVisible();
    await expect(consent.getByRole('button', { name: 'Permitir', exact: true })).toBeVisible();
  },
);

Then('the consent page links to {string}', async ({ page }, name: string) => {
  const link = page.getByRole('main').getByRole('link', { name, exact: true });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/privacy');
});

// The consent page's two answers.
When(/^I press "(Permitir|Cancelar)"$/, async ({ page }, name: string) => {
  await page.getByRole('main').getByRole('button', { name, exact: true }).click();
  // Either answer sends the browser back to the application, whose page is then loaded.
  await page.waitForURL(({ pathname }) => pathname !== '/connect');
});

/** What reading an application's answer needs: the fixtures a step receives. */
interface Answering {
  readonly page: Page;
  readonly playwright: PlaywrightWorkerArgs['playwright'];
  readonly baseURL: string | undefined;
  readonly address: string;
}

/**
 * Waits until the browser is back in the application and reads what it came back with, as the
 * application's server does: from outside the browser, with none of its cookies.
 */
async function answerTo(
  { page, playwright, baseURL, address }: Answering,
  assistant: Assistant,
): Promise<{ readonly access: AccessClaims } | { readonly refused: string }> {
  await page.waitForURL((url) => assistant.isReturn(url.href));
  const client = await playwright.request.newContext({ ...(baseURL && { baseURL }) });
  try {
    return await assistant.answer(client, page.url(), address);
  } finally {
    await client.dispose();
  }
}

/** What allowing an application without a browser needs: the fixtures a step receives. */
interface Allowing extends Answering {
  readonly clock: ScenarioClock;
  readonly mailbox: Mailbox;
  readonly apiSessions: ApiSessions;
}

/**
 * Connects the application to the account of `email` before the scenario's own steps, as the
 * pages do but without a browser: a session of its own, kept for the steps that come back to it,
 * asks, allows, and is sent back.
 */
async function allowed(
  { playwright, baseURL, address, clock, mailbox, apiSessions }: Allowing,
  assistant: Assistant,
  email: string,
): Promise<{ readonly access: AccessClaims } | { readonly refused: string }> {
  const headers = pageHeaders(baseURL, address, clock);
  const client = await apiSessions.open(email);
  // Signed in an hour before the scenario's own time, where it has one: the code the scenario
  // then asks for, to sign its browser in, is not one too many for the same email.
  const before = clock.now && new Date(clock.now.getTime() - 3_600_000).toISOString();
  await signInThroughTheApi(
    client,
    { ...headers, ...(before && { 'x-test-now': before }) },
    mailbox,
    email,
  );
  const asked = await client.get(assistant.request(), { headers, maxRedirects: 0 });
  expect(asked.status()).toBe(302);
  const consentPage = new URL(asked.headers().location ?? '', headers.origin);
  expect(consentPage.pathname).toBe('/connect');
  const answered = await client.post('/api/auth/oauth2/consent', {
    headers,
    data: { accept: true, oauth_query: consentPage.search.slice(1) },
  });
  expect(answered.status()).toBe(200);
  const { url } = (await answered.json()) as { url: string };
  // The application's own server reads the answer: no cookie of the session that allowed it.
  const application = await playwright.request.newContext({ baseURL: headers.origin });
  try {
    return await assistant.answer(application, url, address);
  } finally {
    await application.dispose();
  }
}

/** The access the application was given is the account's, for the connector. */
function expectAccessTo(
  answer: { readonly access: AccessClaims } | { readonly refused: string },
  assistant: Assistant,
  accountId: string | null,
): void {
  if ('refused' in answer) throw new Error(`${assistant.name} was refused: ${answer.refused}`);
  expect(accountId).not.toBeNull();
  expect(answer.access.sub).toBe(accountId);
  expect(answer.access.aud).toBe(assistant.connector);
}

/** What connecting an application needs: the fixtures a step receives. */
interface Connecting extends Allowing {
  readonly seeder: Seeder;
  readonly assistants: Assistants;
}

/**
 * The application named `name` is connected to the account of `email`: after it sent the
 * browser with its request, by the answer the browser comes back with; with no request waiting,
 * here, before the scenario's own steps.
 */
async function connect(fixtures: Connecting, name: string, email: string): Promise<void> {
  const { page, playwright, baseURL, address, mailbox, seeder, assistants } = fixtures;
  const assistant = assistants.named(name);
  const answer = assistant.waits
    ? await answerTo({ page, playwright, baseURL, address }, assistant)
    : await allowed(fixtures, assistant, email);
  expectAccessTo(answer, assistant, await seeder.accountId(mailbox.addressOf(email)));
}

Given(
  '{string} is connected to the account of {string}',
  async (
    { page, playwright, baseURL, address, clock, mailbox, apiSessions, seeder, assistants },
    name: string,
    email: string,
  ) => {
    await connect(
      { page, playwright, baseURL, address, clock, mailbox, apiSessions, seeder, assistants },
      name,
      email,
    );
  },
);

Given(
  '{string} is connected to the account of {string}, who has no events',
  async (
    { page, playwright, baseURL, address, clock, mailbox, apiSessions, seeder, assistants },
    name: string,
    email: string,
  ) => {
    // The email's own to the scenario, and no step stored an event of it: its account is made
    // when the connection signs it in, with no event.
    await connect(
      { page, playwright, baseURL, address, clock, mailbox, apiSessions, seeder, assistants },
      name,
      email,
    );
  },
);

Then(
  '{string} is connected to the account of {string} without the consent page',
  async (
    { page, playwright, baseURL, address, mailbox, seeder, assistants },
    name: string,
    email: string,
  ) => {
    const assistant = assistants.named(name);
    const answer = await answerTo({ page, playwright, baseURL, address }, assistant);
    expectAccessTo(answer, assistant, await seeder.accountId(mailbox.addressOf(email)));
    // The browser went from the request straight back to the application.
    const shown = (shownSince.get(page) ?? []).map((address) => new URL(address).pathname);
    expect(shown).not.toContain('/connect');
    expect(shown).not.toContain('/sign-in');
  },
);

Then(
  '{string} is told that access was denied',
  async ({ page, playwright, baseURL, address, assistants }, name: string) => {
    const answer = await answerTo({ page, playwright, baseURL, address }, assistants.named(name));
    expect(answer).toEqual({ refused: 'access_denied' });
  },
);

// Calling the connector, as the server of a connected application does.

/** The answers the connector gave the scenario's applications, in order. */
const answersTo = new WeakMap<Assistants, Called[]>();

/**
 * Has `assistant` call the tool `name` with `args`, and keeps the answer for the steps that check
 * it.
 */
async function call(
  assistants: Assistants,
  assistant: Assistant,
  name: string,
  args: Record<string, unknown> = {},
): Promise<Called> {
  const answer = await assistant.call(name, args);
  answersTo.set(assistants, [...(answersTo.get(assistants) ?? []), answer]);
  return answer;
}

/** The answer the connector gave last. */
function lastAnswer(assistants: Assistants): Called {
  const answer = answersTo.get(assistants)?.at(-1);
  if (!answer) throw new Error('No application of the scenario has called the connector');
  return answer;
}

/** What a tool answered, which must not be a refusal of the call. */
function answered(called: Called): ToolAnswer {
  if ('unauthorized' in called) throw new Error(`The call was refused: ${called.unauthorized}`);
  return called.answered;
}

/** The events "Ver mis eventos" answered, as its data gives them. */
function listed({ data }: ToolAnswer): readonly Record<string, unknown>[] {
  return (data as { events: Record<string, unknown>[] }).events;
}

/** One parameter of a challenge, `name="value"`. */
function parameterOf(challenge: string, name: string): string | undefined {
  return new RegExp(`(?:^|[ ,])${name}="([^"]*)"`).exec(challenge)?.[1];
}

When('an assistant calls the connector without a token', async ({ assistants }) => {
  await call(assistants, assistants.named('An assistant'), 'list_my_events');
});

Then(
  "it answers 401 with the address of the connector's metadata and every permission to ask for",
  async ({ assistants, request, baseURL }) => {
    const answer = lastAnswer(assistants);
    if (!('unauthorized' in answer)) throw new Error('The call was answered, not refused');
    const challenge = answer.unauthorized;
    expect(challenge).toMatch(/^Bearer /);
    const origin = new URL(baseURL ?? '').origin;
    const metadata = parameterOf(challenge, 'resource_metadata');
    expect(metadata).toBe(`${origin}/.well-known/oauth-protected-resource/api/mcp`);
    expect(parameterOf(challenge, 'scope')).toBe(everyPermission);
    // The address is the connector's metadata, which an application reads to ask for access.
    const read = await request.get(metadata ?? '');
    expect(read.status()).toBe(200);
    expect(await read.json()).toMatchObject({ resource: `${origin}/api/mcp` });
  },
);

// Reading a dates phrase.

/** What "Leer fechas de una frase" answered, as its data gives it. */
interface Reading {
  readonly options: readonly { dates: { kind: string; date?: string }; time: unknown }[];
  readonly questions: readonly Record<string, unknown>[];
  readonly notices: readonly { kind: string; fragment?: string }[];
  readonly timesLeftOut: readonly Record<string, unknown>[];
}

/** The last answer, a reading of a phrase that is not a refusal. */
function lastReading(assistants: Assistants): { text: string; reading: Reading } {
  const answer = answered(lastAnswer(assistants));
  expect(answer.error).toBe(false);
  return { text: answer.text, reading: answer.data as Reading };
}

/** `8:00` → `08:00`, a clock time as the data gives it. */
const clockTime = (time: string) => time.padStart(5, '0');

When('the assistant reads the phrase {string}', async ({ assistants }, phrase: string) => {
  // The organizer's time zone, the scenario's own.
  await call(assistants, assistants.connected, 'read_date_phrase', {
    phrase,
    timeZone: 'Europe/Madrid',
  });
});

Then('it gets the dates {string} and {string}', ({ assistants }, first: string, second: string) => {
  const { text, reading } = lastReading(assistants);
  expect(reading.options.map(({ dates }) => dates.date)).toEqual([first, second]);
  expect(text.split('\n')[0]).toBe('Hemos leído 2 opciones:');
});

Then(
  'the notices name the words {string} and {string}',
  ({ assistants }, first: string, second: string) => {
    const { text, reading } = lastReading(assistants);
    expect(reading.notices.map(({ fragment }) => fragment)).toEqual(
      expect.arrayContaining([first, second]),
    );
    expect(text).toContain(`«${first}»`);
    expect(text).toContain(`«${second}»`);
  },
);

Then(
  'it gets the question whether {string} of {string} is {string} or {string}',
  ({ assistants }, fragment: string, date: string, morning: string, afternoon: string) => {
    const { text, reading } = lastReading(assistants);
    expect(reading.questions).toEqual([
      {
        fragment,
        dates: [date],
        morning: { kind: 'single', at: clockTime(morning) },
        afternoon: { kind: 'single', at: clockTime(afternoon) },
      },
    ]);
    expect(reading.options).toEqual([
      { dates: { kind: 'single', date }, time: { kind: 'question', question: 0 } },
    ]);
    expect(text).toContain(`«${fragment}»`);
    expect(text).toContain(`¿mañana (${morning}) o tarde (${afternoon})?`);
  },
);

Then('the answer leaves that time range out and says why', ({ assistants }) => {
  const { text, reading } = lastReading(assistants);
  expect(reading.options).toEqual([{ dates: { kind: 'single', date: '2026-06-26' }, time: null }]);
  expect(reading.timesLeftOut).toEqual([
    { time: { kind: 'range', start: '20:00', end: '20:30' }, dates: ['2026-06-26'] },
  ]);
  expect(text).toContain(
    'pero no el horario de 20:00 a 20:30: un horario tiene que terminar en una hora posterior a la que empieza. Usa 20:00–21:00 o solo las 20:00.',
  );
});

When('the assistant lists my events', async ({ assistants }) => {
  await call(assistants, assistants.connected, 'list_my_events');
});

Then(
  'it gets {string}, open, with the deadline {string} and {int} voters',
  ({ assistants }, title: string, deadline: string, voters: number) => {
    const answer = answered(lastAnswer(assistants));
    expect(answer.error).toBe(false);
    const event = listed(answer).find((listed) => listed.title === title);
    expect(event).toMatchObject({ title, state: 'open', deadline, voters });
    // The words say the same, the event by the identifier the other tools take it by.
    const day = new Intl.DateTimeFormat('es', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(Date.parse(deadline));
    const voted =
      voters === 0
        ? 'Nadie ha votado todavía'
        : voters === 1
          ? 'Ha votado 1 persona'
          : `Han votado ${voters} personas`;
    expect(answer.text.split('\n')).toContain(
      `- «${title}»: Votación abierta hasta el ${day}. ${voted}. Identificador: ${String(event?.id)}`,
    );
  },
);

Then('it does not get {string}', ({ assistants }, title: string) => {
  const answer = answered(lastAnswer(assistants));
  expect(listed(answer).map((event) => event.title)).not.toContain(title);
  expect(answer.text).not.toContain(`«${title}»`);
});

Then('the answer says in words that the organizer has no events yet', ({ assistants }) => {
  const answer = answered(lastAnswer(assistants));
  expect(answer).toEqual({
    text: 'Aún no has creado ningún evento.',
    data: { events: [] },
    error: false,
  });
});

When(
  'the assistant makes {int} calls in a minute',
  async ({ assistants, clock }, count: number) => {
    // On the scenario's time, which stands still while no step moves it: one minute holds them.
    if (!clock.now) throw new Error('The scenario has not set its time');
    for (let made = 0; made < count; made += 1) {
      await call(assistants, assistants.connected, 'list_my_events');
    }
  },
);

Then('the last one is refused and says how long to wait', ({ assistants }) => {
  const answers = (answersTo.get(assistants) ?? []).map(answered);
  const last = answers.at(-1);
  expect(answers.slice(0, -1).every((answer) => !answer.error)).toBe(true);
  // A whole minute, as every call before it was made at the same time.
  expect(last).toEqual({
    text: 'Demasiadas peticiones seguidas. Podrás volver a intentarlo en 1 min.',
    data: undefined,
    error: true,
  });
});

/** The status the connector answered a page of another site with. */
const answeredToAPage = new WeakMap<Page, number>();

When('a page of another site calls the connector', async ({ page, baseURL, assistants }) => {
  // The site of an application, which exists nowhere: the scenario's browser answers its page.
  await page.goto(new URL(assistants.named('Another site').address).origin);
  const connector = `${new URL(baseURL ?? '').origin}/api/mcp`;
  // The page cannot read the answer, and the browser reports the request as failed: a route
  // sends the page's request on as it is and reads the API's answer on its way back.
  let status: number | undefined;
  await page.route(connector, async (route) => {
    const answer = await route.fetch();
    status = answer.status();
    await route.fulfill({ response: answer });
  });
  // Sent as a form would be, so the browser asks nothing before it: the request any page can
  // send another site.
  await page.evaluate(async (url) => {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }).catch(() => undefined);
  }, connector);
  if (status === undefined) throw new Error('The page did not call the connector');
  answeredToAPage.set(page, status);
});

Then('the call is refused', ({ page }) => {
  // Refused for where it comes from: without a token it would otherwise be a `401`.
  expect(answeredToAPage.get(page)).toBe(403);
});

When(
  '{string} signs out of qando',
  async ({ apiSessions, baseURL, address, clock }, email: string) => {
    // Out of the very session that allowed the application.
    const session = apiSessions.of(email);
    const headers = pageHeaders(baseURL, address, clock);
    expect((await session.post('/api/auth/sign-out', { headers })).status()).toBe(200);
    const signedIn = await session.get('/api/auth/session', { headers });
    expect(await signedIn.json()).toBeNull();
  },
);

When(
  '{string} deletes the account',
  async ({ apiSessions, baseURL, address, clock, mailbox, seeder }, email: string) => {
    const session = apiSessions.of(email);
    const headers = pageHeaders(baseURL, address, clock);
    expect((await session.post('/api/me/deletion-code', { headers })).status()).toBe(200);
    const code = (await mailbox.codesSentTo(email, ['deletion'])).at(-1);
    const deleted = await session.post('/api/me/deletion', { headers, data: { code } });
    expect(deleted.status()).toBe(200);
    expect(await seeder.accountId(mailbox.addressOf(email))).toBeNull();
  },
);

Then('the next call of the assistant is answered 401', async ({ assistants }) => {
  const answer = await call(assistants, assistants.connected, 'list_my_events');
  expect(answer).toHaveProperty('unauthorized');
});

Then('the assistant still lists my events', async ({ assistants, events }) => {
  const answer = answered(await call(assistants, assistants.connected, 'list_my_events'));
  expect(answer.error).toBe(false);
  expect(listed(answer).map((event) => event.title)).toContain(events.latest.title);
});
