import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
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
import {
  oauthAccessTokens,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
  users,
} from '../../db/schema.js';
import { createFreshDatabase, type FreshDatabase } from '../../test/fresh-database.js';
import {
  answerConsent,
  askToConnect,
  connectApplication,
  type ConnectionRequest,
  exchangeCode,
  handBack,
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
  createAuth,
  emailCodesOf,
  sessionsOf,
  type Auth,
  type AuthLogEntry,
} from './auth.js';
import { deleteNoLongerKept } from './no-longer-kept.js';

/** The public address of qando's pages and API, which every address below hangs from. */
const origin = 'http://localhost:4200';
const secret = 'test-secret-for-the-integration-tests-only-0123456789';
/** Who issues the tokens: the authorization server's own address. */
const issuer = `${origin}/api/auth`;
/** The address assistants call, which access tokens are issued for. */
const connector = `${origin}/api/mcp`;
/** Every permission an application asks for, as the token route answers them. */
const everyPermission = 'events:read events:manage offline_access';
const minute = 60 * 1000;
const day = 24 * 60 * minute;

describe('the authorization server for applications, against PostgreSQL', () => {
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
  const written = () => consoles.flatMap((spy) => spy.mock.calls);

  // An app for each test: each starts its own count of the requests an address has sent.
  beforeEach(() => {
    app = createApp({
      ...testDependencies(),
      sessions: sessionsOf(auth),
      authorizationServer: authorizationServerOf(auth),
      connectionRequests: connectionRequestsOf(auth, db),
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
    const wrote = written();
    for (const spy of consoles) spy.mockRestore();
    // No request failed inside the API, nor inside the sign-in library: a refusal is an answer
    // of the authorization server, and a log line that anyone can cause means nothing.
    expect(failures.splice(0)).toEqual([]);
    expect(reported.splice(0)).toEqual([]);
    expect(wrote).toEqual([]);
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
  });

  const accountOf = async (email: string) =>
    (await db.select().from(users).where(eq(users.email, email)))[0]!;

  /** Resolves once that many requests wait in the database for another one to be over. */
  const waitingInTheDatabase = (requests: number) =>
    vi.waitFor(
      async () => {
        const { rows } = await pool.query(
          `SELECT count(*)::int AS waiting FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'`,
        );
        expect(rows).toEqual([{ waiting: requests }]);
      },
      { timeout: 5000, interval: 20 },
    );

  /** The consents the application was given, whatever the account. */
  const consentsTo = (application: PublishedApplication) =>
    db.select().from(oauthConsents).where(eq(oauthConsents.clientId, application.address));

  /** How many applications are stored under the address: one, once its document was taken. */
  const stored = (address: string) => db.$count(oauthClients, eq(oauthClients.clientId, address));

  /** The system's clock, which the sign-in library reads, set to a time of the test's. */
  function at(time: string | number): void {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(time);
  }

  /** What an access token says: it is a signed JSON token, read here without checking it. */
  interface AccessClaims {
    readonly iss: string;
    readonly aud: string;
    readonly sub: string;
    readonly scope: string;
    readonly iat: number;
    readonly exp: number;
  }
  const partOf = (token: string, part: 0 | 1): unknown =>
    JSON.parse(Buffer.from(token.split('.')[part]!, 'base64url').toString());
  const claimsOf = (token: string) => partOf(token, 1) as AccessClaims;
  /** The key the token names as the one that signed it. */
  const signerOf = (token: string) => (partOf(token, 0) as { kid: string }).kid;

  /**
   * Asks to connect as the signed-in account, with the request's parameters changed by `query`
   * if given, and answers the consent page, up to where the application is sent back to with a
   * code or a refusal.
   */
  async function answered(
    application: PublishedApplication,
    cookie: string,
    accept: boolean,
    query?: ConnectionRequest['query'],
  ) {
    const { answer, verifier, state } = await askToConnect(app, {
      application,
      origin,
      cookie,
      ...(query !== undefined && { query }),
    });
    const consent = await answerConsent(app, {
      consentPage: sentTo(answer).href,
      accept,
      cookie,
      origin,
    });
    expect(consent.status).toBe(200);
    const returned = new URL((consent.body as { url: string }).url);
    return { returned, verifier, state };
  }

  /**
   * Why a request that cannot return to its application was refused, once checked that the
   * browser was sent to the consent page with that reason and no request: the page then has
   * nothing to allow, and says to start again from the application.
   */
  function nothingToAllow(answer: { status: number; headers: Record<string, string> }) {
    // A path alone: the browser stays on the site it asked, which is qando's.
    expect(answer.headers.location).toMatch(/^\/connect\?/);
    const page = sentTo(answer);
    expect([...page.searchParams.keys()]).toEqual(['error', 'error_description']);
    return page.searchParams.get('error');
  }

  /** A JSON document as a request answered it. */
  type Document = Record<string, unknown>;

  /** The authorization server's metadata, read where assistants look for it. */
  async function serverMetadata(): Promise<Document> {
    const response = await request(app).get('/.well-known/oauth-authorization-server/api/auth');
    expect(response.status).toBe(200);
    expect(response.type).toBe('application/json');
    return response.body as Document;
  }

  /** Where an answer sent the browser on. */
  function sentTo(answer: { status: number; headers: Record<string, string> }): URL {
    expect(answer.status).toBe(302);
    return new URL(answer.headers.location!, origin);
  }

  describe('its metadata', () => {
    it('answers the authorization server’s metadata at its well-known address with what assistants read', async () => {
      const metadata = await serverMetadata();

      expect(metadata).toMatchObject({
        issuer,
        authorization_endpoint: `${issuer}/oauth2/authorize`,
        token_endpoint: `${issuer}/oauth2/token`,
        response_types_supported: ['code'],
        code_challenge_methods_supported: ['S256'],
        client_id_metadata_document_supported: true,
        authorization_response_iss_parameter_supported: true,
      });
      expect(metadata.token_endpoint_auth_methods_supported).toContain('none');
      expect(metadata.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
      expect(metadata.scopes_supported).toEqual(['events:read', 'events:manage', 'offline_access']);
    });

    it('offers no address to register at nor to introspect a token, and is no OpenID provider', async () => {
      const metadata = await serverMetadata();

      expect(metadata).not.toHaveProperty('registration_endpoint');
      expect(Object.keys(metadata).filter((key) => key.startsWith('introspection_'))).toEqual([]);
      expect(metadata).not.toHaveProperty('userinfo_endpoint');
    });

    it('announces what it does and nothing else, such as a logout it has not', async () => {
      const metadata = await serverMetadata();

      expect(Object.keys(metadata).sort()).toEqual(
        [
          'issuer',
          'authorization_endpoint',
          'token_endpoint',
          'jwks_uri',
          'revocation_endpoint',
          'scopes_supported',
          'response_types_supported',
          'response_modes_supported',
          'grant_types_supported',
          'code_challenge_methods_supported',
          'authorization_response_iss_parameter_supported',
          'client_id_metadata_document_supported',
          'token_endpoint_auth_methods_supported',
          'token_endpoint_auth_signing_alg_values_supported',
          'revocation_endpoint_auth_methods_supported',
          'revocation_endpoint_auth_signing_alg_values_supported',
          'dpop_signing_alg_values_supported',
          'op_policy_uri',
          'op_tos_uri',
        ].sort(),
      );
    });

    it('names as the ways an application says who it is only those it takes, to ask for tokens and to hand one back: none, or a signed proof', async () => {
      const metadata = await serverMetadata();

      expect(metadata).toMatchObject({
        token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
        revocation_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
      });
    });

    it('names the privacy page as its policy and its terms', async () => {
      const metadata = await serverMetadata();

      expect(metadata).toMatchObject({
        op_policy_uri: `${origin}/privacy`,
        op_tos_uri: `${origin}/privacy`,
      });
    });

    it('announces no address it does not serve', async () => {
      const metadata = await serverMetadata();
      const announced = Object.entries(metadata).flatMap(([key, address]) =>
        (key.endsWith('_endpoint') || key === 'jwks_uri') && typeof address === 'string'
          ? [{ key, path: new URL(address).pathname }]
          : [],
      );
      expect(announced.map(({ key }) => key)).toEqual(
        expect.arrayContaining(['authorization_endpoint', 'token_endpoint', 'jwks_uri']),
      );

      const answered: Record<string, number> = {};
      for (const { key, path } of announced) {
        // A browser is sent to the authorize address and the keys are read; the rest are posted to.
        const read = key === 'authorization_endpoint' || key === 'jwks_uri';
        const response = await (read
          ? request(app).get(path)
          : request(app).post(path).type('form'));
        answered[key] = response.status;
      }

      expect(Object.entries(answered).filter(([, status]) => status === 404)).toEqual([]);
    });

    it.each([
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/api/mcp',
    ])('answers the connector’s metadata at its well-known address %s', async (address) => {
      const response = await request(app).get(address);

      expect(response.status).toBe(200);
      expect(response.type).toBe('application/json');
      expect(response.body).toMatchObject({
        resource: connector,
        authorization_servers: [issuer],
        scopes_supported: ['events:read', 'events:manage'],
      });
    });

    it('does not answer the authorization server’s metadata at the root address, without its own path', async () => {
      const response = await request(app).get('/.well-known/oauth-authorization-server');

      expect(response.status).toBe(404);
    });
  });

  describe('connecting an application', () => {
    it('sends a request to connect without a session to the sign-in page, carrying the request signed', async () => {
      const claude = applications.publish('Claude');

      const { answer } = await askToConnect(app, { application: claude, origin });

      // A path alone: the browser stays on the site it asked, which is qando's.
      expect(answer.headers.location).toMatch(/^\/sign-in\?/);
      const signIn = sentTo(answer);
      expect(signIn.searchParams.get('client_id')).toBe(claude.address);
      expect(signIn.searchParams.get('sig')).toEqual(expect.any(String));
      expect(signIn.searchParams.get('exp')).toMatch(/^\d+$/);
    });

    it('sends a signed-in account that has not allowed the application to the consent page', async () => {
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'ana@example.com');

      const { answer } = await askToConnect(app, { application: claude, origin, cookie });

      expect(answer.headers.location).toMatch(/^\/connect\?/);
      const consent = sentTo(answer);
      expect(consent.searchParams.get('client_id')).toBe(claude.address);
      expect(consent.searchParams.get('sig')).toEqual(expect.any(String));
    });

    it('after "allow", returns to the application’s address with a code, its state and the issuer', async () => {
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'bea@example.com');

      const { returned, state } = await answered(claude, cookie, true);

      expect(`${returned.origin}${returned.pathname}`).toBe(claude.redirectUri);
      expect(Object.fromEntries(returned.searchParams)).toEqual({
        code: expect.any(String) as string,
        state,
        iss: issuer,
      });
      expect(await consentsTo(claude)).toEqual([
        expect.objectContaining({
          userId: (await accountOf('bea@example.com')).id,
          scopes: everyPermission.split(' '),
          resources: [connector],
        }),
      ]);
    });

    it('stores one consent when the account answers "allow" in two tabs at once, and returns both with a code', async () => {
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'berta@example.com');
      const pages = await Promise.all(
        [1, 2].map(async () => {
          const { answer } = await askToConnect(app, { application: claude, origin, cookie });
          return sentTo(answer).href;
        }),
      );
      // Neither answer can store a consent until the test lets it: both have looked for one
      // and are on their way at once, the first not over when the second arrives.
      const holder = await pool.connect();
      try {
        await holder.query('BEGIN; LOCK TABLE oauth_consents IN SHARE MODE');
        const sent = pages.map((consentPage) =>
          answerConsent(app, { consentPage, accept: true, cookie, origin }),
        );
        await waitingInTheDatabase(2);
        await holder.query('COMMIT');
        const answers = await Promise.all(sent);

        expect(answers.map(({ status }) => status)).toEqual([200, 200]);
        for (const { body } of answers) {
          const returned = new URL((body as { url: string }).url);
          expect(returned.searchParams.get('code')).toEqual(expect.any(String));
        }
        expect(await consentsTo(claude)).toEqual([
          expect.objectContaining({
            userId: (await accountOf('berta@example.com')).id,
            scopes: everyPermission.split(' '),
          }),
        ]);
      } finally {
        await holder.query('ROLLBACK');
        holder.release();
      }
    });

    it('after "do not allow", returns to the application with a refusal and stores no consent', async () => {
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'carla@example.com');

      const { returned, state } = await answered(claude, cookie, false);

      expect(`${returned.origin}${returned.pathname}`).toBe(claude.redirectUri);
      expect(Object.fromEntries(returned.searchParams)).toMatchObject({
        error: 'access_denied',
        state,
        iss: issuer,
      });
      expect(returned.searchParams.has('code')).toBe(false);
      expect(await consentsTo(claude)).toEqual([]);
    });

    it('refuses a consent sent from another site’s page, storing nothing', async () => {
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'dora@example.com');
      const { answer } = await askToConnect(app, { application: claude, origin, cookie });

      const refused = await answerConsent(app, {
        consentPage: sentTo(answer).href,
        accept: true,
        cookie,
        origin: 'https://another-site.example',
      });

      expect(refused.status).toBe(403);
      expect(await consentsTo(claude)).toEqual([]);
    });

    it.each<[string, (signed: URLSearchParams) => void]>([
      [
        'that returns to another address',
        (signed) => {
          signed.set('redirect_uri', 'https://elsewhere.example/callback');
        },
      ],
      [
        'that asks for other permissions',
        (signed) => {
          signed.set('scope', 'events:read');
        },
      ],
      [
        'without its signature',
        (signed) => {
          signed.delete('sig');
        },
      ],
      [
        'with a later expiry',
        (signed) => {
          signed.set('exp', '9999999999');
        },
      ],
    ])(
      'refuses the consent’s answer to a request %s, which is not the one it signed, storing nothing',
      async (_case, change) => {
        const claude = applications.publish('Claude');
        const cookie = await signedInCookie(auth, 'flor@example.com');
        const { answer } = await askToConnect(app, { application: claude, origin, cookie });
        const consentPage = sentTo(answer);
        change(consentPage.searchParams);

        // "Do not allow" too: it answers where the browser goes on, which the request says.
        for (const accept of [true, false]) {
          const refused = await answerConsent(app, {
            consentPage: consentPage.href,
            accept,
            cookie,
            origin,
          });

          expect(refused.status).toBe(400);
          expect(refused.body).toEqual({ error: 'invalid_signature' });
        }
        expect(await consentsTo(claude)).toEqual([]);
      },
    );

    it('takes the consent’s answer until 10 minutes after the request was asked, and none later', async () => {
      const claude = applications.publish('Claude');
      const another = applications.publish('Otra');
      const cookie = await signedInCookie(auth, 'gala@example.com');
      at('2026-06-15T10:00:00.000Z');
      const { answer: inTime } = await askToConnect(app, { application: claude, origin, cookie });
      const { answer: late } = await askToConnect(app, { application: another, origin, cookie });

      at('2026-06-15T10:10:00.000Z');
      const taken = await answerConsent(app, {
        consentPage: sentTo(inTime).href,
        accept: true,
        cookie,
        origin,
      });
      at('2026-06-15T10:10:00.001Z');
      const refused = await answerConsent(app, {
        consentPage: sentTo(late).href,
        accept: true,
        cookie,
        origin,
      });

      expect(taken.status).toBe(200);
      // The same answer as to a request it did not sign: the page tells them apart by nothing.
      expect(refused.status).toBe(400);
      expect(refused.body).toEqual({ error: 'invalid_signature' });
      expect(await consentsTo(another)).toEqual([]);
    });

    it('refuses the consent’s answer of a browser that is no longer signed in, storing nothing', async () => {
      const claude = applications.publish('Claude');
      const { answer } = await askToConnect(app, {
        application: claude,
        origin,
        cookie: await signedInCookie(auth, 'hilda@example.com'),
      });

      // The request is the one the server signed: only the session is missing.
      for (const accept of [true, false]) {
        const refused = await answerConsent(app, {
          consentPage: sentTo(answer).href,
          accept,
          origin,
        });

        expect(refused.status).toBe(401);
        expect(refused.body).toEqual({ message: 'Unauthorized', code: 'UNAUTHORIZED' });
      }
      expect(await consentsTo(claude)).toEqual([]);
    });

    describe('the application the consent page names', () => {
      /** Asks which application a request to connect names, as the consent page does. */
      const applicationAsking = (connectionRequest: string, cookie: string) =>
        request(app)
          .post('/api/auth/connecting-application')
          .set('Cookie', cookie)
          .set('Origin', origin)
          .send({ connectionRequest });

      /** The request to connect the browser was sent to the consent page with: its query. */
      async function requestFor(application: PublishedApplication, cookie: string) {
        const { answer } = await askToConnect(app, { application, origin, cookie });
        expect(answer.headers.location).toMatch(/^\/connect\?/);
        return sentTo(answer).search.slice(1);
      }

      const expired = {
        error: {
          code: 'CONNECTION_REQUEST_EXPIRED',
          message: 'The request to connect expired',
          details: [],
        },
      };

      it('is the one the request names: its name and the host its document is published at', async () => {
        const claude = applications.publish('Claude');
        const cookie = await signedInCookie(auth, 'fina@example.com');

        const answer = await applicationAsking(await requestFor(claude, cookie), cookie);

        expect(answer.status).toBe(200);
        expect(answer.body).toEqual({ name: 'Claude', host: new URL(claude.address).host });
      });

      it('says nothing else the application publishes: no logo, no address of its own choice', async () => {
        const address = `https://${randomUUID()}.example/oauth/client.json`;
        const redirectUri = 'https://elsewhere.example/callback';
        applications.publishDocument(address, {
          client_id: address,
          client_name: 'Asistente',
          client_uri: 'https://claude.ai',
          logo_uri: 'https://static.example/logo.png',
          redirect_uris: [redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        });
        const cookie = await signedInCookie(auth, 'gema@example.com');

        const answer = await applicationAsking(
          await requestFor({ address, redirectUri }, cookie),
          cookie,
        );

        expect(answer.status).toBe(200);
        expect(answer.body).toEqual({ name: 'Asistente', host: new URL(address).host });
      });

      it('is read from what qando stored when it asked, never from the application again', async () => {
        const claude = applications.publish('Claude');
        const cookie = await signedInCookie(auth, 'lia@example.com');
        const asked = await requestFor(claude, cookie);
        // Another process of the API, as after a deployment: it holds no document in memory.
        const restarted = createAuth({
          db,
          secret,
          baseURL: origin,
          log: (entry) => reported.push(entry),
          fetchApplicationDocument: applications.fetch,
        });
        const another = createApp({
          ...testDependencies(),
          sessions: sessionsOf(restarted),
          connectionRequests: connectionRequestsOf(restarted, db),
        });
        const read = applications.asked.length;

        const answer = await request(another)
          .post('/api/auth/connecting-application')
          .set('Cookie', cookie)
          .set('Origin', origin)
          .send({ connectionRequest: asked });

        expect(answer.status).toBe(200);
        expect(answer.body).toEqual({ name: 'Claude', host: new URL(claude.address).host });
        expect(applications.asked.length).toBe(read);
      });

      it('is named by the host of its address when it is stored without a name', async () => {
        const claude = applications.publish('Claude');
        const cookie = await signedInCookie(auth, 'nora@example.com');
        const asked = await requestFor(claude, cookie);
        // No document without a name is taken today: the row is written as one would leave it.
        await db
          .update(oauthClients)
          .set({ name: null })
          .where(eq(oauthClients.clientId, claude.address));

        const answer = await applicationAsking(asked, cookie);

        const host = new URL(claude.address).host;
        expect(answer.status).toBe(200);
        expect(answer.body).toEqual({ name: host, host });
      });

      it('is not told of an application qando no longer stores', async () => {
        const claude = applications.publish('Claude');
        const cookie = await signedInCookie(auth, 'mia@example.com');
        const asked = await requestFor(claude, cookie);
        await db.delete(oauthClients).where(eq(oauthClients.clientId, claude.address));

        const answer = await applicationAsking(asked, cookie);

        expect(answer.status).toBe(410);
        expect(answer.body).toEqual(expired);
      });

      it('is told of a request up to 10 minutes old, and of none older', async () => {
        const claude = applications.publish('Claude');
        const cookie = await signedInCookie(auth, 'hebe@example.com');
        at('2026-06-15T10:00:00.000Z');
        const asked = await requestFor(claude, cookie);

        at('2026-06-15T10:10:00.000Z');
        const inTime = await applicationAsking(asked, cookie);
        at('2026-06-15T10:10:00.001Z');
        const late = await applicationAsking(asked, cookie);

        expect(inTime.status).toBe(200);
        expect(late.status).toBe(410);
        expect(late.body).toEqual(expired);
      });

      it.each<[string, (signed: URLSearchParams, another: string) => void]>([
        [
          'that names another application',
          (signed, another) => {
            signed.set('client_id', another);
          },
        ],
        [
          'with a parameter added',
          (signed) => {
            signed.set('prompt', 'consent');
          },
        ],
        [
          'without its signature',
          (signed) => {
            signed.delete('sig');
          },
        ],
        [
          'signed twice',
          (signed) => {
            signed.append('sig', signed.get('sig')!);
          },
        ],
        [
          'with a later expiry',
          (signed) => {
            signed.set('exp', '9999999999');
          },
        ],
      ])('is not told of a request %s', async (_case, change) => {
        const claude = applications.publish('Claude');
        const another = applications.publish('Otra');
        const cookie = await signedInCookie(auth, 'ines@example.com');
        // The other application is one qando knows too: only the signature tells the request apart.
        await requestFor(another, cookie);
        const signed = new URLSearchParams(await requestFor(claude, cookie));
        change(signed, another.address);

        const answer = await applicationAsking(signed.toString(), cookie);

        expect(answer.status).toBe(410);
        expect(answer.body).toEqual(expired);
      });

      it.each(['hola', 'client_id', '?', '%'])(
        'is not told of %j, which is no request',
        async (text) => {
          const cookie = await signedInCookie(auth, 'julia@example.com');

          const answer = await applicationAsking(text, cookie);

          expect(answer.status).toBe(410);
          expect(answer.body).toEqual(expired);
        },
      );

      it('is not told without a session', async () => {
        const claude = applications.publish('Claude');
        const cookie = await signedInCookie(auth, 'kira@example.com');
        const asked = await requestFor(claude, cookie);

        const answer = await request(app)
          .post('/api/auth/connecting-application')
          .set('Origin', origin)
          .send({ connectionRequest: asked });

        expect(answer.status).toBe(401);
      });
    });

    it('exchanges the code for an access token of one hour, issued for the connector’s address, and a refresh token', async () => {
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'eva@example.com');

      const access = await connectApplication(app, { application: claude, origin, cookie });

      expect(access).toMatchObject({
        token_type: 'Bearer',
        expires_in: 3600,
        scope: everyPermission,
        refresh_token: expect.any(String) as string,
      });
      const claims = claimsOf(access.access_token);
      expect(claims).toMatchObject({
        iss: issuer,
        aud: connector,
        sub: (await accountOf('eva@example.com')).id,
        scope: everyPermission,
      });
      expect(claims.exp - claims.iat).toBe(3600);
    });

    it('takes a request to connect that names nothing it asks access to as one for the connector: its tokens are the connector’s, renewed too, and none is stored', async () => {
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'elena@example.com');
      const { returned, verifier } = await answered(claude, cookie, true, { resource: undefined });

      const exchanged = await exchangeCode(app, {
        application: claude,
        origin,
        code: returned.searchParams.get('code')!,
        verifier,
        form: { resource: undefined },
      });
      const access = exchanged.body as ApplicationAccess;
      const renewed = await renewAccess(app, claude, access.refresh_token);

      expect(exchanged.status).toBe(200);
      expect(access.access_token.split('.')).toHaveLength(3);
      expect(claimsOf(access.access_token).aud).toBe(connector);
      expect(claimsOf((renewed.body as ApplicationAccess).access_token).aud).toBe(connector);
      const { id } = await accountOf('elena@example.com');
      expect(await db.$count(oauthAccessTokens, eq(oauthAccessTokens.userId, id))).toBe(0);
    });

    it.each([
      ['names none', undefined],
      ['names an empty one', ''],
    ])('takes a request to connect that %s as one for the connector', async (_case, resource) => {
      const claude = applications.publish('Claude');

      const { answer } = await askToConnect(app, {
        application: claude,
        origin,
        query: { resource },
      });

      expect(sentTo(answer).searchParams.getAll('resource')).toEqual([connector]);
    });

    it('binds the tokens to a key the application proves it holds (DPoP), as its metadata announces, and renews them only with that key', async () => {
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'eloisa@example.com');
      const { returned, verifier } = await answered(claude, cookie, true);
      const key = proofKey();

      const exchanged = await exchangeCode(app, {
        application: claude,
        origin,
        code: returned.searchParams.get('code')!,
        verifier,
        dpop: key.proof(`${issuer}/oauth2/token`),
      });
      const access = exchanged.body as ApplicationAccess;
      const renewedWithout = await renewAccess(app, claude, access.refresh_token);

      expect(exchanged.status).toBe(200);
      expect(access.token_type).toBe('DPoP');
      expect(partOf(access.access_token, 1)).toMatchObject({ cnf: { jkt: key.thumbprint } });
      expect(renewedWithout.status).toBe(400);
    });

    it('refuses the code with another verifier than the one it was asked with', async () => {
      const claude = applications.publish('Claude');
      const { returned } = await answered(
        claude,
        await signedInCookie(auth, 'fina@example.com'),
        true,
      );

      const refused = await exchangeCode(app, {
        application: claude,
        origin,
        code: returned.searchParams.get('code')!,
        verifier: 'another-verifier-than-the-one-the-application-asked-with',
      });

      expect(refused.status).toBe(400);
      expect(refused.body).toMatchObject({ error: 'invalid_grant' });
      expect(refused.body).not.toHaveProperty('access_token');
    });

    it('refuses a request to connect without a challenge, which leaves the code open to whoever reads it', async () => {
      const claude = applications.publish('Claude');

      const { answer } = await askToConnect(app, {
        application: claude,
        origin,
        cookie: await signedInCookie(auth, 'gema@example.com'),
        query: { code_challenge: undefined, code_challenge_method: undefined },
      });

      const returned = sentTo(answer);
      expect(`${returned.origin}${returned.pathname}`).toBe(claude.redirectUri);
      expect(returned.searchParams.get('error')).toBe('invalid_request');
      expect(returned.searchParams.has('code')).toBe(false);
    });

    it('refuses a request for another address than the connector’s', async () => {
      const claude = applications.publish('Claude');

      const { answer } = await askToConnect(app, {
        application: claude,
        origin,
        cookie: await signedInCookie(auth, 'helga@example.com'),
        query: { resource: 'https://another-service.example/api/mcp' },
      });

      const returned = sentTo(answer);
      expect(`${returned.origin}${returned.pathname}`).toBe(claude.redirectUri);
      expect(returned.searchParams.get('error')).toBe('invalid_target');
      expect(returned.searchParams.has('code')).toBe(false);
    });

    it('serves the keys tokens are signed with', async () => {
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'ines@example.com');
      const access = await connectApplication(app, { application: claude, origin, cookie });

      const response = await request(app).get('/api/auth/jwks');

      expect(response.status).toBe(200);
      const { keys } = response.body as { keys: { kid: string }[] };
      expect(keys.map(({ kid }) => kid)).toContain(signerOf(access.access_token));
    });
  });

  describe('signing in on the way to connecting', () => {
    /**
     * Signs the email in as the sign-in page does when a request to connect opened it: with the
     * email's code (one just made, unless given) and the query of the page's own address.
     * Answers what the route answered and the `Cookie` header the browser sends from then on.
     */
    async function signedInOn(signInPage: string, email: string, code?: string) {
      const sent =
        code ?? (await auth.api.createVerificationOTP({ body: { email, type: 'sign-in' } }));
      const answer = await request(app)
        .post('/api/auth/sign-in')
        .set('Origin', origin)
        .send({ email, code: sent, connectionRequest: signInPage });
      const cookies = answer.get('Set-Cookie') ?? [];
      return { answer, cookie: cookies.map((cookie) => cookie.split(';')[0]).join('; ') };
    }

    /** The query of the sign-in page a request to connect sent the browser to. */
    const signInPageOf = (asked: { status: number; headers: Record<string, string> }) => {
      expect(asked.headers.location).toMatch(/^\/sign-in\?/);
      return sentTo(asked).search.slice(1);
    };

    /** Where the sign-in said the browser goes on. */
    const continuedAt = (answer: { status: number; body: unknown }) => {
      expect(answer.status).toBe(200);
      return (answer.body as { continueTo: string }).continueTo;
    };

    it('goes on by asking the authorization server again what the application asked, which now asks for the consent, and the application connects', async () => {
      const claude = applications.publish('Claude');
      const {
        answer: asked,
        verifier,
        state,
      } = await askToConnect(app, { application: claude, origin });

      const { answer, cookie } = await signedInOn(signInPageOf(asked), 'ines@example.com');

      const continueTo = continuedAt(answer);
      expect(answer.body).toEqual({ signedIn: true, continueTo });
      // A path of qando's, with the application's request and nothing of what signed it.
      const again = new URL(continueTo, origin);
      expect(continueTo.startsWith('/api/auth/oauth2/authorize?')).toBe(true);
      expect([...again.searchParams].sort()).toEqual(
        Object.entries({
          response_type: 'code',
          client_id: claude.address,
          redirect_uri: claude.redirectUri,
          scope: everyPermission,
          state,
          code_challenge: createHash('sha256').update(verifier).digest('base64url'),
          code_challenge_method: 'S256',
          resource: connector,
        }).sort(),
      );
      // The browser opens it with its new session: the consent page, then the application.
      const opened = await request(app).get(continueTo).set('Cookie', cookie);
      expect(opened.headers.location).toMatch(/^\/connect\?/);
      const allowed = await answerConsent(app, {
        consentPage: sentTo(opened).href,
        accept: true,
        cookie,
        origin,
      });
      const returned = new URL((allowed.body as { url: string }).url);
      expect(returned.searchParams.get('state')).toBe(state);
      const exchanged = await exchangeCode(app, {
        application: claude,
        origin,
        code: returned.searchParams.get('code')!,
        verifier,
      });
      expect(exchanged.status).toBe(200);
      const { access_token: token } = exchanged.body as ApplicationAccess;
      expect(claimsOf(token).sub).toBe((await accountOf('ines@example.com')).id);
    });

    it('goes back to an application the account had already allowed, with a code it exchanges', async () => {
      const claude = applications.publish('Claude');
      await connectApplication(app, {
        application: claude,
        origin,
        cookie: await signedInCookie(auth, 'julia@example.com'),
      });
      // Another browser of hers, not signed in.
      const {
        answer: asked,
        verifier,
        state,
      } = await askToConnect(app, { application: claude, origin });

      const { answer, cookie } = await signedInOn(signInPageOf(asked), 'julia@example.com');

      const opened = await request(app).get(continuedAt(answer)).set('Cookie', cookie);
      const returned = sentTo(opened);
      expect(`${returned.origin}${returned.pathname}`).toBe(claude.redirectUri);
      expect(returned.searchParams.get('state')).toBe(state);
      const exchanged = await exchangeCode(app, {
        application: claude,
        origin,
        code: returned.searchParams.get('code')!,
        verifier,
      });
      expect(exchanged.status).toBe(200);
    });

    it.each([
      ['a sign-in', { prompt: 'login' }],
      ['a sign-in and the consent', { prompt: 'login consent' }],
      ['a sign-in no older than now', { max_age: '0' }],
      ['an account to be created', { prompt: 'create' }],
      ['an account to be created and the consent', { prompt: 'create consent' }],
    ])(
      'goes on to the consent page when the application asked for %s: the sign-in just made',
      async (_, query) => {
        const claude = applications.publish('Claude');
        // Such a request is sent to the sign-in page even from a browser that is signed in.
        const { answer: asked } = await askToConnect(app, {
          application: claude,
          origin,
          cookie: await signedInCookie(auth, 'karen@example.com'),
          query,
        });

        const { answer, cookie } = await signedInOn(signInPageOf(asked), 'karen@example.com');

        const opened = await request(app).get(continuedAt(answer)).set('Cookie', cookie);
        expect(opened.headers.location).toMatch(/^\/connect\?/);
      },
    );

    it('takes a request to connect until 10 minutes after it was asked', async () => {
      const claude = applications.publish('Claude');
      at('2026-06-15T10:00:00.000Z');
      const { answer: asked } = await askToConnect(app, { application: claude, origin });
      at('2026-06-15T10:10:00.000Z');

      const { answer } = await signedInOn(signInPageOf(asked), 'lola@example.com');

      expect(continuedAt(answer).startsWith('/api/auth/oauth2/authorize?')).toBe(true);
    });

    it('signs in with a request older than 10 minutes, and sends the browser to the consent page without it', async () => {
      const claude = applications.publish('Claude');
      at('2026-06-15T10:00:00.000Z');
      const { answer: asked } = await askToConnect(app, { application: claude, origin });
      at('2026-06-15T10:10:00.001Z');

      const { answer, cookie } = await signedInOn(signInPageOf(asked), 'mar@example.com');

      expect(answer.status).toBe(200);
      expect(answer.body).toEqual({ signedIn: true, continueTo: '/connect' });
      // Signed in: a request to connect from that browser is the account's.
      const { answer: next } = await askToConnect(app, { application: claude, origin, cookie });
      expect(next.headers.location).toMatch(/^\/connect\?/);
    });

    it.each<[string, (signed: URLSearchParams, another: string) => void]>([
      [
        'naming another application than when it was signed',
        (signed, another) => {
          signed.set('client_id', another);
        },
      ],
      [
        'with a parameter added',
        (signed) => {
          signed.append('returnTo', '/my-events');
        },
      ],
      [
        'without its signature',
        (signed) => {
          signed.delete('sig');
        },
      ],
      [
        'that is no request at all',
        (signed) => {
          for (const name of [...signed.keys()]) signed.delete(name);
          signed.set('returnTo', '/my-events');
        },
      ],
    ])(
      'signs in with a request to connect %s, and sends the browser to the consent page without it',
      async (_, change) => {
        const claude = applications.publish('Claude');
        const another = applications.publish('Another');
        const { answer: asked } = await askToConnect(app, { application: claude, origin });
        const changed = new URLSearchParams(signInPageOf(asked));
        change(changed, another.address);

        const { answer, cookie } = await signedInOn(changed.toString(), 'nora@example.com');

        expect(answer.status).toBe(200);
        expect(answer.body).toEqual({ signedIn: true, continueTo: '/connect' });
        const { answer: next } = await askToConnect(app, { application: claude, origin, cookie });
        expect(next.headers.location).toMatch(/^\/connect\?/);
      },
    );

    it('refuses a wrong code as without a request to connect: nothing goes on', async () => {
      const claude = applications.publish('Claude');
      const { answer: asked } = await askToConnect(app, { application: claude, origin });
      const sent = await auth.api.createVerificationOTP({
        body: { email: 'olga@example.com', type: 'sign-in' },
      });
      const wrong = sent === '000000' ? '000001' : '000000';

      const { answer, cookie } = await signedInOn(signInPageOf(asked), 'olga@example.com', wrong);

      expect(answer.status).toBe(400);
      expect(answer.body).toMatchObject({ error: { code: 'WRONG_CODE', attemptsLeft: 4 } });
      expect(answer.body).not.toHaveProperty('continueTo');
      expect(cookie).toBe('');
    });
  });

  describe('renewing the access', () => {
    it('renews the access with the refresh token, which is replaced by a new one', async () => {
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'julia@example.com');
      const first = await connectApplication(app, { application: claude, origin, cookie });

      const renewed = await renewAccess(app, claude, first.refresh_token);

      expect(renewed.status).toBe(200);
      const second = renewed.body as ApplicationAccess;
      expect(second).toMatchObject({ token_type: 'Bearer', expires_in: 3600 });
      expect(claimsOf(second.access_token)).toMatchObject({
        aud: connector,
        scope: everyPermission,
      });
      expect(second.refresh_token).toEqual(expect.any(String));
      expect(second.refresh_token).not.toBe(first.refresh_token);
    });

    it('connects an application that signs its token requests, and renews its access', async () => {
      const chatgpt = applications.publishSigning('ChatGPT', origin);
      const cookie = await signedInCookie(auth, 'julieta@example.com');

      const first = await connectApplication(app, { application: chatgpt, origin, cookie });
      const renewed = await renewAccess(app, chatgpt, first.refresh_token);

      expect(renewed.status).toBe(200);
      const second = renewed.body as ApplicationAccess;
      expect(claimsOf(second.access_token)).toMatchObject({ aud: connector });
      expect(second.refresh_token).not.toBe(first.refresh_token);
    });

    it('refuses a token request of an application that signs when it carries no proof', async () => {
      const chatgpt = applications.publishSigning('ChatGPT', origin);
      const cookie = await signedInCookie(auth, 'justa@example.com');
      const first = await connectApplication(app, { application: chatgpt, origin, cookie });
      // The same application, as anyone who knew its address and had its refresh token.
      const unsigned = { address: chatgpt.address, redirectUri: chatgpt.redirectUri };

      const renewed = await renewAccess(app, unsigned, first.refresh_token);

      expect(renewed.status).toBe(400);
      expect(renewed.body).toMatchObject({ error: 'invalid_client' });
    });

    it('keeps a refresh token for 30 days from its last use, and refuses it after 31 without a renewal', async () => {
      const connected = Date.parse('2027-01-10T10:00:00Z');
      at(connected);
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'karla@example.com');
      const first = await connectApplication(app, { application: claude, origin, cookie });

      at(connected + 29 * day);
      const second = await renewAccess(app, claude, first.refresh_token);
      at(connected + 58 * day);
      const third = await renewAccess(
        app,
        claude,
        (second.body as ApplicationAccess).refresh_token,
      );
      at(connected + 89 * day);
      const late = await renewAccess(app, claude, (third.body as ApplicationAccess).refresh_token);

      expect([second.status, third.status]).toEqual([200, 200]);
      expect(late.status).toBe(400);
      expect(late.body).toMatchObject({ error: 'invalid_grant' });
    });

    it('keeps the application connected after the account signs out of qando', async () => {
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'lola@example.com');
      const access = await connectApplication(app, { application: claude, origin, cookie });

      await sessionsOf(auth).end({ cookie });

      expect((await sessionsOf(auth).read({ cookie })).account).toBeUndefined();
      const renewed = await renewAccess(app, claude, access.refresh_token);
      expect(renewed.status).toBe(200);
      expect(renewed.body).toMatchObject({ access_token: expect.any(String) as string });
    });

    it('renews nothing with a refresh token the application handed back', async () => {
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'mar@example.com');
      const access = await connectApplication(app, { application: claude, origin, cookie });

      const handedBack = await handBack(app, claude, access.refresh_token);

      expect(handedBack.status).toBe(200);
      const refused = await renewAccess(app, claude, access.refresh_token);
      expect(refused.status).toBe(400);
      expect(refused.body).toMatchObject({ error: 'invalid_grant' });
    });

    it('answers two renewals of the same refresh token sent at once with the same tokens', async () => {
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'nerea@example.com');
      const first = await connectApplication(app, { application: claude, origin, cookie });
      // Neither renewal can use the refresh token up until the test lets it: both are on
      // their way at once, the first not over when the second arrives.
      const holder = await pool.connect();
      try {
        await holder.query('BEGIN; SELECT id FROM oauth_refresh_tokens FOR UPDATE');
        const sent = renewAccess(app, claude, first.refresh_token);
        const sentAgain = renewAccess(app, claude, first.refresh_token);
        await waitingInTheDatabase(2);
        await holder.query('COMMIT');
        const [one, other] = await Promise.all([sent, sentAgain]);

        expect([one.status, other.status]).toEqual([200, 200]);
        const { access_token, refresh_token } = one.body as ApplicationAccess;
        expect(refresh_token).not.toBe(first.refresh_token);
        expect(other.body).toMatchObject({ access_token, refresh_token });
      } finally {
        await holder.query('ROLLBACK');
        holder.release();
      }
    });
  });

  describe('handing a token back', () => {
    /** What the token route answers a renewal with a refresh token that is no longer good. */
    const noLongerGood = { status: 400, body: { error: 'invalid_grant' } };
    /** What a request may say the token it hands back is, or leave unsaid. */
    const said: [string, string | null][] = [
      ['a refresh token', 'refresh_token'],
      ['an access token', 'access_token'],
      ['nothing', null],
    ];

    it.each(said)(
      'answers a token it does not know as done, said to be %s: the application wanted it gone, and it is',
      async (_what, saidToBe) => {
        const claude = applications.publish('Claude');

        const handedBack = await handBack(app, claude, 'NeverGivenByThisServer', { saidToBe });

        expect(handedBack.status).toBe(200);
      },
    );

    it('answers a refresh token handed back a second time as done too, and renews nothing with it', async () => {
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'ursula@example.com');
      const access = await connectApplication(app, { application: claude, origin, cookie });

      const handedBack = await handBack(app, claude, access.refresh_token);
      const again = await handBack(app, claude, access.refresh_token);
      const renewed = await renewAccess(app, claude, access.refresh_token);

      expect([handedBack.status, again.status]).toEqual([200, 200]);
      expect(renewed).toMatchObject(noLongerGood);
    });

    it('hands back a live refresh token the request says is an access token: it is looked for as every kind of token', async () => {
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'vera@example.com');
      const access = await connectApplication(app, { application: claude, origin, cookie });

      const handedBack = await handBack(app, claude, access.refresh_token, {
        saidToBe: 'access_token',
      });
      const renewed = await renewAccess(app, claude, access.refresh_token);

      expect(handedBack.status).toBe(200);
      expect(renewed).toMatchObject(noLongerGood);
    });

    it.each(said)(
      'refuses to hand back an access token, said to be %s: it is signed, and nothing of it is stored to take back',
      async (_what, saidToBe) => {
        const claude = applications.publish('Claude');
        const cookie = await signedInCookie(auth, 'wanda@example.com');
        const access = await connectApplication(app, { application: claude, origin, cookie });

        const refused = await handBack(app, claude, access.access_token, { saidToBe });

        expect(refused.status).toBe(400);
        expect(refused.body).toMatchObject({ error: 'unsupported_token_type' });
      },
    );

    it('refuses a request that names no token', async () => {
      const claude = applications.publish('Claude');

      const refused = await handBack(app, claude, '');

      expect(refused.status).toBe(400);
      expect(refused.body).toMatchObject({ error: 'invalid_request' });
    });

    it('refuses a request from an application that does not say who it is, and hands nothing back', async () => {
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'ximena@example.com');
      const access = await connectApplication(app, { application: claude, origin, cookie });

      const refused = await request(app)
        .post('/api/auth/oauth2/revoke')
        .type('form')
        .send({ token: access.refresh_token });
      const renewed = await renewAccess(app, claude, access.refresh_token);

      expect(refused.status).toBe(401);
      expect(refused.body).toMatchObject({ error: 'invalid_client' });
      expect(renewed.status).toBe(200);
    });
  });

  describe('the use of the account', () => {
    const lastUseOf = async (email: string) => (await accountOf(email)).lastSeenAt.toISOString();

    it('counts a token given to an application, and each renewal, as a use of the account', async () => {
      at('2027-02-01T09:00:00.000Z');
      const claude = applications.publish('Claude');
      const { returned, verifier } = await answered(
        claude,
        await signedInCookie(auth, 'nora@example.com'),
        true,
      );

      at('2027-02-01T09:05:00.000Z');
      const exchanged = await exchangeCode(app, {
        application: claude,
        origin,
        code: returned.searchParams.get('code')!,
        verifier,
      });
      const afterTheToken = await lastUseOf('nora@example.com');
      at('2027-02-20T18:30:00.000Z');
      const renewed = await renewAccess(
        app,
        claude,
        (exchanged.body as ApplicationAccess).refresh_token,
      );

      expect([exchanged.status, renewed.status]).toEqual([200, 200]);
      expect(afterTheToken).toBe('2027-02-01T09:05:00.000Z');
      expect(await lastUseOf('nora@example.com')).toBe('2027-02-20T18:30:00.000Z');
    });
  });

  describe('what the scheduled deletion leaves', () => {
    /** The refresh tokens stored for the account, used or not. */
    const refreshTokensOf = async (email: string) =>
      db.$count(oauthRefreshTokens, eq(oauthRefreshTokens.userId, (await accountOf(email)).id));

    it('refuses as before a replaced refresh token deleted past its expiry, and keeps the application connected', async () => {
      const connected = Date.parse('2027-01-10T10:00:00Z');
      at(connected);
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'olivia@example.com');
      const first = await connectApplication(app, { application: claude, origin, cookie });
      at(connected + 29 * day);
      const second = (await renewAccess(app, claude, first.refresh_token))
        .body as ApplicationAccess;
      at(connected + 58 * day);
      const third = (await renewAccess(app, claude, second.refresh_token))
        .body as ApplicationAccess;

      // The first expired on day 30 and the second on day 59.
      at(connected + 60 * day);
      await deleteNoLongerKept(db, new Date());

      expect(await refreshTokensOf('olivia@example.com')).toBe(1);
      const refused = await renewAccess(app, claude, second.refresh_token);
      expect(refused.status).toBe(400);
      expect(refused.body).toMatchObject({ error: 'invalid_grant' });
      expect((await renewAccess(app, claude, third.refresh_token)).status).toBe(200);
    });

    it('keeps a replaced refresh token until its expiry, so presenting it again still disconnects the application', async () => {
      const connected = Date.parse('2027-01-10T10:00:00Z');
      at(connected);
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'olimpia@example.com');
      const first = await connectApplication(app, { application: claude, origin, cookie });
      at(connected + day);
      const second = (await renewAccess(app, claude, first.refresh_token))
        .body as ApplicationAccess;

      at(connected + 2 * day);
      await deleteNoLongerKept(db, new Date());
      // As someone who took the first refresh token would present it.
      const reused = await renewAccess(app, claude, first.refresh_token);

      expect(reused.status).toBe(400);
      expect((await renewAccess(app, claude, second.refresh_token)).status).toBe(400);
    });

    it('deletes an application nobody connected a day after its document was read, and stores it again to connect it', async () => {
      const asked = Date.parse('2027-02-01T10:00:00Z');
      at(asked);
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'ona@example.com');
      await askToConnect(app, { application: claude, origin, cookie });

      at(asked + day + minute);
      // Another application asked meanwhile is dated, and only that one.
      await askToConnect(app, { application: applications.publish('ChatGPT'), origin, cookie });
      await deleteNoLongerKept(db, new Date());
      const storedAfterADay = await stored(claude.address);
      const access = await connectApplication(app, { application: claude, origin, cookie });

      expect(storedAfterADay).toBe(0);
      expect(access.access_token).toEqual(expect.any(String));
      expect(await stored(claude.address)).toBe(1);
    });

    it('keeps an application asked to connect again a day later while the account answers its consent page', async () => {
      const firstAsked = Date.parse('2027-02-01T10:00:00Z');
      at(firstAsked);
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'oriana@example.com');
      await askToConnect(app, { application: claude, origin, cookie });
      // Its document, read a day ago, is read again before the consent page is shown.
      at(firstAsked + day + minute);
      const { answer, verifier } = await askToConnect(app, { application: claude, origin, cookie });

      at(firstAsked + day + 10 * minute);
      await deleteNoLongerKept(db, new Date());
      const consent = await answerConsent(app, {
        consentPage: sentTo(answer).href,
        accept: true,
        cookie,
        origin,
      });
      const code = new URL((consent.body as { url: string }).url).searchParams.get('code')!;
      const exchanged = await exchangeCode(app, { application: claude, origin, code, verifier });

      expect(consent.status).toBe(200);
      expect(exchanged.status).toBe(200);
    });
    describe('an application asked for while its row would be deleted', () => {
      /**
       * Stores the application as asking to connect leaves it, then, a day later, sends `send`
       * with its document held on its way and deletes what is no longer kept meanwhile: Better
       * Auth has read the application's row before it reads the document again.
       */
      async function deletedWhileItsDocumentIsRead<T>(
        application: PublishedApplication,
        send: () => Promise<T>,
      ): Promise<T> {
        const asked = Date.parse('2027-03-01T10:00:00Z');
        at(asked);
        await askToConnect(app, {
          application,
          origin,
          cookie: await signedInCookie(auth, `${randomUUID()}@example.com`),
        });
        at(asked + day + minute);
        const fetch = applications.hold(application.address);
        const sent = send();
        await fetch.reached;
        await deleteNoLongerKept(db, new Date());
        fetch.release();
        return await sent;
      }

      it('connects an application asked to connect while its row would be deleted', async () => {
        const claude = applications.publish('Claude');
        let cookie = '';

        const { answer, verifier } = await deletedWhileItsDocumentIsRead(claude, async () => {
          cookie = await signedInCookie(auth, 'paola@example.com');
          return await askToConnect(app, { application: claude, origin, cookie });
        });
        const consent = await answerConsent(app, {
          consentPage: sentTo(answer).href,
          accept: true,
          cookie,
          origin,
        });
        const code = new URL((consent.body as { url: string }).url).searchParams.get('code')!;
        const exchanged = await exchangeCode(app, { application: claude, origin, code, verifier });

        expect(sentTo(answer).pathname).toBe('/connect');
        expect(exchanged.status).toBe(200);
      });

      it('refuses a refresh token qando no longer has as such, not the application', async () => {
        const claude = applications.publish('Claude');

        const renewed = await deletedWhileItsDocumentIsRead(claude, () =>
          renewAccess(app, claude, 'a-token-deleted-long-ago'),
        );

        expect(renewed.status).toBe(400);
        expect(renewed.body).toMatchObject({ error: 'invalid_grant' });
      });

      it('answers as done a token handed back that qando no longer has', async () => {
        const claude = applications.publish('Claude');

        const handedBack = await deletedWhileItsDocumentIsRead(claude, () =>
          handBack(app, claude, 'a-token-deleted-long-ago'),
        );

        expect(handedBack.status).toBe(200);
      });

      it('dates the application named after an empty `client_id`, which Better Auth passes over', async () => {
        const claude = applications.publish('Claude');

        // Sent at once, as a request is only sent once awaited.
        const handedBack = await deletedWhileItsDocumentIsRead(
          claude,
          async () =>
            await request(app)
              .post('/api/auth/oauth2/revoke')
              .type('form')
              .send(
                `token=a-token-deleted-long-ago&client_id=&client_id=${encodeURIComponent(claude.address)}`,
              ),
        );

        expect(handedBack.status).toBe(200);
      });

      it('dates the application the form names, whatever the address names', async () => {
        const claude = applications.publish('Claude');
        const another = applications.publish('Another');

        // Sent at once, as a request is only sent once awaited.
        const handedBack = await deletedWhileItsDocumentIsRead(
          claude,
          async () =>
            await request(app)
              .post(`/api/auth/oauth2/revoke?client_id=${encodeURIComponent(another.address)}`)
              .type('form')
              .send({
                token: 'a-token-deleted-long-ago',
                token_type_hint: 'refresh_token',
                client_id: claude.address,
              }),
        );

        expect(handedBack.status).toBe(200);
      });

      it.each([
        ['without a `client_id`', {}],
        ['with an empty `client_id`, which Better Auth takes as none', { client_id: '' }],
        ['after an empty statement, which Better Auth passes over', { client_assertion: '' }],
      ])(
        'takes an application that names itself only in the statement it signed, %s',
        async (_sent, named) => {
          const chatgpt = applications.publishSigning('ChatGPT', origin);

          // Sent at once, as a request is only sent once awaited.
          const handedBack = await deletedWhileItsDocumentIsRead(
            chatgpt,
            async () =>
              await request(app)
                .post('/api/auth/oauth2/revoke')
                .type('form')
                .send(
                  // Written by hand, as a parameter may come twice.
                  [
                    ['token', 'a-token-deleted-long-ago'],
                    ['token_type_hint', 'refresh_token'],
                    ...Object.entries(named),
                    [
                      'client_assertion_type',
                      'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
                    ],
                    ['client_assertion', chatgpt.proof('revoke')],
                  ]
                    .map(([name, value]) => `${name}=${encodeURIComponent(value!)}`)
                    .join('&'),
                ),
          );

          expect(handedBack.status).toBe(200);
        },
      );
    });
  });

  describe('the applications it takes', () => {
    it('reads an application from the document it publishes at its own address', async () => {
      const claude = applications.publish('Claude');
      const askedBefore = applications.asked.length;

      await askToConnect(app, { application: claude, origin });

      expect(applications.asked.slice(askedBefore)).toEqual([claude.address]);
      const taken = await db
        .select()
        .from(oauthClients)
        .where(eq(oauthClients.clientId, claude.address));
      expect(taken).toEqual([
        expect.objectContaining({
          name: 'Claude',
          clientDiscoveryId: 'cimd',
          redirectUris: [claude.redirectUri],
        }),
      ]);
    });

    it.each([
      {
        assistant: 'Claude Code, back to this computer by name on a port of its own',
        redirectUri: 'http://localhost:53682/callback',
        document: {
          client_id: 'https://claude-code.example/oauth/client-metadata',
          client_name: 'Claude Code',
          client_uri: 'https://claude-code.example',
          redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        },
      },
      {
        assistant: 'Claude Code, back to this computer by number on a port of its own',
        redirectUri: 'http://127.0.0.1:53682/callback',
        document: {
          client_id: 'https://claude-code-by-number.example/oauth/client-metadata',
          client_name: 'Claude Code',
          client_uri: 'https://claude-code-by-number.example',
          redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        },
      },
      {
        assistant: 'Claude, which lists a grant qando does not give',
        redirectUri: 'https://claude.example/api/mcp/auth_callback',
        document: {
          client_id: 'https://claude.example/oauth/mcp-oauth-client-metadata',
          client_name: 'Claude',
          client_uri: 'https://claude.example',
          redirect_uris: ['https://claude.example/api/mcp/auth_callback'],
          grant_types: [
            'authorization_code',
            'refresh_token',
            'urn:ietf:params:oauth:grant-type:jwt-bearer',
          ],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        },
      },
      {
        assistant: 'ChatGPT, which signs its requests with a key of its own',
        redirectUri: 'https://chatgpt.example/connector_platform_oauth_redirect',
        document: {
          client_id: 'https://chatgpt.example/oauth/client.json',
          client_uri: 'https://chatgpt.example/',
          redirect_uris: ['https://chatgpt.example/connector_platform_oauth_redirect'],
          token_endpoint_auth_method: 'private_key_jwt',
          token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
          grant_types: [
            'authorization_code',
            'refresh_token',
            'urn:ietf:params:oauth:grant-type:jwt-bearer',
          ],
          response_types: ['code'],
          client_name: 'ChatGPT',
          logo_uri: 'https://static.example/misc/logo.png',
          token_endpoint_auth_signing_alg: 'RS256',
          jwks_uri: 'https://chatgpt.example/oauth/jwks.json',
        },
      },
    ])('takes a document shaped like the one of $assistant', async ({ redirectUri, document }) => {
      applications.publishDocument(document.client_id, document);

      const { answer } = await askToConnect(app, {
        application: { address: document.client_id, redirectUri },
        origin,
      });

      expect(sentTo(answer).pathname).toBe('/sign-in');
      expect(await stored(document.client_id)).toBe(1);
    });

    it.each([
      ['its name', 'client_name'],
      ['where to return to', 'redirect_uris'],
    ])('refuses an application whose document does not say %s', async (_what, missing) => {
      const address = `https://without-${missing.replace('_', '-')}.example/client.json`;
      const redirectUri = 'https://assistant.example/callback';
      const whole = { client_id: address, client_name: 'Asistente', redirect_uris: [redirectUri] };
      applications.publishDocument(
        address,
        Object.fromEntries(Object.entries(whole).filter(([key]) => key !== missing)),
      );

      const { answer } = await askToConnect(app, { application: { address, redirectUri }, origin });

      expect(answer.status).toBe(400);
      expect(answer.body).toMatchObject({ error: 'invalid_client' });
      expect(await stored(address)).toBe(0);
    });

    it('refuses an application whose document names another address than the one it was read at', async () => {
      const address = 'https://impostor.example/client.json';
      const named = 'https://claude.example/oauth/another-client.json';
      const redirectUri = 'https://impostor.example/callback';
      applications.publishDocument(address, {
        client_id: named,
        client_name: 'Claude',
        redirect_uris: [redirectUri],
      });

      const { answer } = await askToConnect(app, { application: { address, redirectUri }, origin });

      expect(answer.status).toBe(400);
      expect(answer.body).toMatchObject({ error: 'invalid_client' });
      expect([await stored(address), await stored(named)]).toEqual([0, 0]);
    });

    it('never returns to an address the application’s document does not list', async () => {
      const claude = applications.publish('Claude');
      const elsewhere = 'https://elsewhere.example/callback';

      const { answer } = await askToConnect(app, {
        application: { ...claude, redirectUri: elsewhere },
        origin,
        cookie: await signedInCookie(auth, 'olga@example.com'),
      });

      expect(nothingToAllow(answer)).toBe('invalid_redirect');
      expect(answer.headers.location).not.toContain('elsewhere.example');
    });

    describe('an address to return to that a browser would run, not open', () => {
      /** Publishes an application whose document lists those addresses to return to. */
      function publishedWith(redirectUris: readonly string[]): string {
        const address = `https://${randomUUID()}.example/client.json`;
        applications.publishDocument(address, {
          client_id: address,
          client_name: 'Asistente',
          redirect_uris: redirectUris,
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        });
        return address;
      }

      // The consent page sends the browser to the address the consent answers: one of these
      // would run there, as qando's own page.
      const run = [
        ['a script', 'javascript:alert(1)//'],
        ['a script whose scheme is written in capitals', 'JavaScript:alert(1)//'],
        ['a page written in the address itself', 'data:text/html,<script>alert(1)</script>'],
        ['a script of older browsers', 'vbscript:msgbox(1)'],
      ];

      it.each(run)(
        'refuses a request to return to %s, though the application’s document lists it, and signs nothing for the consent page',
        async (_what, redirectUri) => {
          const address = publishedWith([redirectUri]);

          const { answer } = await askToConnect(app, {
            application: { address, redirectUri },
            origin,
            cookie: await signedInCookie(auth, 'rita@example.com'),
          });

          expect(nothingToAllow(answer)).toBe('invalid_request');
          expect(await stored(address)).toBe(0);
        },
      );

      it.each(run)(
        'refuses an application whose document lists %s, even asked to return to another address of it',
        async (_what, dangerous) => {
          const redirectUri = 'https://assistant.example/callback';
          const address = publishedWith([redirectUri, dangerous]);

          const { answer } = await askToConnect(app, {
            application: { address, redirectUri },
            origin,
            cookie: await signedInCookie(auth, 'sara@example.com'),
          });

          expect(answer.status).toBe(400);
          expect(answer.body).toMatchObject({ error: 'invalid_client' });
          expect(await stored(address)).toBe(0);
        },
      );
    });

    it('returns to an application installed on the computer at an address of a scheme of its own, which the consent answers as any other', async () => {
      const address = `https://${randomUUID()}.example/client.json`;
      const redirectUri = 'cursor://anysphere.cursor-mcp/oauth/callback';
      applications.publishDocument(address, {
        client_id: address,
        client_name: 'Cursor',
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      });
      const cookie = await signedInCookie(auth, 'tina@example.com');

      const { returned, state } = await answered({ address, redirectUri }, cookie, true);

      expect(`${returned.protocol}//${returned.host}${returned.pathname}`).toBe(redirectUri);
      expect(Object.fromEntries(returned.searchParams)).toEqual({
        code: expect.any(String) as string,
        state,
        iss: issuer,
      });
    });

    it('sends a request that asks to choose among accounts, which qando has not, to the consent page with nothing to allow', async () => {
      const claude = applications.publish('Claude');

      const { answer } = await askToConnect(app, {
        application: claude,
        origin,
        cookie: await signedInCookie(auth, 'pura@example.com'),
        query: { prompt: 'select_account' },
      });

      expect(nothingToAllow(answer)).toBe('unsupported_prompt_select_account');
    });
  });

  describe('its routes', () => {
    /** The routes of the sign-in library that are served, under `/api/auth`. */
    const served = [
      'GET /oauth2/authorize',
      'POST /oauth2/token',
      'POST /oauth2/consent',
      'POST /oauth2/revoke',
      'GET /jwks',
    ];

    /** Routes of qando's own at an address the library also has: signing out is ours. */
    const ours = ['POST /sign-out'];

    /** How a route is asked for: its method and its path under `/api/auth`. */
    const ask = {
      GET: (path: string) => request(app).get(path),
      POST: (path: string) => request(app).post(path).set('Origin', origin).send({}),
      PATCH: (path: string) => request(app).patch(path).set('Origin', origin).send({}),
      DELETE: (path: string) => request(app).delete(path).set('Origin', origin).send({}),
    };

    it('serves no other route of the sign-in library', async () => {
      // Every route the library has, as it lists them itself: an upgrade that adds one is asked
      // for here without anybody adding it. A route for any method (`*`, which none has today)
      // counts as read and posted to; one only the server can call has a path or none.
      const routes = Object.values(auth.api).flatMap(({ path, options }) => {
        const methods: readonly string[] = [options.method].flat();
        return typeof path === 'string'
          ? methods
              .flatMap((method) => (method === '*' ? ['GET', 'POST'] : [method]))
              .map((method) => `${method} ${path.replaceAll(/:\w+/g, 'x')}`)
          : [];
      });
      const unserved = routes.filter((route) => !served.includes(route) && !ours.includes(route));
      // Were the library to list its routes another way, this test would ask for none.
      expect(routes).toEqual(expect.arrayContaining(served));
      expect(unserved).toEqual(
        expect.arrayContaining([
          'POST /oauth2/register',
          'POST /oauth2/introspect',
          'GET /oauth2/public-client',
          'GET /token',
          'GET /get-session',
          'POST /sign-in/email-otp',
          'GET /.well-known/oauth-authorization-server',
        ]),
      );

      const answered: string[] = [];
      for (const route of unserved) {
        const [method, path] = route.split(' ');
        if (method !== 'GET' && method !== 'POST' && method !== 'PATCH' && method !== 'DELETE') {
          throw new Error(`A route with a method this test does not ask with: ${route}`);
        }
        const response = await ask[method](`/api/auth${path}`);
        if (response.status !== 404) answered.push(`${route}: ${response.status}`);
      }

      expect(answered).toEqual([]);
    });

    it.each(['/api/auth/oauth2/token', '/api/auth/oauth2/revoke'])(
      'refuses a request to %s sent as JSON, which takes a form, as nothing that went wrong',
      async (path) => {
        const claude = applications.publish('Claude');

        const refused = await request(app).post(path).send({
          grant_type: 'refresh_token',
          refresh_token: 'a-refresh-token-nobody-was-given',
          token: 'a-refresh-token-nobody-was-given',
          client_id: claude.address,
        });

        expect(refused.status).toBe(415);
        expect([reported, written()]).toEqual([[], []]);
      },
    );

    it('refuses a request that names another site’s address to return to, as nothing that went wrong', async () => {
      const claude = applications.publish('Claude');

      const refused = await request(app).post('/api/auth/oauth2/token').type('form').send({
        grant_type: 'refresh_token',
        refresh_token: 'a-refresh-token-nobody-was-given',
        client_id: claude.address,
        callbackURL: 'https://another-site.example/',
      });

      expect(refused.status).toBe(403);
      expect([reported, written()]).toEqual([[], []]);
    });

    /** The headers of an answer that say what it is, without those that only frame its body. */
    const describedBy = ({ headers }: { headers: Record<string, string> }) =>
      Object.fromEntries(
        Object.entries(headers).filter(
          ([name]) => !['date', 'connection', 'transfer-encoding', 'content-length'].includes(name),
        ),
      );

    it.each([
      '/.well-known/oauth-authorization-server/api/auth',
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/api/mcp',
      '/api/auth/jwks',
      '/api/auth/oauth2/authorize',
    ])('answers HEAD at %s as it answers GET, with the same status and headers', async (path) => {
      const read = await request(app).get(path);

      const asked = await request(app).head(path);

      expect(read.status).not.toBe(404);
      expect({ status: asked.status, headers: describedBy(asked) }).toEqual({
        status: read.status,
        headers: describedBy(read),
      });
    });

    it('refuses an application that asks to register itself: the route does not exist', async () => {
      const response = await request(app)
        .post('/api/auth/oauth2/register')
        .send({
          client_name: 'Asistente',
          redirect_uris: ['https://assistant.example/callback'],
          token_endpoint_auth_method: 'none',
        });

      expect(response.status).toBe(404);
    });
  });

  describe('its limit per address', () => {
    /** Requests one address may send in a minute, over every route of the authorization server. */
    const limit = 60;

    // The chains the hosting forwards, as measured in production: through the web's `/api/*`
    // rewrite (CDN, rewrite proxy, CDN) and straight to the API's own URL (CDN only).
    const throughTheWeb = (client: string) =>
      `${client}, 162.158.42.8, 162.158.42.8,74.220.48.253, 162.158.111.185`;
    const straight = (client: string) => `${client}, 162.158.95.213`;

    /** Reads the server's metadata as the client at this address, behind the hosting's proxies. */
    const readMetadataFrom = (client: string) =>
      request(app)
        .get('/.well-known/oauth-authorization-server/api/auth')
        .set('X-Forwarded-For', throughTheWeb(client));

    /** Asks for tokens with a refresh token nobody was given, as an application's server does. */
    const askForTokens = (application: PublishedApplication, forwardedFor: string) =>
      request(app)
        .post('/api/auth/oauth2/token')
        .set('X-Forwarded-For', forwardedFor)
        .type('form')
        .send({
          grant_type: 'refresh_token',
          refresh_token: 'a-refresh-token-nobody-was-given',
          client_id: application.address,
        });

    async function spend(count: number, send: () => PromiseLike<{ status: number }>) {
      for (let sent = 0; sent < count; sent += 1) {
        expect((await send()).status, `request ${sent + 1}`).not.toBe(429);
      }
    }

    it(`answers ${limit} requests a minute from one address and refuses the next with 429 RATE_LIMITED and the time to wait`, async () => {
      await spend(limit, () => readMetadataFrom('203.0.113.7'));

      const refused = await readMetadataFrom('203.0.113.7');

      expect(refused.status).toBe(429);
      expect(refused.body).toEqual({
        error: { code: 'RATE_LIMITED', message: 'Too many requests', details: [] },
      });
      expect(refused.headers['cache-control']).toBe('no-store');
      expect(Number(refused.headers['retry-after'])).toBeGreaterThanOrEqual(1);
      expect(Number(refused.headers['retry-after'])).toBeLessThanOrEqual(60);
    });

    it('counts each address on its own behind the hosting’s proxies: one that used up its minute does not stop another', async () => {
      await spend(limit, () => readMetadataFrom('203.0.113.7'));

      const other = await readMetadataFrom('198.51.100.9');

      expect(other.status).toBe(200);
    });

    it('counts an address the same through the web and straight to the API', async () => {
      const claude = applications.publish('Claude');
      await spend(limit, () => readMetadataFrom('203.0.113.7'));

      const refused = await askForTokens(claude, straight('203.0.113.7'));

      expect(refused.status).toBe(429);
    });

    it('counts its routes together: changing the route does not start another count', async () => {
      await spend(limit, () => readMetadataFrom('203.0.113.7'));
      const from = { 'X-Forwarded-For': throughTheWeb('203.0.113.7') };

      const answered = {
        authorize: await request(app).get('/api/auth/oauth2/authorize').set(from),
        consent: await request(app).post('/api/auth/oauth2/consent').set(from).send({}),
        token: await request(app).post('/api/auth/oauth2/token').set(from).type('form'),
        revoke: await request(app).post('/api/auth/oauth2/revoke').set(from).type('form'),
        keys: await request(app).get('/api/auth/jwks').set(from),
        connector: await request(app).get('/.well-known/oauth-protected-resource').set(from),
        connectorByPath: await request(app)
          .get('/.well-known/oauth-protected-resource/api/mcp')
          .set(from),
      };

      expect(
        Object.fromEntries(Object.entries(answered).map(([route, { status }]) => [route, status])),
      ).toEqual({
        authorize: 429,
        consent: 429,
        token: 429,
        revoke: 429,
        keys: 429,
        connector: 429,
        connectorByPath: 429,
      });
    });

    it('counts a HEAD as the GET it stands for: they share one count', async () => {
      const from = { 'X-Forwarded-For': throughTheWeb('203.0.113.7') };
      await spend(limit, () =>
        request(app).head('/.well-known/oauth-authorization-server/api/auth').set(from),
      );

      const refused = await readMetadataFrom('203.0.113.7');

      expect(refused.status).toBe(429);
    });

    it('neither counts nor refuses the requests for anything else, such as qando’s own session route', async () => {
      const from = { 'X-Forwarded-For': throughTheWeb('203.0.113.7') };
      const readSession = () => request(app).get('/api/auth/session').set(from);
      await spend(limit, readSession);
      await spend(limit, () => readMetadataFrom('203.0.113.7'));

      const session = await readSession();

      expect(session.status).toBe(200);
    });
  });
});
