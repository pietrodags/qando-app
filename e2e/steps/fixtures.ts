import { randomBytes } from 'node:crypto';
import type { APIRequestContext, BrowserContext, Page, Request } from '@playwright/test';
import {
  openSeeder,
  type EventSeed,
  type SeededEvent,
  type Seeder,
  type StoredRows,
  type VoteSeed,
} from '@qando/api/seed';
import { test as base } from 'playwright-bdd';
import { RestartedApi } from '../api-process.js';
import { Assistants } from '../assistants.js';
import { databaseUrl } from '../database-url.js';
import { Mailbox } from '../mailbox/mailbox.js';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * The events a scenario stored, by title, so later steps open them by the name they read. Each is
 * an event its organizer had before the scenario's time: once the scenario has set its time, it is
 * stamped as created the day before, a minute after the one stored before it, so the events an
 * account created "in the last hour" or "last" are only those the scenario creates through the API.
 */
export class StoredEvents {
  readonly #seeder: Seeder;
  readonly #clock: ScenarioClock;
  readonly #byTitle = new Map<string, { seed: EventSeed; seeded: SeededEvent }>();
  #latest: SeededEvent | undefined;
  #stored = 0;
  /** The event a step opened last, by title, for the steps that say "its" ("its management page"). */
  opened: string | undefined;
  /** The page it was opened on, when not the scenario's own (a new browser's). */
  openedOn: Page | undefined;

  constructor(seeder: Seeder, clock: ScenarioClock) {
    this.#seeder = seeder;
    this.#clock = clock;
  }

  async store(seed: EventSeed): Promise<SeededEvent> {
    const seeded = await this.storeApart(seed);
    this.#byTitle.set(seed.title, { seed, seeded });
    this.#latest = seeded;
    return seeded;
  }

