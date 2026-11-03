import { randomBytes } from 'node:crypto';
import pg from 'pg';

/** A database created empty for one test file and dropped afterwards. */
export interface FreshDatabase {
  url: string;
  drop(): Promise<void>;
}

/** The server the integration tests use; CI runs a PostgreSQL service for it. */
export function testServerUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set: integration tests need a PostgreSQL server ' +
        '(e.g. postgres://postgres:postgres@localhost:5432/postgres)',
    );
  }
  return url;
}

export async function createFreshDatabase(): Promise<FreshDatabase> {
  const serverUrl = testServerUrl();
  const name = `qando_test_${randomBytes(6).toString('hex')}`;
  await withAdmin(serverUrl, (admin) => admin.query(`CREATE DATABASE ${name}`));

  const url = new URL(serverUrl);
  url.pathname = `/${name}`;

  return {
    url: url.toString(),
    drop: () =>
      withAdmin(serverUrl, (admin) => admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)),
  };
}

async function withAdmin(serverUrl: string, run: (admin: pg.Client) => Promise<unknown>) {
  const admin = new pg.Client({ connectionString: serverUrl });
  await admin.connect();
  try {
    await run(admin);
  } finally {
    await admin.end();
  }
}
