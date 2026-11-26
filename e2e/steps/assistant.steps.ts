import { expect, type Locator, type Page, type PlaywrightWorkerArgs } from '@playwright/test';
import type { Seeder } from '@qando/api/seed';
import { createBdd, type DataTable } from 'playwright-bdd';
import {
  everyPermission,
  type AccessClaims,
  type Assistant,
  type Assistants,
  type Called,
  type ToolAnswer,
} from '../assistants.js';
import type { Mailbox } from '../mailbox/mailbox.js';
import { summaryEmailsOf, type ReadingEmails } from './emails.steps.js';
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

/** The scenario's own address of the account each application was connected to. */
const accountOf = new WeakMap<Assistant, string>();

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
  accountOf.set(assistant, mailbox.addressOf(email));
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

Then('it gets the options:', ({ assistants }, table: DataTable) => {
  const { text, reading } = lastReading(assistants);
  const options = table.hashes().map(({ date = '', time = '' }) => ({
    dates: { kind: 'single', date },
    time: time === '' ? null : { kind: 'single', at: clockTime(time) },
  }));
  expect(reading.options).toEqual(options);
  expect(text.split('\n')[0]).toBe(
    options.length === 1 ? 'Hemos leído 1 opción:' : `Hemos leído ${options.length} opciones:`,
  );
});

// Creating an event.

/** An option as "Crear un evento" takes it: a day or a range of days, with a time or none. */
interface ProposedOption {
  readonly dates:
    | { readonly kind: 'single'; readonly date: string }
    | { readonly kind: 'range'; readonly start: string; readonly end: string };
  readonly time:
    | null
    | { readonly kind: 'single'; readonly at: string }
    | { readonly kind: 'range'; readonly start: string; readonly end: string };
}

/** An event as "Crear un evento" takes it. */
interface EventSent {
  readonly title: string;
  readonly organizerName?: string;
  readonly options: readonly ProposedOption[];
  readonly deadline: string;
  readonly timeZone: string;
}

/** The organizer's time zone, the scenario's own. */
const timeZone = 'Europe/Madrid';

const wholeDay = (date: string): ProposedOption => ({
  dates: { kind: 'single', date },
  time: null,
});

const dayAt = (date: string, at: string): ProposedOption => ({
  dates: { kind: 'single', date },
  time: { kind: 'single', at },
});

/**
 * An event the web would create on the scenario's day, Monday 15 June: two evenings of the next
 * week, voted on until the day before the first, by Ana, the organizer of the Background's event.
 */
const validEvent = (title: string): EventSent => ({
  title,
  organizerName: 'Ana',
  options: [dayAt('2026-06-26', '21:00'), dayAt('2026-06-27', '21:00')],
  deadline: '2026-06-25',
  timeZone,
});

/** A call to create an event: what it sent, how many events the account owned before, and the answer. */
interface Creation {
  readonly sent: EventSent;
  readonly ownedBefore: number;
  readonly answer: Called;
}

/** The scenario's calls to create an event, in order. */
const creationsOf = new WeakMap<Assistants, Creation[]>();

/** What creating an event needs: the fixtures a step receives. */
interface Creating {
  readonly assistants: Assistants;
  readonly seeder: Seeder;
}

/** The scenario's own address of the account the assistant of the scenario is connected to. */
function connectedAccount(assistants: Assistants): string {
  const account = accountOf.get(assistants.connected);
  if (account === undefined) throw new Error('No step connected the assistant to an account');
  return account;
}

/** Has the assistant of the scenario create the event `sent`, and keeps the call. */
async function create({ assistants, seeder }: Creating, sent: EventSent): Promise<Called> {
  const ownedBefore = await seeder.eventsOwnedBy(connectedAccount(assistants));
  const answer = await call(assistants, assistants.connected, 'create_event', { ...sent });
  creationsOf.set(assistants, [
    ...(creationsOf.get(assistants) ?? []),
    { sent, ownedBefore, answer },
  ]);
  return answer;
}

/** The scenario's last call to create an event. */
function lastCreation(assistants: Assistants): Creation {
  const creation = creationsOf.get(assistants)?.at(-1);
  if (!creation) throw new Error('The assistant has not created any event');
  return creation;
}

/** What an event created answers as data. */
interface Created {
  readonly id: string;
  readonly title: string;
  readonly votingLink: string;
}

/** The data of an answer to create an event, which must say it was created. */
function created(called: Called): Created {
  const { text, error, data } = answered(called);
  expect(error, text).toBe(false);
  return data as Created;
}

/** The answer to an event that was not created, with each of its problems on a line. */
const notCreated = (...problems: readonly string[]): ToolAnswer => ({
  text: ['No se ha creado el evento:', ...problems.map((problem) => `- ${problem}`)].join('\n'),
  data: undefined,
  error: true,
});

When(
  'the assistant creates the event {string} with those options and the deadline {string}',
  async ({ assistants, seeder }, title: string, deadline: string) => {
    const { reading } = lastReading(assistants);
    // As an assistant sends it: with no name, which is then the one of the account's last event.
    await create(
      { assistants, seeder },
      { title, options: reading.options as ProposedOption[], deadline, timeZone },
    );
  },
);

