import { isProduction } from '@better-auth/core/env';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { createDatabase } from '../../db/database.js';
import type { ErrorLogEntry } from '../../http/error-boundary.js';
import { runMigrations } from '../../db/migrate.js';
import { createFreshDatabase, type FreshDatabase } from '../../test/fresh-database.js';
import { publishedApplications } from '../../test/published-application.js';
import { testDependencies } from '../../test/test-dependencies.js';
import { authorizationServerOf, createAuth } from './auth.js';

// The sign-in library limits requests by itself only in production, and decides so when it is
// loaded: this file loads it as production does, before anything is imported. Its own limit
// reads no client address behind the hosting's proxies, so it would count every caller as one.
vi.hoisted(() => {
  vi.stubEnv('NODE_ENV', 'production');
});

/** Requests one address may send in a minute, over every route of the authorization server. */
const limit = 60;

// The chain the hosting forwards through the web's `/api/*` rewrite (CDN, rewrite proxy, CDN),
// as measured in production.
const throughTheWeb = (client: string) =>
  `${client}, 162.158.42.8, 162.158.42.8,74.220.48.253, 162.158.111.185`;

describe('the authorization server with the sign-in library loaded as in production, against PostgreSQL', () => {
  let database: FreshDatabase;
  let pool: pg.Pool;
  let app: ReturnType<typeof createApp>;
  /** What the app logged of requests that failed. */
  const failures: ErrorLogEntry[] = [];
  /** The applications that publish who they are, read without leaving the computer. */
  const applications = publishedApplications();

  beforeAll(async () => {
    database = await createFreshDatabase();
    pool = new pg.Pool({ connectionString: database.url });
    await runMigrations(pool);
    const auth = createAuth({
      db: createDatabase(pool),
      secret: 'test-secret-for-the-integration-tests-only-0123456789',
      baseURL: 'http://localhost:4200',
      log: () => undefined,
      fetchApplicationDocument: applications.fetch,
    });
    app = createApp({
      ...testDependencies(),
      authorizationServer: authorizationServerOf(auth),
      logError: (entry) => failures.push(entry),
    });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await pool.end();
    await database.drop();
  });

  it('has loaded the sign-in library as production does, without which the next test proves nothing', () => {
    expect(isProduction).toBe(true);
  });

  it('counts each address on its own behind the hosting’s proxies: one that used up its minute asking for tokens does not stop another', async () => {
    const claude = applications.publish('Claude');
    const tokenRefused = { status: 400, error: 'invalid_grant' };
    /** Asks for tokens with a refresh token nobody was given, as an application's server does. */
    const askFrom = async (client: string) => {
      const answer = await request(app)
        .post('/api/auth/oauth2/token')
        .set('X-Forwarded-For', throughTheWeb(client))
        .type('form')
        .send({
          grant_type: 'refresh_token',
          refresh_token: 'a-refresh-token-nobody-was-given',
          client_id: claude.address,
        });
      return { status: answer.status, error: (answer.body as { error?: unknown }).error };
    };
    const answers = [];
    for (let sent = 0; sent < limit; sent += 1) answers.push(await askFrom('203.0.113.7'));

    const usedUp = await askFrom('203.0.113.7');
    const other = await askFrom('198.51.100.9');

    // Each of the sixty reached the token route, which refused the token, not the address.
    expect(answers).toEqual(Array.from({ length: limit }, () => tokenRefused));
    expect(usedUp.status).toBe(429);
    expect(usedUp.error).toMatchObject({ code: 'RATE_LIMITED' });
    expect(other).toEqual(tokenRefused);
    expect(failures).toEqual([]);
  });
});
