import { and, eq } from 'drizzle-orm';
import pg from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { createDatabase, type Database } from '../../db/database.js';
import type { ErrorLogEntry } from '../../http/error-boundary.js';
import { runMigrations } from '../../db/migrate.js';
import { oauthClients, oauthConsents, oauthRefreshTokens, users } from '../../db/schema.js';
import { ask } from '../../test/assistant.js';
import {
  connectedApplicationRows,
  storeConnectedApplication,
} from '../../test/connected-application.js';
import { createFreshDatabase, type FreshDatabase } from '../../test/fresh-database.js';
import {
  askToConnect,
  answerConsent,
  connectApplication,
  exchangeCode,
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
  sessionsOf,
  type Auth,
  type AuthLogEntry,
} from './auth.js';
import { connectedApplicationsOf } from './account-connections.js';
import { deleteAccount } from './delete-account.js';

/** The public address of qando's pages and API, which every address below hangs from. */
const origin = 'http://localhost:4200';
const secret = 'test-secret-for-the-integration-tests-only-0123456789';
const minute = 60 * 1000;

describe('"Apps conectadas", against PostgreSQL', () => {
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

  beforeEach(() => {
    app = createApp({
      ...testDependencies(),
      sessions: sessionsOf(auth),
      authorizationServer: authorizationServerOf(auth),
      connectionRequests: connectionRequestsOf(auth, db),
      connectorAccess: connectorAccessOf(auth, db),
      connectedApplications: connectedApplicationsOf(db),
      logError: (entry) => failures.push(entry),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    expect(failures.splice(0)).toEqual([]);
    expect(reported.splice(0)).toEqual([]);
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
  });

  /** The system's clock, which the sign-in library reads, set to a time of the test's. */
  function at(time: string): void {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(time));
  }

  const accountOf = async (email: string) =>
    (await db.select().from(users).where(eq(users.email, email)))[0]!;

  /** Connects the application to the account of that email, signed in for it, with every step. */
  const connected = async (application: PublishedApplication, email: string) =>
    connectApplication(app, { application, origin, cookie: await signedInCookie(auth, email) });

  /** "Apps conectadas" as the account's page asks for it. */
  async function listOf(email: string) {
    const response = await request(app)
      .get('/api/me/connected-apps')
      .set('Cookie', await signedInCookie(auth, email));
    expect(response.status).toBe(200);
    return response.body as { id: string; name: string; host: string; connectedAt: string }[];
  }

  /** The connection of the application in the account's list. */
  async function connectionOf(application: PublishedApplication, email: string) {
    const host = new URL(application.address).host;
    const listed = (await listOf(email)).find((connection) => connection.host === host);
    if (listed === undefined) throw new Error(`${application.address} is not listed`);
    return listed.id;
  }

  /** "Desconectar", pressed on the account's page. */
  const disconnect = async (id: string, email: string) =>
    request(app)
      .delete(`/api/me/connected-apps/${encodeURIComponent(id)}`)
      .set('Cookie', await signedInCookie(auth, email))
      .set('Origin', origin);

  /** Asks the connector who it is, as an assistant does, with the application's access token. */
  const callWith = ({ access_token }: ApplicationAccess) =>
    ask(app, '2026-07-28', 'server/discover', {}, { Authorization: `Bearer ${access_token}` });

  /** What the account allowed the application, and what it renews its access with. */
  async function rowsOf(application: PublishedApplication, email: string) {
    const { id } = await accountOf(email);
    const [consents, refreshTokens] = await Promise.all([
      db.$count(
        oauthConsents,
        and(eq(oauthConsents.userId, id), eq(oauthConsents.clientId, application.address)),
      ),
      db.$count(
        oauthRefreshTokens,
        and(
          eq(oauthRefreshTokens.userId, id),
          eq(oauthRefreshTokens.clientId, application.address),
        ),
      ),
    ]);
    return { consents, refreshTokens };
  }

  /** A renewal the authorization server refused: the application must connect again. */
  function refusedAsInvalidGrant(answer: request.Response): void {
    expect({ status: answer.status, error: (answer.body as { error?: unknown }).error }).toEqual({
      status: 400,
      error: 'invalid_grant',
    });
  }

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

  describe('the list', () => {
    it('answers the account’s applications with their name, host and when each was connected, the newest first', async () => {
      const claude = applications.publish('Claude');
      const chatgpt = applications.publish('ChatGPT');
      at('2026-11-20T09:00:00.000Z');
      await connected(claude, 'ana@example.com');
      at('2026-11-24T18:30:00.000Z');
      await connected(chatgpt, 'ana@example.com');
      await connected(claude, 'bea@example.com');

      expect(await listOf('ana@example.com')).toEqual([
        {
          id: expect.any(String) as string,
          name: 'ChatGPT',
          host: new URL(chatgpt.address).host,
          connectedAt: '2026-11-24T18:30:00.000Z',
        },
        {
          id: expect.any(String) as string,
          name: 'Claude',
          host: new URL(claude.address).host,
          connectedAt: '2026-11-20T09:00:00.000Z',
        },
      ]);
    });

    it('answers none for an account that has connected no application', async () => {
      await signedInCookie(auth, 'carla@example.com');

      expect(await listOf('carla@example.com')).toEqual([]);
    });

    it('names an application whose document gave no name by the host of its address', async () => {
      const claude = applications.publish('Claude');
      await connected(claude, 'dani@example.com');
      await db
        .update(oauthClients)
        .set({ name: null })
        .where(eq(oauthClients.clientId, claude.address));

      expect(await listOf('dani@example.com')).toEqual([
        expect.objectContaining({ name: new URL(claude.address).host }),
      ]);
    });

    it('leaves out an allowance with no date, which no token is ever taken with', async () => {
      await signedInCookie(auth, 'eva@example.com');
      await storeConnectedApplication(db, (await accountOf('eva@example.com')).id);

      expect(await listOf('eva@example.com')).toEqual([]);
    });
  });

  describe('disconnecting', () => {
    it('refuses the application’s next call and its next renewal at once, and leaves the account’s other applications and other accounts’ connected', async () => {
      const claude = applications.publish('Claude');
      const chatgpt = applications.publish('ChatGPT');
      const anaWithClaude = await connected(claude, 'fran@example.com');
      const anaWithChatgpt = await connected(chatgpt, 'fran@example.com');
      const beaWithClaude = await connected(claude, 'gala@example.com');

      const response = await disconnect(
        await connectionOf(claude, 'fran@example.com'),
        'fran@example.com',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ disconnected: true });
      expect((await callWith(anaWithClaude)).status).toBe(401);
      refusedAsInvalidGrant(await renewAccess(app, claude, anaWithClaude.refresh_token));
      expect(await rowsOf(claude, 'fran@example.com')).toEqual({ consents: 0, refreshTokens: 0 });
      expect((await listOf('fran@example.com')).map(({ name }) => name)).toEqual(['ChatGPT']);
      expect((await callWith(anaWithChatgpt)).status).toBe(200);
      expect((await callWith(beaWithClaude)).status).toBe(200);
      expect((await renewAccess(app, claude, beaWithClaude.refresh_token)).status).toBe(200);
    });

    it('refuses to disconnect another account’s connection: it stays connected', async () => {
      const claude = applications.publish('Claude');
      const access = await connected(claude, 'hugo@example.com');
      await signedInCookie(auth, 'ines@example.com');

      const response = await disconnect(
        await connectionOf(claude, 'hugo@example.com'),
        'ines@example.com',
      );

      expect(response.status).toBe(404);
      expect(await rowsOf(claude, 'hugo@example.com')).toEqual({ consents: 1, refreshTokens: 1 });
      expect((await callWith(access)).status).toBe(200);
    });

    it('answers a connection disconnected already as not found', async () => {
      const claude = applications.publish('Claude');
      await connected(claude, 'juan@example.com');
      const id = await connectionOf(claude, 'juan@example.com');
      await disconnect(id, 'juan@example.com');

      expect((await disconnect(id, 'juan@example.com')).status).toBe(404);
    });

    it('connected again, it is a new connection: what it had before stays refused', async () => {
      const claude = applications.publish('Claude');
      const start = Date.now();
      const before = await connected(claude, 'kai@example.com');
      const first = await connectionOf(claude, 'kai@example.com');
      await disconnect(first, 'kai@example.com');

      at(new Date(start + 10 * minute).toISOString());
      const after = await connected(claude, 'kai@example.com');

      expect(await connectionOf(claude, 'kai@example.com')).not.toBe(first);
      expect((await callWith(before)).status).toBe(401);
      refusedAsInvalidGrant(await renewAccess(app, claude, before.refresh_token));
      expect((await callWith(after)).status).toBe(200);
    });
  });

  describe('nothing the application renews its access with outlives the disconnection', () => {
    it('a renewal on its way when the application is disconnected is over first, and its new token goes too', async () => {
      const claude = applications.publish('Claude');
      const access = await connected(claude, 'lola@example.com');
      const id = await connectionOf(claude, 'lola@example.com');
      const cookie = await signedInCookie(auth, 'lola@example.com');
      // The renewal has read its refresh token and is recording the account's use, before it
      // replaces the token, when the test holds it.
      const holder = await pool.connect();
      try {
        await holder.query('BEGIN; LOCK TABLE users IN SHARE MODE');
        const renewing = renewAccess(app, claude, access.refresh_token);
        await waitingInTheDatabase(1);
        const disconnecting = request(app)
          .delete(`/api/me/connected-apps/${encodeURIComponent(id)}`)
          .set('Cookie', cookie)
          .set('Origin', origin);
        const sent = disconnecting.then((response) => response);
        await waitingInTheDatabase(2);
        await holder.query('COMMIT');
        const [renewed, disconnected] = await Promise.all([renewing, sent]);

        expect(renewed.status).toBe(200);
        expect(disconnected.status).toBe(200);
        const renewedAccess = renewed.body as ApplicationAccess;
        expect(await rowsOf(claude, 'lola@example.com')).toEqual({ consents: 0, refreshTokens: 0 });
        refusedAsInvalidGrant(await renewAccess(app, claude, renewedAccess.refresh_token));
        expect((await callWith(renewedAccess)).status).toBe(401);
      } finally {
        await holder.query('ROLLBACK');
        holder.release();
      }
    });

    it('a renewal that arrives while the application is being disconnected is refused once it is', async () => {
      const claude = applications.publish('Claude');
      const access = await connected(claude, 'mia@example.com');
      const id = await connectionOf(claude, 'mia@example.com');
      const cookie = await signedInCookie(auth, 'mia@example.com');
      // The disconnection has withdrawn the allowance and waits to delete the tokens.
      const holder = await pool.connect();
      try {
        await holder.query('BEGIN; LOCK TABLE oauth_refresh_tokens IN SHARE MODE');
        const disconnecting = request(app)
          .delete(`/api/me/connected-apps/${encodeURIComponent(id)}`)
          .set('Cookie', cookie)
          .set('Origin', origin)
          .then((response) => response);
        await waitingInTheDatabase(1);
        const renewing = renewAccess(app, claude, access.refresh_token);
        await waitingInTheDatabase(2);
        await holder.query('COMMIT');
        const [disconnected, renewed] = await Promise.all([disconnecting, renewing]);

        expect(disconnected.status).toBe(200);
        refusedAsInvalidGrant(renewed);
        expect(await rowsOf(claude, 'mia@example.com')).toEqual({ consents: 0, refreshTokens: 0 });
      } finally {
        await holder.query('ROLLBACK');
        holder.release();
      }
    });

    it('a code exchanged while the application is disconnected is over first, and its token goes too, also once the application is connected again', async () => {
      const claude = applications.publish('Claude');
      const start = Date.now();
      await connected(claude, 'olga@example.com');
      const id = await connectionOf(claude, 'olga@example.com');
      const cookie = await signedInCookie(auth, 'olga@example.com');
      const { answer, verifier } = await askToConnect(app, { application: claude, origin, cookie });
      const code = new URL(answer.headers.location!).searchParams.get('code')!;
      // The exchange has read its code and is about to use it up, when the test holds it.
      const holder = await pool.connect();
      try {
        await holder.query('BEGIN; LOCK TABLE verifications IN SHARE MODE');
        const exchanging = exchangeCode(app, { application: claude, origin, code, verifier });
        await waitingInTheDatabase(1);
        const disconnecting = request(app)
          .delete(`/api/me/connected-apps/${encodeURIComponent(id)}`)
          .set('Cookie', cookie)
          .set('Origin', origin)
          .then((response) => response);
        await waitingInTheDatabase(2);
        await holder.query('COMMIT');
        const [exchanged, disconnected] = await Promise.all([exchanging, disconnecting]);

        expect(exchanged.status).toBe(200);
        expect(disconnected.status).toBe(200);
        expect(await rowsOf(claude, 'olga@example.com')).toEqual({ consents: 0, refreshTokens: 0 });
        at(new Date(start + 2 * minute).toISOString());
        await connected(claude, 'olga@example.com');
        refusedAsInvalidGrant(
          await renewAccess(app, claude, (exchanged.body as ApplicationAccess).refresh_token),
        );
      } finally {
        await holder.query('ROLLBACK');
        holder.release();
      }
    });

    it('a code given before the disconnection, exchanged after it, gets no token', async () => {
      const claude = applications.publish('Claude');
      await connected(claude, 'nora@example.com');
      const cookie = await signedInCookie(auth, 'nora@example.com');
      // Asked again while connected, the application is sent back with a code at once.
      const { answer, verifier } = await askToConnect(app, { application: claude, origin, cookie });
      const code = new URL(answer.headers.location!).searchParams.get('code')!;
      await disconnect(await connectionOf(claude, 'nora@example.com'), 'nora@example.com');

      refusedAsInvalidGrant(
        await exchangeCode(app, { application: claude, origin, code, verifier }),
      );
      expect(await rowsOf(claude, 'nora@example.com')).toEqual({ consents: 0, refreshTokens: 0 });
    });

    it('a code given before the disconnection stays refused once the application is connected again', async () => {
      const claude = applications.publish('Claude');
      const start = Date.now();
      await connected(claude, 'quim@example.com');
      const cookie = await signedInCookie(auth, 'quim@example.com');
      const { answer, verifier } = await askToConnect(app, { application: claude, origin, cookie });
      const code = new URL(answer.headers.location!).searchParams.get('code')!;
      await disconnect(await connectionOf(claude, 'quim@example.com'), 'quim@example.com');

      at(new Date(start + 2 * minute).toISOString());
      await connected(claude, 'quim@example.com');

      refusedAsInvalidGrant(
        await exchangeCode(app, { application: claude, origin, code, verifier }),
      );
      expect(await rowsOf(claude, 'quim@example.com')).toEqual({ consents: 1, refreshTokens: 1 });
    });

    it('a renewal on its way when the account is deleted is over first, and the account goes with all it gave', async () => {
      const claude = applications.publish('Claude');
      const access = await connected(claude, 'rita@example.com');
      const { id } = await accountOf('rita@example.com');
      // The renewal has read its refresh token and waits to record the account's use; the
      // deletion, sent then, would take the account before the renewal does.
      const holder = await pool.connect();
      try {
        await holder.query('BEGIN; LOCK TABLE users IN SHARE MODE');
        const renewing = renewAccess(app, claude, access.refresh_token);
        await waitingInTheDatabase(1);
        const deleting = deleteAccount(db, id, 'no code');
        await waitingInTheDatabase(2);
        await holder.query('COMMIT');
        const [renewed, events] = await Promise.all([renewing, deleting]);

        expect(renewed.status).toBe(200);
        expect(events).toBe(0);
        expect(await connectedApplicationRows(db, id)).toEqual({ consents: 0, refreshTokens: 0 });
        refusedAsInvalidGrant(
          await renewAccess(app, claude, (renewed.body as ApplicationAccess).refresh_token),
        );
      } finally {
        await holder.query('ROLLBACK');
        holder.release();
      }
    });

    it('a code exchanged while the account is deleted is over first, and the account goes with all it gave', async () => {
      const claude = applications.publish('Claude');
      await connected(claude, 'sara@example.com');
      const { id } = await accountOf('sara@example.com');
      const cookie = await signedInCookie(auth, 'sara@example.com');
      const { answer, verifier } = await askToConnect(app, { application: claude, origin, cookie });
      const code = new URL(answer.headers.location!).searchParams.get('code')!;
      // The exchange has read its code and is about to use it up; the deletion, sent then,
      // would take the account before the exchange stores its tokens for it.
      const holder = await pool.connect();
      try {
        await holder.query('BEGIN; LOCK TABLE verifications IN SHARE MODE');
        const exchanging = exchangeCode(app, { application: claude, origin, code, verifier });
        await waitingInTheDatabase(1);
        const deleting = deleteAccount(db, id, 'no code');
        await waitingInTheDatabase(2);
        await holder.query('COMMIT');
        const [exchanged, events] = await Promise.all([exchanging, deleting]);

        expect(exchanged.status).toBe(200);
        expect(events).toBe(0);
        expect(await connectedApplicationRows(db, id)).toEqual({ consents: 0, refreshTokens: 0 });
        refusedAsInvalidGrant(
          await renewAccess(app, claude, (exchanged.body as ApplicationAccess).refresh_token),
        );
      } finally {
        await holder.query('ROLLBACK');
        holder.release();
      }
    });

    it('a refresh token whose allowance is gone renews nothing, however the allowance went', async () => {
      const claude = applications.publish('Claude');
      const access = await connected(claude, 'olga@example.com');
      const { id } = await accountOf('olga@example.com');
      await db
        .delete(oauthConsents)
        .where(and(eq(oauthConsents.userId, id), eq(oauthConsents.clientId, claude.address)));

      refusedAsInvalidGrant(await renewAccess(app, claude, access.refresh_token));
      expect(await rowsOf(claude, 'olga@example.com')).toEqual({ consents: 0, refreshTokens: 1 });
    });

    it('a code exchanged while the application is allowed gets its tokens, as before', async () => {
      const claude = applications.publish('Claude');
      const cookie = await signedInCookie(auth, 'paz@example.com');
      const { answer, verifier } = await askToConnect(app, { application: claude, origin, cookie });
      const allowed = await answerConsent(app, {
        consentPage: answer.headers.location!,
        accept: true,
        cookie,
        origin,
      });
      const code = new URL((allowed.body as { url: string }).url).searchParams.get('code')!;

      const exchanged = await exchangeCode(app, { application: claude, origin, code, verifier });

      expect(exchanged.status).toBe(200);
      expect(await rowsOf(claude, 'paz@example.com')).toEqual({ consents: 1, refreshTokens: 1 });
    });
  });
});
