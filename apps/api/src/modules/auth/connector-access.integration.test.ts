import { and, eq } from 'drizzle-orm';
import pg from 'pg';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { createApp } from '../../app.js';
import { createDatabase, type Database } from '../../db/database.js';
import type { ErrorLogEntry } from '../../http/error-boundary.js';
import { runMigrations } from '../../db/migrate.js';
import { oauthConsents, oauthRefreshTokens, users } from '../../db/schema.js';
import { createFreshDatabase, type FreshDatabase } from '../../test/fresh-database.js';
import {
  connectApplication,
  proofKey,
  publishedApplications,
  renewAccess,
  type ApplicationAccess,
  type PublishedApplication,
} from '../../test/published-application.js';
import { signedInCookie } from '../../test/signed-in-cookie.js';
import { testDependencies } from '../../test/test-dependencies.js';
import {
  authorizationServerOf,
  connectionRequestsOf,
  connectorAccessOf,
  createAuth,
  emailCodesOf,
  sessionsOf,
  type Auth,
  type AuthLogEntry,
} from './auth.js';

/** The public address of qando's pages and API, which every address below hangs from. */
const origin = 'http://localhost:4200';
const secret = 'test-secret-for-the-integration-tests-only-0123456789';
/** The address assistants call, which access tokens are issued for. */
const connector = `${origin}/api/mcp`;
/** Where the connector's metadata is, which says who gives access to it. */
const metadata = `${origin}/.well-known/oauth-protected-resource/api/mcp`;
/** Every permission an application asks for. */
const everyPermission = 'events:read events:manage offline_access';
const minute = 60 * 1000;

