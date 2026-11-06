// What the acceptance tests and `npm run db:seed` need from the database, by its URL alone: the
// pool, Drizzle and the migrations stay behind it.
import pg from 'pg';
import { createDatabase } from '../db/database.js';
import { runMigrations } from '../db/migrate.js';
import { seedEvent, type EventSeed, type SeededEvent } from './seed-event.js';

export type { EventSeed, OptionSeed, Outcome, SeededEvent, VoteSeed } from './seed-event.js';

/** Applies the migrations the database at `url` has not run yet. */
export async function migrateDatabase(url: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}

/** A connection that stores whole events (`seedEvent`), until it is closed. */
export interface Seeder {
  seed(seed: EventSeed): Promise<SeededEvent>;
  close(): Promise<void>;
}

export function openSeeder(url: string): Seeder {
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const db = createDatabase(pool);
  return {
    seed: (seed) => seedEvent(db, seed),
    close: () => pool.end(),
  };
}
