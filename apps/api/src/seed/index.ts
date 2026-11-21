// What the acceptance tests and `npm run db:seed` need from the database, by its URL alone: the
// pool, Drizzle and the migrations stay behind it.
import { randomUUID } from 'node:crypto';
import { count, eq, inArray } from 'drizzle-orm';
import pg from 'pg';
import { createDatabase } from '../db/database.js';
import { runMigrations } from '../db/migrate.js';
import { events, sessions, users } from '../db/schema.js';
import { seedEvent, type EventSeed, type SeededEvent, type VoteSeed } from './seed-event.js';
import { storedVotes } from './stored-votes.js';

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

/** A connection that stores whole events (`seedEvent`) and reads their votes back, until closed. */
export interface Seeder {
  seed(seed: EventSeed): Promise<SeededEvent>;
  /** The votes stored for the event of a participation link (`storedVotes`). */
  votesOf(publicId: string): Promise<VoteSeed[]>;
  /**
   * Gives the verified account of an email this name, creating the account if it has none yet,
   * as if it had already created an event: signing in with a code then opens its session.
   */
  nameAccount(email: string, name: string): Promise<void>;
  /** How many events the account of an email owns; none without an account. */
  eventsOwnedBy(email: string): Promise<number>;
  /** The name of the account of an email; `null` when the email has no account. */
  accountName(email: string): Promise<string | null>;
  /** Ends every session of the account of an email, as if each had expired. */
  endSessionsOf(email: string): Promise<void>;
  close(): Promise<void>;
}

export function openSeeder(url: string): Seeder {
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const db = createDatabase(pool);
  return {
    seed: (seed) => seedEvent(db, seed),
    votesOf: (publicId) => storedVotes(db, publicId),
    nameAccount: async (email, name) => {
      // Better Auth stores emails lowercase.
      const stored = email.trim().toLowerCase();
      await db
        .insert(users)
        .values({ id: randomUUID(), name, email: stored, emailVerified: true })
        .onConflictDoUpdate({ target: users.email, set: { name } });
    },
    eventsOwnedBy: async (email) => {
      const [row] = await db
        .select({ owned: count() })
        .from(events)
        .innerJoin(users, eq(users.id, events.ownerId))
        .where(eq(users.email, email.trim().toLowerCase()));
      return row?.owned ?? 0;
    },
    accountName: async (email) => {
      const [row] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.email, email.trim().toLowerCase()));
      return row?.name ?? null;
    },
    endSessionsOf: async (email) => {
      const owner = db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.trim().toLowerCase()));
      await db.delete(sessions).where(inArray(sessions.userId, owner));
    },
    close: () => pool.end(),
  };
}
