import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFreshDatabase, type FreshDatabase } from '../test/fresh-database.js';
import { migrationsFolder, runMigrations } from './migrate.js';

describe('runMigrations', () => {
  let database: FreshDatabase;
  let pool: pg.Pool;

  beforeAll(async () => {
    database = await createFreshDatabase();
    pool = new pg.Pool({ connectionString: database.url });
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
  });

  async function appliedMigrations(): Promise<string[]> {
    const result = await pool.query<{ hash: string }>(
      'SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at',
    );
    return result.rows.map((row) => row.hash);
  }

  it('applies every migration in the repository to an empty database', async () => {
    await runMigrations(pool);

    const expected = readMigrationFiles({ migrationsFolder }).map((migration) => migration.hash);
    expect(expected.length).toBeGreaterThan(0);
    expect(await appliedMigrations()).toEqual(expected);
  });

  it('applies nothing again when the database is up to date', async () => {
    const before = await appliedMigrations();

    await runMigrations(pool);

    expect(await appliedMigrations()).toEqual(before);
  });
});

describe('the migration that gives every event an owner', () => {
  let database: FreshDatabase;
  let pool: pg.Pool;
  let earlier: string;

  beforeAll(async () => {
    database = await createFreshDatabase();
    pool = new pg.Pool({ connectionString: database.url });
    earlier = await migrationsBefore('0003_users_sessions_verifications');
    await migrate(drizzle({ client: pool }), { migrationsFolder: earlier });
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
    await rm(earlier, { recursive: true, force: true });
  });

  /** Inserts an event as it was stored before accounts existed. */
  async function eventBeforeAccounts(organizerName: string, organizerEmail: string) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO events (public_id, results_id, management_token_hash, organizer_name,
         organizer_email, title, time_zone, deadline, closes_at, anonymous)
       VALUES ($1, $2, $3, $4, $5, 'Cena', 'Europe/Madrid', '2026-12-01',
         '2026-12-01T22:59:59Z', false)
       RETURNING id`,
      [randomUUID(), randomUUID(), randomUUID(), organizerName, organizerEmail],
    );
    return result.rows[0]!.id;
  }

  it('gives each existing event the verified account of its organizer email', async () => {
    const first = await eventBeforeAccounts('Ana', 'ana@example.com');
    const second = await eventBeforeAccounts('Ana G.', ' Ana@Example.com ');
    const other = await eventBeforeAccounts('Bea', 'bea@example.com');

    await runMigrations(pool);

    const owners = await pool.query<{
      event: string;
      email: string;
      name: string;
      email_verified: boolean;
    }>(
      `SELECT e.id AS event, u.email, u.name, u.email_verified
       FROM events e JOIN users u ON u.id = e.owner_id`,
    );
    const ownerOf = new Map(owners.rows.map((row) => [row.event, row]));
    expect(ownerOf.get(first)).toEqual({
      event: first,
      email: 'ana@example.com',
      name: 'Ana',
      email_verified: true,
    });
    expect(ownerOf.get(second)?.email).toBe('ana@example.com');
    expect(ownerOf.get(other)).toMatchObject({ email: 'bea@example.com', name: 'Bea' });
    const accounts = await pool.query('SELECT id FROM users');
    expect(accounts.rowCount).toBe(2);
  });
});

/**
 * A copy of the migrations folder that stops before `tag`, to build the database as it was
 * before that migration ran.
 */
async function migrationsBefore(tag: string): Promise<string> {
  const copy = await mkdtemp(join(tmpdir(), 'qando-migrations-'));
  await cp(migrationsFolder, copy, { recursive: true });
  const journalPath = join(copy, 'meta', '_journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
    entries: { idx: number; tag: string }[];
  };
  const cut = journal.entries.findIndex((entry) => entry.tag === tag);
  if (cut < 0) throw new Error(`No migration ${tag}`);
  journal.entries = journal.entries.slice(0, cut);
  await writeFile(journalPath, JSON.stringify(journal));
  return copy;
}