describe('who may call the connector, against PostgreSQL', () => {
  let database: FreshDatabase;
  let pool: pg.Pool;
  let db: Database;
  let auth: Auth;
  let app: ReturnType<typeof createApp>;
  /** What the app logged of requests that failed. */
  const failures: ErrorLogEntry[] = [];
  /** What the sign-in library reported as a problem. */
  const reported: AuthLogEntry[] = [];
  /** The applications that publish who they are, read without leaving the computer. */
  const applications = publishedApplications();

  beforeAll(async () => {
    database = await createFreshDatabase();
    pool = new pg.Pool({ connectionString: database.url });
    await runMigrations(pool);
    db = createDatabase(pool);
    auth = createAuth({
      db,
      secret,
      baseURL: origin,
      log: (entry) => reported.push(entry),
      fetchApplicationDocument: applications.fetch,
    });
  });

  /** What was written straight to the console, where the sign-in library's own logger writes. */
  let consoles: MockInstance[] = [];

  beforeEach(() => {
    app = createApp({
      ...testDependencies(),
      sessions: sessionsOf(auth),
      authorizationServer: authorizationServerOf(auth),
      connectionRequests: connectionRequestsOf(auth, db),
      connectorAccess: connectorAccessOf(auth, db),
      // The codes are made here straight by the sign-in library: no email is sent.
      signInCodes: emailCodesOf(auth, {
        sendEmail: () => Promise.reject(new Error('No email is sent in these tests')),
        log: (entry) => reported.push(entry),
      }).signInCodes,
      logError: (entry) => failures.push(entry),
    });
    consoles = (['error', 'warn'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    const wrote = consoles.flatMap((spy) => spy.mock.calls);
    for (const spy of consoles) spy.mockRestore();
    // A call refused is an answer of the connector: nothing failed and nothing is logged, since
    // anyone can send one.
    expect(failures.splice(0)).toEqual([]);
    expect(reported.splice(0)).toEqual([]);
    expect(wrote).toEqual([]);
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
  });

  /** The system's clock, which the sign-in library reads, set to a time of the test's. */
  function at(time: number): void {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(time);
  }

  const accountOf = async (email: string) =>
    (await db.select().from(users).where(eq(users.email, email)))[0]!;

  /** Connects the application to the account of that email, signed in for it, with every step. */
  const connected = async (application: PublishedApplication, email: string) =>
    connectApplication(app, { application, origin, cookie: await signedInCookie(auth, email) });

  /**
   * What "Desconectar" does to the application's connection to the account: what the account
   * allowed is deleted, and with it what the application renews its access with.
   */
  async function disconnect(application: PublishedApplication, email: string): Promise<void> {
    const { id } = await accountOf(email);
    await db
      .delete(oauthRefreshTokens)
      .where(
        and(
          eq(oauthRefreshTokens.userId, id),
          eq(oauthRefreshTokens.clientId, application.address),
        ),
      );
    await db
      .delete(oauthConsents)
      .where(and(eq(oauthConsents.userId, id), eq(oauthConsents.clientId, application.address)));
  }

  /** Asks the connector who it is, as an assistant does when it connects, with those headers. */
  const call = (headers: Record<string, string> = {}) =>
    request(app)
      .post('/api/mcp')
      .set({
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': 'server/discover',
        ...headers,
      })
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'server/discover',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientInfo': { name: 'an assistant', version: '1' },
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      });

  /** The header an application sends its access token in. */
  const carrying = ({ access_token }: ApplicationAccess) => ({
    Authorization: `Bearer ${access_token}`,
  });

  /** The connector's own answer: it served the call. */
  function served(response: request.Response): void {
    expect({ status: response.status, body: response.body as unknown }).toMatchObject({
      status: 200,
      body: { result: { supportedVersions: ['2026-07-28'] } },
    });
  }

  /** The `401` of a token that is not good, or no longer: where to ask for access again. */
  function refusedAsInvalid(response: request.Response): void {
    expect(response.status).toBe(401);
    const challenge = response.headers['www-authenticate']!;
    expect(challenge).toMatch(/^Bearer error="invalid_token", error_description="[^"]+", /);
    expect(challenge).toContain(`resource_metadata="${metadata}"`);
    expect(challenge).toContain(`scope="${everyPermission}"`);
    expect(response.body).toMatchObject({ jsonrpc: '2.0', id: null, error: { code: -32000 } });
  }

  describe('a call without access', () => {
    it('is answered 401 with the address of the connector’s metadata and every permission to ask for', async () => {
      const response = await call();

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe(
        `Bearer resource_metadata="${metadata}", scope="${everyPermission}"`,
      );
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('is sent to a document that is served and names the connector and who gives access to it', async () => {
      const response = await request(app).get(new URL(metadata).pathname);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        resource: connector,
        authorization_servers: [`${origin}/api/auth`],
      });
    });

    it('is answered the same 401, said to be an invalid token, when the token is not one qando signed', async () => {
      const claude = applications.publish('Claude');
      const { access_token } = await connected(claude, 'ana@example.com');
      const [header, claims] = access_token.split('.');

      refusedAsInvalid(await call({ Authorization: 'Bearer not-a-token' }));
      refusedAsInvalid(await call({ Authorization: `Bearer ${header}.${claims}.c2lnbmVk` }));
    });

    it('is answered the same 401 once the token is older than an hour', async () => {
      const claude = applications.publish('Claude');
      const start = Date.now();
      const access = await connected(claude, 'ana@example.com');

      at(start + 59 * minute);
      served(await call(carrying(access)));
      at(start + 61 * minute);
      refusedAsInvalid(await call(carrying(access)));
    });
  });

  describe('a call with the access token of a connected application', () => {
    it('is served', async () => {
      const claude = applications.publish('Claude');

      const access = await connected(claude, 'ana@example.com');

      served(await call(carrying(access)));
    });

    it('is served with a token the application renewed', async () => {
      const claude = applications.publish('Claude');
      const start = Date.now();
      const first = await connected(claude, 'ana@example.com');

      at(start + 30 * minute);
      const renewed = await renewAccess(app, claude, first.refresh_token);

      expect(renewed.status).toBe(200);
      served(await call(carrying(renewed.body as ApplicationAccess)));
    });

    it('is served after the organizer signs out of qando: the application stays connected', async () => {
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'ana@example.com');
      const access = await connectApplication(app, { application: claude, origin, cookie });

      const signedOut = await request(app)
        .post('/api/auth/sign-out')
        .set('Origin', origin)
        .set('Cookie', cookie);

      expect(signedOut.status).toBe(200);
      served(await call(carrying(access)));
    });
  });

  describe('a token bound to a key the application holds (DPoP)', () => {
    /** Connects the application with its tokens bound to a new key. */
    async function boundTo(application: PublishedApplication, email: string) {
      const key = proofKey();
      const access = await connectApplication(app, {
        application,
        origin,
        cookie: await signedInCookie(auth, email),
        dpop: key.proof(`${origin}/api/auth/oauth2/token`),
      });
      expect(access.token_type).toBe('DPoP');
      return { key, token: access.access_token };
    }

    /** The headers of a call with a bound token and that proof. */
    const proving = (token: string, proof: string) => ({
      Authorization: `DPoP ${token}`,
      DPoP: proof,
    });

    it('is served with the proof of that key for this call, at the connector’s public address', async () => {
      const { key, token } = await boundTo(applications.publish('Claude'), 'ana@example.com');

      served(await call(proving(token, key.proof(connector, token))));
    });

    it('is checked against the public address whatever address the request reached the API at', async () => {
      const { key, token } = await boundTo(applications.publish('Claude'), 'ana@example.com');

      const response = await call({
        ...proving(token, key.proof(connector, token)),
        Host: 'api.internal:10000',
      });

      served(response);
    });

    it('is refused as a plain bearer token, without the proof', async () => {
      const { token } = await boundTo(applications.publish('Claude'), 'ana@example.com');

      const response = await call({ Authorization: `Bearer ${token}` });

      expect(response.status).toBe(401);
    });

    it('is refused with a proof that leaves something out or is of another call, and told which algorithms a proof takes', async () => {
      const { key, token } = await boundTo(applications.publish('Claude'), 'ana@example.com');
      const other = proofKey();
      const used = key.proof(connector, token);
      served(await call(proving(token, used)));

      const refused = [
        await call({ Authorization: `DPoP ${token}` }),
        await call(proving(token, other.proof(connector, token))),
        await call(proving(token, key.proof(`${origin}/api/auth/oauth2/token`, token))),
        await call(proving(token, key.proof(connector))),
        await call(proving(token, used)),
      ];

      for (const response of refused) {
        expect(response.status).toBe(401);
        expect(response.headers['www-authenticate']).toMatch(/^DPoP error="[a-z_]+", .*algs="/);
      }
    });
  });

  describe('a connection that is no longer live', () => {
    it('refuses the token of an application the account disconnected, though the token has not expired', async () => {
      const claude = applications.publish('Claude');
      const access = await connected(claude, 'ana@example.com');
      served(await call(carrying(access)));

      await disconnect(claude, 'ana@example.com');
      const response = await call(carrying(access));

      refusedAsInvalid(response);
      expect(response.body).toEqual({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'The application is not connected to the account' },
        id: null,
      });
    });

    it('refuses a token bound to a key the same way, with the challenge of its scheme', async () => {
      const claude = applications.publish('Claude');
      const key = proofKey();
      const { access_token: token } = await connectApplication(app, {
        application: claude,
        origin,
        cookie: await signedInCookie(auth, 'ana@example.com'),
        dpop: key.proof(`${origin}/api/auth/oauth2/token`),
      });

      await disconnect(claude, 'ana@example.com');
      const response = await call({
        Authorization: `DPoP ${token}`,
        DPoP: key.proof(connector, token),
      });

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toMatch(/^DPoP error="invalid_token", /);
    });

    it('goes by the account and the application of the token: another account’s connection, or another application’s, serves neither', async () => {
      const claude = applications.publish('Claude');
      const chatgpt = applications.publish('ChatGPT');
      const anaWithClaude = await connected(claude, 'ana@example.com');
      const anaWithChatgpt = await connected(chatgpt, 'ana@example.com');
      const beaWithClaude = await connected(claude, 'bea@example.com');

      await disconnect(claude, 'ana@example.com');

      refusedAsInvalid(await call(carrying(anaWithClaude)));
      served(await call(carrying(anaWithChatgpt)));
      served(await call(carrying(beaWithClaude)));
    });

    it('refuses a token from before the application was connected again, and serves the new one', async () => {
      const claude = applications.publish('Claude');
      const start = Date.now();
      const before = await connected(claude, 'ana@example.com');
      await disconnect(claude, 'ana@example.com');

      at(start + 10 * minute);
      const after = await connected(claude, 'ana@example.com');

      refusedAsInvalid(await call(carrying(before)));
      served(await call(carrying(after)));
    });

    it('refuses the tokens of a deleted account', async () => {
      const claude = applications.publish('Claude');
      const access = await connected(claude, 'ana@example.com');

      await db.delete(users).where(eq(users.email, 'ana@example.com'));

      refusedAsInvalid(await call(carrying(access)));
    });
  });
});