When(
  'the assistant creates the event {string} with the date {string} from {string} to {string}',
  async ({ assistants, seeder }, title: string, date: string, start: string, end: string) => {
    const options: ProposedOption[] = [
      { dates: { kind: 'single', date }, time: { kind: 'range', start, end } },
    ];
    await create({ assistants, seeder }, { ...validEvent(title), options });
  },
);

/** "2026-07-03": the day `days` after `date`. */
const dayAfter = (date: string, days: number): string =>
  new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);

/** The event each row of a scenario breaks one thing of. */
const cena = validEvent('Cena');

/** Each thing a scenario breaks in an event otherwise valid, and the problem the answer names. */
const broken: Record<string, { readonly event: EventSent; readonly problem: string }> = {
  'no title': { event: { ...cena, title: '' }, problem: 'Falta el título.' },
  'no options': { event: { ...cena, options: [] }, problem: 'Falta al menos una fecha.' },
  '61 options': {
    // Each a whole day of July and August, after the deadline.
    event: {
      ...cena,
      options: Array.from({ length: 61 }, (_, day) => wholeDay(dayAfter('2026-07-01', day))),
    },
    problem: 'Son demasiadas fechas (máximo 60).',
  },
  'a date before today': {
    event: { ...cena, options: [wholeDay('2026-06-10'), ...cena.options] },
    problem: 'El 10 de junio ya ha pasado.',
  },
  'a date more than 12 months ahead': {
    // The scenario's day twelve months later, 15 June, is the last a date can be.
    event: { ...cena, options: [...cena.options, wholeDay('2027-06-16')] },
    problem: 'Solo puedes proponer fechas de los próximos 12 meses.',
  },
  'a deadline before today': {
    event: { ...cena, deadline: '2026-06-14' },
    problem: 'El plazo para votar ya ha pasado.',
  },
};

/** The problem the event the assistant sent last was sent with. */
const problemSent = new WeakMap<Assistants, string>();

When(
  new RegExp(`^the assistant creates an event with (${Object.keys(broken).join('|')})$`),
  async ({ assistants, seeder }, problem: string) => {
    const row = broken[problem];
    if (!row) throw new Error(`No event is sent with ${problem}`);
    problemSent.set(assistants, row.problem);
    await create({ assistants, seeder }, row.event);
  },
);

Then('nothing is created', async ({ assistants, seeder }) => {
  const { answer, ownedBefore } = lastCreation(assistants);
  expect(answered(answer).error).toBe(true);
  expect(await seeder.eventsOwnedBy(connectedAccount(assistants))).toBe(ownedBefore);
});

Then('the answer names the problem', ({ assistants }) => {
  const problem = problemSent.get(assistants);
  if (problem === undefined) throw new Error('No step sent an event with a problem');
  expect(answered(lastAnswer(assistants))).toEqual(notCreated(problem));
});

Then(
  'the answer says that a time range must end in a later hour than it starts',
  ({ assistants }) => {
    // The scenario's range, 20:00–20:30, and the two ways the web offers instead.
    expect(answered(lastAnswer(assistants))).toEqual(
      notCreated(
        'Un horario tiene que terminar en una hora posterior a la que empieza: en lugar de 20:00–20:30, usa 20:00–21:00 o solo las 20:00.',
      ),
    );
  },
);

