import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { createDatabase, type Database } from '../../db/database.js';
import type { ErrorLogEntry } from '../../http/error-boundary.js';
import { runMigrations } from '../../db/migrate.js';
import { createFreshDatabase, type FreshDatabase } from '../../test/fresh-database.js';
import { testDependencies } from '../../test/test-dependencies.js';
import { authorizationServerOf, createAuth, sessionsOf, type Auth } from './auth.js';

/** The public address of qando's pages and API, which every address below hangs from. */
const origin = 'http://localhost:4200';
const secret = 'test-secret-for-the-integration-tests-only-0123456789';
/** Who issues the tokens: the authorization server's own address. */
const issuer = `${origin}/api/auth`;
/** The address assistants call, which access tokens are issued for. */
const connector = `${origin}/api/mcp`;

describe('the authorization server for applications, against PostgreSQL', () => {
  let database: FreshDatabase;
  let pool: pg.Pool;
  let db: Database;
  let auth: Auth;
  let app: ReturnType<typeof createApp>;
  /** What the app logged of requests that failed. */
  const failures: ErrorLogEntry[] = [];

  beforeAll(async () => {
    database = await createFreshDatabase();
    pool = new pg.Pool({ connectionString: database.url });
    await runMigrations(pool);
    db = createDatabase(pool);
    auth = createAuth({ db, secret, baseURL: origin, log: () => undefined });
    app = createApp({
      ...testDependencies(),
      sessions: sessionsOf(auth),
      authorizationServer: authorizationServerOf(auth),
      logError: (entry) => failures.push(entry),
    });
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
  });

  /** A JSON document as a request answered it. */
  type Document = Record<string, unknown>;

  /** The authorization server's metadata, read where assistants look for it. */
  async function serverMetadata(): Promise<Document> {
    const response = await request(app).get('/.well-known/oauth-authorization-server/api/auth');
    expect(response.status).toBe(200);
    expect(response.type).toBe('application/json');
    return response.body as Document;
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
});
