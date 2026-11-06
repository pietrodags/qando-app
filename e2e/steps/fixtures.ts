import { randomBytes } from 'node:crypto';
import type { BrowserContext, Page } from '@playwright/test';
import { openSeeder, type EventSeed, type SeededEvent, type Seeder } from '@qando/api/seed';
import { test as base } from 'playwright-bdd';
import { databaseUrl } from '../global-setup.js';

/** The events a scenario stored, by title, so later steps open them by the name they read. */
export class StoredEvents {
  readonly #seeder: Seeder;
  readonly #byTitle = new Map<string, { seed: EventSeed; seeded: SeededEvent }>();

  constructor(seeder: Seeder) {
    this.#seeder = seeder;
  }

  async store(seed: EventSeed): Promise<SeededEvent> {
    const seeded = await this.#seeder.seed(seed);
    this.#byTitle.set(seed.title, { seed, seeded });
    return seeded;
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

  /** Puts `page` on the scenario's time, now and whenever it is set again. */
  async follow(page: Page): Promise<void> {
    this.#pages.push(page);
    if (this.#now) await page.clock.setFixedTime(this.#now);
  }
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
    const now = clock.now;
    await route.continue({
      headers: {
        ...route.request().headers(),
        'x-forwarded-for': address,
        ...(now && { 'x-test-now': now.toISOString() }),
      },
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

export const test = base.extend<{ events: StoredEvents; clock: ScenarioClock }, { seeder: Seeder }>(
  {
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
    events: async ({ seeder }, use) => {
      await use(new StoredEvents(seeder));
    },
    clock: async ({ context, page }, use) => {
      const clock = new ScenarioClock();
      await sendAsTheScenario(context, clock, scenarioAddress());
      await clock.follow(page);
      await use(clock);
    },
  },
);