/** Every address written in `said`: the words of an answer, or its data as JSON. */
const addressesIn = (said: string): string[] => said.match(/https?:\/\/[^\s"]+/g) ?? [];

Then(
  'the answer gives the voting link, and neither the management link nor the results link',
  ({ assistants, baseURL }) => {
    // Any tool's answer that gives an event: its identifier and voting link in the data.
    const { text, data, error } = answered(lastAnswer(assistants));
    expect(error).toBe(false);
    const { id, votingLink } = data as { id: string; votingLink: string };
    expect(votingLink).toBe(new URL(`/vote/${id}`, baseURL).href);
    expect(text).toContain(votingLink);
    // The voting link is the only address the answer carries, in its words or in its data.
    const json = JSON.stringify(data);
    expect(new Set([...addressesIn(text), ...addressesIn(json)])).toEqual(new Set([votingLink]));
    for (const said of [text, json]) expect(said).not.toMatch(/\/(manage|results)\b/);
  },
);

Given(
  'the assistant has created the event {string}',
  async ({ assistants, seeder }, title: string) => {
    created(await create({ assistants, seeder }, validEvent(title)));
  },
);

When(
  'the assistant creates the same event again {int} minutes later',
  async ({ assistants, seeder, clock }, minutes: number) => {
    const { sent } = lastCreation(assistants);
    await clock.advance(minutes * 60_000);
    await create({ assistants, seeder }, sent);
  },
);

/** The voting links of the scenario's last two calls to create an event, each answered as created. */
function lastTwoVotingLinks(assistants: Assistants): [string, string] {
  const [earlier, later] = (creationsOf.get(assistants) ?? [])
    .slice(-2)
    .map(({ answer }) => created(answer).votingLink);
  if (earlier === undefined || later === undefined) {
    throw new Error('The assistant has not created two events');
  }
  return [earlier, later];
}

Then('it gets the same voting link', ({ assistants }) => {
  const [earlier, later] = lastTwoVotingLinks(assistants);
  expect(later).toBe(earlier);
});

Then('it gets another voting link', ({ assistants }) => {
  const [earlier, later] = lastTwoVotingLinks(assistants);
  expect(later).not.toBe(earlier);
});

/** The event `title` the assistant of the scenario created first, as its answer gave it. */
function firstCreated(assistants: Assistants, title: string): Created {
  const event = (creationsOf.get(assistants) ?? [])
    .map(({ answer }) => answered(answer))
    .find(({ error, data }) => !error && (data as Created).title === title);
  if (!event) throw new Error(`The assistant has not created "${title}"`);
  return event.data as Created;
}

/** What seeing "Mis eventos" needs: the fixtures a step receives. */
interface SeeingMyEvents {
  readonly page: Page;
  readonly baseURL: string | undefined;
  readonly address: string;
  readonly clock: ScenarioClock;
  readonly mailbox: Mailbox;
}

/**
 * Signs the scenario's browser in as the address a step names and opens "Mis eventos", once it
 * shows `title`: the rows that name it.
 */
async function myEventsNaming(
  { page, baseURL, address, clock, mailbox }: SeeingMyEvents,
  email: string,
  title: string,
): Promise<Locator> {
  // Through the browser's own requests, so the browser holds the session's cookie.
  await signInThroughTheApi(page.request, pageHeaders(baseURL, address, clock), mailbox, email);
  await page.goto('/my-events');
  await expect(page.getByRole('heading', { level: 1, name: 'Mis eventos' })).toBeVisible();
  const rows = page.getByRole('main').getByRole('listitem').filter({ hasText: title });
  await expect(rows.first()).toBeVisible();
  return rows;
}

Then(
  '{string} sees {string} in "Mis eventos"',
  async ({ page, baseURL, address, clock, mailbox }, email: string, title: string) => {
    await myEventsNaming({ page, baseURL, address, clock, mailbox }, email, title);
  },
);

Then(
  '{string} sees {string} once in "Mis eventos"',
  async ({ page, baseURL, address, clock, mailbox }, email: string, title: string) => {
    const rows = await myEventsNaming({ page, baseURL, address, clock, mailbox }, email, title);
    await expect(rows).toHaveCount(1);
  },
);

/**
 * The address a step names has received one summary email of the event `title` the assistant
 * created: with its voting link, and the management link the assistant's answer never gives.
 */
async function expectOneSummary(
  fixtures: ReadingEmails,
  assistants: Assistants,
  email: string,
  title: string,
): Promise<void> {
  const { id, votingLink } = firstCreated(assistants, title);
  const summaries = await summaryEmailsOf(fixtures, email, title);
  expect(summaries).toHaveLength(1);
  const text = summaries[0]?.text ?? '';
  expect(text).toContain(`: ${votingLink}\n`);
  expect(text).toContain(`: ${new URL(`/manage/${id}`, fixtures.baseURL).href}\n`);
}

Then(
  '{string} receives the summary email of {string}',
  async (
    { request, baseURL, address, clock, mailbox, assistants },
    email: string,
    title: string,
  ) => {
    await expectOneSummary({ request, baseURL, address, clock, mailbox }, assistants, email, title);
  },
);

Then(
  '{string} has received one summary email of {string}',
  async (
    { request, baseURL, address, clock, mailbox, assistants },
    email: string,
    title: string,
  ) => {
    await expectOneSummary({ request, baseURL, address, clock, mailbox }, assistants, email, title);
  },
);

Given(
  'the assistant has created {int} different events in the last hour',
  async ({ assistants, seeder }, count: number) => {
    // At the scenario's time, which stands still while no step moves it: all within the hour.
    for (let number = 1; number <= count; number += 1) {
      created(await create({ assistants, seeder }, validEvent(`Evento ${number}`)));
    }
  },
);

When('the assistant creates one more event', async ({ assistants, seeder }) => {
  await create({ assistants, seeder }, validEvent('Un evento más'));
});

Then('the answer says how long to wait', ({ assistants }) => {
  const { text, data, error } = answered(lastAnswer(assistants));
  expect(error).toBe(true);
  expect(data).toBeUndefined();
  const wait =
    /^Has creado 10 eventos en la última hora, que es el máximo\. Podrás crear otro en (\d+) min\.$/.exec(
      text,
    );
  expect(wait, text).not.toBeNull();
  // Within the hour that the first of them frees its place.
  const minutes = Number(wait?.[1]);
  expect(minutes).toBeGreaterThanOrEqual(1);
  expect(minutes).toBeLessThanOrEqual(60);
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
