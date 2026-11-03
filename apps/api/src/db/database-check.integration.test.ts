import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFreshDatabase, type FreshDatabase } from '../test/fresh-database.js';
import { createDatabaseCheck } from './database-check.js';

describe('createDatabaseCheck against PostgreSQL', () => {
  let database: FreshDatabase;

  beforeAll(async () => {
    database = await createFreshDatabase();
  });

  afterAll(async () => {
    await database.drop();
  });

  it('is up when the server answers', async () => {
    const pool = new pg.Pool({ connectionString: database.url });

    try {
      expect(await createDatabaseCheck(pool)()).toBe(true);
    } finally {
      await pool.end();
    }
  });

  it('is down when nothing listens at the address', async () => {
    const pool = new pg.Pool({
      connectionString: 'postgres://nobody@127.0.0.1:1/none',
      connectionTimeoutMillis: 500,
    });
    pool.on('error', () => undefined);

    try {
      expect(await createDatabaseCheck(pool)()).toBe(false);
    } finally {
      await pool.end();
    }
  });
});
