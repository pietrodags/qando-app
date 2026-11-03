import pg from 'pg';
import { readMigrationFiles } from 'drizzle-orm/migrator';
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
