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

export const test = base.extend<{ events: StoredEvents }, { seeder: Seeder }>({
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
});
