import { eq } from 'drizzle-orm';
import pg from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { createDatabase, type Database } from '../../db/database.js';
import type { ErrorLogEntry } from '../../http/error-boundary.js';
import { runMigrations } from '../../db/migrate.js';
import { oauthClients, oauthConsents, users } from '../../db/schema.js';
import { createFreshDatabase, type FreshDatabase } from '../../test/fresh-database.js';
import {
  answerConsent,
  askToConnect,
  connectApplication,
  exchangeCode,
  handBack,
  publishedApplications,
  renewAccess,
  type ApplicationAccess,
  type PublishedApplication,
} from '../../test/published-application.js';
import { testDependencies } from '../../test/test-dependencies.js';
import { authorizationServerOf, createAuth, sessionsOf, type Auth } from './auth.js';

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
      log: () => undefined,
      fetchApplicationDocument: applications.fetch,
    });
  });

  // An app for each test: each starts its own count of the requests an address has sent.
  beforeEach(() => {
    app = createApp({
      ...testDependencies(),
      sessions: sessionsOf(auth),
      authorizationServer: authorizationServerOf(auth),
      logError: (entry) => failures.push(entry),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    // No request failed inside the API: a refusal is an answer of the authorization server.
    expect(failures.splice(0)).toEqual([]);
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
  });

  /** Signs the email in with a code and answers the `Cookie` header its browser sends back. */
  async function sessionOf(email: string): Promise<string> {
    const otp = await auth.api.createVerificationOTP({ body: { email, type: 'sign-in' } });
    const { headers } = await auth.api.signInEmailOTP({
      body: { email, otp },
      returnHeaders: true,
    });
    return headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
  }

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
   * Asks to connect as the signed-in account and answers the consent page, up to where the
   * application is sent back to with a code or a refusal.
   */
  async function answered(application: PublishedApplication, cookie: string, accept: boolean) {
    const { answer, verifier, state } = await askToConnect(app, { application, origin, cookie });
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
      const cookie = await sessionOf('ana@example.com');

      const { answer } = await askToConnect(app, { application: claude, origin, cookie });

      expect(answer.headers.location).toMatch(/^\/connect\?/);
      const consent = sentTo(answer);
      expect(consent.searchParams.get('client_id')).toBe(claude.address);
      expect(consent.searchParams.get('sig')).toEqual(expect.any(String));
    });

    it('after "allow", returns to the application’s address with a code, its state and the issuer', async () => {
      const claude = applications.publish('Claude');
      const cookie = await sessionOf('bea@example.com');

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

    it('after "do not allow", returns to the application with a refusal and stores no consent', async () => {
      const claude = applications.publish('Claude');
      const cookie = await sessionOf('carla@example.com');

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
      const cookie = await sessionOf('dora@example.com');
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

    it('exchanges the code for an access token of one hour, issued for the connector’s address, and a refresh token', async () => {
      const claude = applications.publish('Claude');
      const cookie = await sessionOf('eva@example.com');

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

    it('refuses the code with another verifier than the one it was asked with', async () => {
      const claude = applications.publish('Claude');
      const { returned } = await answered(claude, await sessionOf('fina@example.com'), true);

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
        cookie: await sessionOf('gema@example.com'),
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
        cookie: await sessionOf('helga@example.com'),
        query: { resource: 'https://another-service.example/api/mcp' },
      });

      const returned = sentTo(answer);
      expect(`${returned.origin}${returned.pathname}`).toBe(claude.redirectUri);
      expect(returned.searchParams.get('error')).toBe('invalid_target');
      expect(returned.searchParams.has('code')).toBe(false);
    });

    it('serves the keys tokens are signed with', async () => {
      const claude = applications.publish('Claude');
      const cookie = await sessionOf('ines@example.com');
      const access = await connectApplication(app, { application: claude, origin, cookie });

      const response = await request(app).get('/api/auth/jwks');

      expect(response.status).toBe(200);
      const { keys } = response.body as { keys: { kid: string }[] };
      expect(keys.map(({ kid }) => kid)).toContain(signerOf(access.access_token));
    });
  });

  describe('renewing the access', () => {
    it('renews the access with the refresh token, which is replaced by a new one', async () => {
      const claude = applications.publish('Claude');
      const cookie = await sessionOf('julia@example.com');
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
      const cookie = await sessionOf('julieta@example.com');

      const first = await connectApplication(app, { application: chatgpt, origin, cookie });
      const renewed = await renewAccess(app, chatgpt, first.refresh_token);

      expect(renewed.status).toBe(200);
      const second = renewed.body as ApplicationAccess;
      expect(claimsOf(second.access_token)).toMatchObject({ aud: connector });
      expect(second.refresh_token).not.toBe(first.refresh_token);
    });

    it('refuses a token request of an application that signs when it carries no proof', async () => {
      const chatgpt = applications.publishSigning('ChatGPT', origin);
      const cookie = await sessionOf('justa@example.com');
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
      const cookie = await sessionOf('karla@example.com');
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
      const cookie = await sessionOf('lola@example.com');
      const access = await connectApplication(app, { application: claude, origin, cookie });

      await sessionsOf(auth).end({ cookie });

      expect((await sessionsOf(auth).read({ cookie })).account).toBeUndefined();
      const renewed = await renewAccess(app, claude, access.refresh_token);
      expect(renewed.status).toBe(200);
      expect(renewed.body).toMatchObject({ access_token: expect.any(String) as string });
    });

    it('renews nothing with a refresh token the application handed back', async () => {
      const claude = applications.publish('Claude');
      const cookie = await sessionOf('mar@example.com');
      const access = await connectApplication(app, { application: claude, origin, cookie });

      const handedBack = await handBack(app, claude, access.refresh_token);

      expect(handedBack.status).toBe(200);
      const refused = await renewAccess(app, claude, access.refresh_token);
      expect(refused.status).toBe(400);
      expect(refused.body).toMatchObject({ error: 'invalid_grant' });
    });

    it('answers two renewals of the same refresh token sent at once with the same tokens', async () => {
      const claude = applications.publish('Claude');
      const cookie = await sessionOf('nerea@example.com');
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

  describe('the use of the account', () => {
    const lastUseOf = async (email: string) => (await accountOf(email)).lastSeenAt.toISOString();

    it('counts a token given to an application, and each renewal, as a use of the account', async () => {
      at('2027-02-01T09:00:00.000Z');
      const claude = applications.publish('Claude');
      const { returned, verifier } = await answered(
        claude,
        await sessionOf('nora@example.com'),
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
        cookie: await sessionOf('olga@example.com'),
      });

      const error = sentTo(answer);
      expect(`${error.origin}${error.pathname}`).toBe(`${issuer}/error`);
      expect(error.searchParams.get('error')).toBe('invalid_redirect');
      expect(answer.headers.location).not.toContain('elsewhere.example');
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