  /** Stores an event the later steps do not mean by its title, nor as the latest one. */
  storeApart(seed: EventSeed): Promise<SeededEvent> {
    const now = this.#clock.now;
    this.#stored += 1;
    if (!now) return this.#seeder.seed(seed);
    const createdAt = new Date(now.getTime() - DAY_MS + this.#stored * MINUTE_MS);
    return this.#seeder.seed({ ...seed, createdAt });
  }

  /** The event stored last: the one a step means when it names none ("the participation link"). */
  get latest(): SeededEvent {
    if (!this.#latest) throw new Error('The scenario stored no event');
    return this.#latest;
  }

  /**
   * The votes stored for the event, each with its states in the order of the event's options.
   * Read from the database until the results page exists (HU07).
   */
  votesOf(title: string): Promise<VoteSeed[]> {
    return this.#seeder.votesOf(this.get(title).seeded.publicId);
  }

  /** The rows the event's ID still has in each table that hangs from it. */
  rowsOf(title: string): Promise<StoredRows> {
    const { eventId } = this.get(title).seeded;
    if (eventId === null) throw new Error(`"${title}" was stored cancelled: it has no rows`);
    return this.#seeder.rowsOf(eventId);
  }

  get(title: string): { seed: EventSeed; seeded: SeededEvent } {
    const stored = this.#byTitle.get(title);
    if (!stored) throw new Error(`The scenario stored no event "${title}"`);
    return stored;
  }
}

/**
 * The scenario's time, read alike by the browser and the API: the browser's `Date` is frozen on
 * it and every API request from the scenario's browsers names it in `X-Test-Now`, which the API
 * honours only when started with `QANDO_TEST_CLOCK=on` (playwright.config.ts). Until a step sets
 * it, both read the real time.
 */
export class ScenarioClock {
  readonly #pages: Page[] = [];
  #now: Date | undefined;

  /** The time the scenario set, if any. */
  get now(): Date | undefined {
    return this.#now;
  }

  async set(now: Date): Promise<void> {
    this.#now = now;
    await Promise.all(this.#pages.map((page) => page.clock.setFixedTime(now)));
  }

  /** Moves the time the scenario set forward: "30 seconds have passed". */
  async advance(ms: number): Promise<void> {
    if (!this.#now) throw new Error('The scenario has not set its time');
    await this.set(new Date(this.#now.getTime() + ms));
  }

  /** Puts `page` on the scenario's time, now and whenever it is set again. */
  async follow(page: Page): Promise<void> {
    this.#pages.push(page);
    if (this.#now) await page.clock.setFixedTime(this.#now);
  }
}

/** The headers that send an API request on the scenario's time and from its client address. */
export function scenarioHeaders(clock: ScenarioClock, address: string): Record<string, string> {
  const now = clock.now;
  return { 'x-forwarded-for': address, ...(now && { 'x-test-now': now.toISOString() }) };
}

/**
 * Sends every API request of `context` on the scenario's time and from the scenario's own client
 * address. The address goes in `X-Forwarded-For`, which the API reads behind a trusted proxy, as
 * the local dev server is: each scenario then has its own rate-limit count instead of every
 * scenario sharing localhost's 60 requests a minute.
 */
async function sendAsTheScenario(
  context: BrowserContext,
  clock: ScenarioClock,
  address: string,
): Promise<void> {
  await context.route('**/api/**', async (route) => {
    const headers = { ...route.request().headers(), ...scenarioHeaders(clock, address) };
    if (!route.request().isNavigationRequest()) {
      await route.continue({ headers });
      return;
    }
    // A page opened at the API itself: the authorization server, which answers by sending the
    // browser on. Sent to another site (an application's, which in a scenario exists nowhere),
    // the browser gets a page that goes there instead of the redirect: a route answers a page's
    // navigation, and never the address a redirect leads to.
    const answer = await route.fetch({ headers, maxRedirects: 0 });
    const asked = new URL(route.request().url());
    const sentTo = answer.headers().location;
    const target = sentTo === undefined ? asked : new URL(sentTo, asked);
    if (target.origin === asked.origin) {
      await route.fulfill({ response: answer });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Leaving</title>
<script>location.replace(${JSON.stringify(target.href)})</script></head><body></body></html>`,
    });
  });
}

/**
 * A documentation address (2001:db8::/32) of its own: the API counts IPv6 clients per /56, so
 * the random part fills the bits up to it.
 */
function scenarioAddress(): string {
  const hex = randomBytes(3).toString('hex');
  return `2001:db8:${hex.slice(0, 4)}:${hex.slice(4)}00::1`;
}

/** Browsers other than the scenario's own: each a fresh one, on the scenario's time and address. */
export class OtherBrowsers {
  readonly #open: () => Promise<BrowserContext>;
  readonly #clock: ScenarioClock;
  readonly #contexts: BrowserContext[] = [];

  constructor(open: () => Promise<BrowserContext>, clock: ScenarioClock) {
    this.#open = open;
    this.#clock = clock;
  }

  /** A page in a new browser, which shares nothing (storage, cookies) with the others. */
  async page(): Promise<Page> {
    const context = await this.#open();
    this.#contexts.push(context);
    const page = await context.newPage();
    await this.#clock.follow(page);
    return page;
  }

  async close(): Promise<void> {
    await Promise.all(this.#contexts.map((context) => context.close()));
  }
}

/** The vote the scenario cast through a page, for the steps that come back to it. */
export class MyVote {
  name = '';
  /** Each option's answer, by its ISO date. */
  answers: Record<string, string> = {};
  /** The private edit link the thank-you screen gave. */
  link = '';
  /** Whether the first step showed a name field (anonymous events never ask for one). */
  askedForName = false;
  /** The page the scenario votes on now: its own, or one in another browser. */
  page: Page;

  constructor(page: Page) {
    this.page = page;
  }
}

/** The answer the API gave to a request a step sent it directly, for the step that checks it. */
export class ApiAnswer {
  status = 0;
  /** The answer's JSON body, for a step that reads why a request was refused. */
  body: unknown = undefined;
}

/** The date the scenario confirmed through the API, for the step that checks it stayed. */
export class MyConfirmation {
  /** The confirmed option's ISO date; empty until the scenario confirms one. */
  date = '';
}

/**
 * What the scenario asked the smart calendar for: the phrase written last in its box, and every
 * request the scenario's browser made from its first page on, for the steps that check where
 * they went.
 */
export class Asked {
  phrase = '';
  readonly requests: Request[] = [];

  /** The requests that asked the API to read a phrase. */
  get readings(): Request[] {
    return this.requests.filter(
      (request) => new URL(request.url()).pathname === '/api/date-interpretations',
    );
  }
}

/**
 * The sign-in the scenario is in the middle of, or the deletion of its account, for the steps
 * that type its codes.
 */
export class MySignIn {
  /** The email the code was sent to, as the step named it. */
  email = '';
  /** The wrong codes typed so far: the page does not send again the one it was just refused. */
  readonly wrongCodes: string[] = [];
  /** The private page the scenario opened without a session: where signing in comes back to. */
  askedFrom = '';
}

/** The session the scenario's browser signed in with, for the steps that come back to it. */
export class MySession {
  /** The account's email, as the step named it. */
  email = '';
  /** The session's cookie, `name=value`, as the browser sent it while signed in. */
  cookie = '';
}

/**
 * The sessions steps signed in through the API, apart from the scenario's browsers, each kept by
 * the email it is of (as a step names it) for the steps that come back to it: the account that
 * allowed an application signs out of that very session, or deletes itself from it.
 */
export class ApiSessions {
  readonly #open: () => Promise<APIRequestContext>;
  readonly #byEmail = new Map<string, APIRequestContext>();

  constructor(open: () => Promise<APIRequestContext>) {
    this.#open = open;
  }

  /** A new client, without cookies, kept as the session of `email` once it is signed in. */
  async open(email: string): Promise<APIRequestContext> {
    if (this.#byEmail.has(email)) throw new Error(`The scenario already has a session of ${email}`);
    const client = await this.#open();
    this.#byEmail.set(email, client);
    return client;
  }

  /** Whether the scenario has signed a client in as `email`. */
  has(email: string): boolean {
    return this.#byEmail.has(email);
  }

  of(email: string): APIRequestContext {
    const client = this.#byEmail.get(email);
    if (!client) throw new Error(`The scenario has no session of ${email}`);
    return client;
  }

  async close(): Promise<void> {
    await Promise.all([...this.#byEmail.values()].map((client) => client.dispose()));
  }
}

/** The event the scenario makes through the wizard, for the steps that come back to it. */
export class MyEvent {
  /** The title the wizard was given. */
  title = '';
  /** The dates the wizard was given, each as its step wrote it: a date or a range of days. */
  dates: string[] = [];
  /** The note the wizard was given; empty while none was written. */
  note = '';
  /** The event's options as participants were served them once it was created. */
  served: unknown = undefined;
}

export const test = base.extend<
  {
    myEvent: MyEvent;
    restartedApi: RestartedApi;
    events: StoredEvents;
    clock: ScenarioClock;
    address: string;
    otherBrowsers: OtherBrowsers;
    myVote: MyVote;
    apiAnswer: ApiAnswer;
    myConfirmation: MyConfirmation;
    asked: Asked;
    mailbox: Mailbox;
    mySignIn: MySignIn;
    mySession: MySession;
    apiSessions: ApiSessions;
    assistants: Assistants;
  },
  { seeder: Seeder }
>({
  seeder: [
    // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a fixture needs from this pattern.
    async ({}, use) => {
      if (process.env.E2E_BASE_URL) {
        throw new Error('Scenarios that store events run only locally and in CI, never deployed');
      }
      const seeder = openSeeder(databaseUrl());
      await use(seeder);
      await seeder.close();
    },
    { scope: 'worker' },
  ],
  // A scenario tagged @touch runs in a browser with a touch screen and no mouse: its pages match
  // `(hover: none), (pointer: coarse)`, and its steps can press with a finger.
  hasTouch: async ({ $tags }, use) => {
    await use($tags.includes('@touch'));
  },
  events: async ({ seeder, clock }, use) => {
    await use(new StoredEvents(seeder, clock));
  },
  // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a fixture needs from this pattern.
  address: async ({}, use) => {
    await use(scenarioAddress());
  },
  clock: async ({ context, page, address }, use) => {
    const clock = new ScenarioClock();
    await sendAsTheScenario(context, clock, address);
    await clock.follow(page);
    await use(clock);
  },
  // Other browsers open at the project's width, like the scenario's own.
  otherBrowsers: async (
    { browser, baseURL, locale, timezoneId, viewport, clock, address },
    use,
  ) => {
    const browsers = new OtherBrowsers(async () => {
      const context = await browser.newContext({
        ...(baseURL !== undefined && { baseURL }),
        ...(locale !== undefined && { locale }),
        ...(timezoneId !== undefined && { timezoneId }),
        viewport,
      });
      await sendAsTheScenario(context, clock, address);
      return context;
    }, clock);
    await use(browsers);
    await browsers.close();
  },
  myVote: async ({ page }, use) => {
    await use(new MyVote(page));
  },
  // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a fixture needs from this pattern.
  apiAnswer: async ({}, use) => {
    await use(new ApiAnswer());
  },
  // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a fixture needs from this pattern.
  myConfirmation: async ({}, use) => {
    await use(new MyConfirmation());
  },
  // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a fixture needs from this pattern.
  mailbox: async ({}, use) => {
    await use(new Mailbox());
  },
  // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a fixture needs from this pattern.
  mySignIn: async ({}, use) => {
    await use(new MySignIn());
  },
  // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a fixture needs from this pattern.
  mySession: async ({}, use) => {
    await use(new MySession());
  },
  apiSessions: async ({ playwright, baseURL }, use) => {
    if (!baseURL) throw new Error('The run has no base URL');
    const sessions = new ApiSessions(() =>
      playwright.request.newContext({ baseURL: new URL(baseURL).origin }),
    );
    await use(sessions);
    await sessions.close();
  },
  // The applications that ask to connect, their pages answered in the scenario's own browser;
  // their calls to the connector go on the scenario's time and from its client address.
  assistants: async ({ context, baseURL, clock, address }, use) => {
    if (!baseURL) throw new Error('The run has no base URL');
    const assistants = new Assistants(new URL(baseURL).origin, () =>
      scenarioHeaders(clock, address),
    );
    await assistants.serveIn(context);
    await use(assistants);
  },
  // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a fixture needs from this pattern.
  myEvent: async ({}, use) => {
    await use(new MyEvent());
  },
  // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a fixture needs from this pattern.
  restartedApi: async ({}, use) => {
    const api = new RestartedApi();
    await use(api);
    api.stop();
  },
  // From before the scenario's first step: the steps of a feature's Background are run before
  // the fixtures that only a later step names are set up.
  asked: [
    async ({ context }, use) => {
      const asked = new Asked();
      context.on('request', (request) => asked.requests.push(request));
      await use(asked);
    },
    { auto: true },
  ],
});
