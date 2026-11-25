import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { createDatabase } from '../../db/database.js';
import { runMigrations } from '../../db/migrate.js';
import { createFreshDatabase, type FreshDatabase } from '../../test/fresh-database.js';
import { answerConsent, askToConnect, exchangeCode } from '../../test/published-application.js';
import { testDependencies } from '../../test/test-dependencies.js';
import { authorizationServerOf, connectionRequestsOf, createAuth, sessionsOf } from './auth.js';
import { exampleApplications } from './example-applications.js';

const origin = 'http://localhost:4200';

describe('an example application, against PostgreSQL', () => {
  let database: FreshDatabase;
  let pool: pg.Pool;
  let auth: ReturnType<typeof createAuth>;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    database = await createFreshDatabase();
    pool = new pg.Pool({ connectionString: database.url });
    await runMigrations(pool);
    const db = createDatabase(pool);
    auth = createAuth({
      db,
      secret: 'test-secret-for-the-integration-tests-only-0123456789',
      baseURL: origin,
      log: (entry) => {
        throw new Error(`The sign-in library reported ${JSON.stringify(entry)}`);
      },
      fetchApplicationDocument: exampleApplications,
    });
    app = createApp({
      ...testDependencies(),
      sessions: sessionsOf(auth),
      authorizationServer: authorizationServerOf(auth),
      connectionRequests: connectionRequestsOf(auth, db),
    });
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
  });

  it('is taken by the authorization server, named on the consent page and connected', async () => {
    const application = {
      address: 'https://a1b2.example/Claude.json',
      redirectUri: 'https://a1b2.example/callback',
    };
    const otp = await auth.api.createVerificationOTP({
      body: { email: 'ana@example.com', type: 'sign-in' },
    });
    const { headers } = await auth.api.signInEmailOTP({
      body: { email: 'ana@example.com', otp },
      returnHeaders: true,
    });
    const cookie = headers
      .getSetCookie()
      .map((set) => set.split(';')[0])
      .join('; ');

    const { answer, verifier } = await askToConnect(app, { application, origin, cookie });
    expect(answer.status).toBe(302);
    const consentPage = new URL(answer.headers.location!, origin);
    expect(consentPage.pathname).toBe('/connect');
    const named = await request(app)
      .post('/api/auth/connecting-application')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({ connectionRequest: consentPage.search.slice(1) });
    const consent = await answerConsent(app, {
      consentPage: consentPage.href,
      accept: true,
      cookie,
      origin,
    });
    const returned = new URL((consent.body as { url: string }).url);
    const tokens = await exchangeCode(app, {
      application,
      origin,
      code: returned.searchParams.get('code')!,
      verifier,
    });

    expect(named.body).toEqual({ name: 'Claude', host: 'a1b2.example' });
    expect(`${returned.origin}${returned.pathname}`).toBe(application.redirectUri);
    expect(tokens.status).toBe(200);
  });
});
