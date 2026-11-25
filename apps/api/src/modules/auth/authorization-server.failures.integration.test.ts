import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { createDatabase } from '../../db/database.js';
import type { ErrorLogEntry } from '../../http/error-boundary.js';
import { runMigrations } from '../../db/migrate.js';
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

/** The public address of qando's pages and API. */
const origin = 'http://localhost:4200';
const secret = 'test-secret-for-the-integration-tests-only-0123456789';
const second = 1000;
const minute = 60 * second;

// The pool has one connection, as no production pool does, so that these tests also say what a
// request holds: one that needed a second connection while it kept the first, or kept one while
// it waited for an application's server, would wait for ever and its test would time out.
describe('the authorization server when an application’s request fails midway, against PostgreSQL', () => {
  let database: FreshDatabase;
  let pool: pg.Pool;
  let auth: Auth;
  let app: ReturnType<typeof createApp>;
  /** What the app logged of requests that failed. */
  const failures: ErrorLogEntry[] = [];
  /** The applications that publish who they are, read without leaving the computer. */
  const applications = publishedApplications();
  /** What a read of an application's document waits for before it is answered. */
  let beforeADocumentIsRead: () => Promise<void> = () => Promise.resolve();
  /** Lets the database take again every write a test made it refuse. */
  const allowed: (() => Promise<unknown>)[] = [];

  beforeAll(async () => {
    database = await createFreshDatabase();
    pool = new pg.Pool({ connectionString: database.url, max: 1 });
    await runMigrations(pool);
    auth = createAuth({
      db: createDatabase(pool),
      secret,
      baseURL: origin,
      log: () => undefined,
      fetchApplicationDocument: async (address) => {
        await beforeADocumentIsRead();
        return applications.fetch(address);
      },
    });
  });

  beforeEach(() => {
    app = createApp({
      ...testDependencies(),
      sessions: sessionsOf(auth),
      authorizationServer: authorizationServerOf(auth),
      logError: (entry) => failures.push(entry),
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    beforeADocumentIsRead = () => Promise.resolve();
    for (const allow of allowed.splice(0)) await allow();
    failures.length = 0;
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

  /** The system's clock, which the sign-in library reads, set to a time of the test's. */
  function at(time: number): void {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(time);
  }

  /**
   * Makes the database refuse the write, as a full disk or a lost connection would, where it
   * happens: every `INSERT` into (or `UPDATE` of) the table, or only the rows `when` describes.
   * Answers how to let it through again, which the end of the test does otherwise.
   */
  async function refusing(
    write: 'INSERT' | 'UPDATE',
    table: string,
    when = 'true',
  ): Promise<() => Promise<void>> {
    await pool.query(`
      CREATE FUNCTION refuse() RETURNS trigger LANGUAGE plpgsql AS
        $$ BEGIN RAISE EXCEPTION 'refused by the test'; END $$;
      CREATE TRIGGER refused BEFORE ${write} ON ${table}
        FOR EACH ROW WHEN (${when}) EXECUTE FUNCTION refuse()`);
    let refused = true;
    const allow = async () => {
      if (!refused) return;
      refused = false;
      await pool.query(`DROP TRIGGER refused ON ${table}; DROP FUNCTION refuse()`);
    };
    allowed.push(allow);
    return allow;
  }

  /** Asks to connect and allows it: the code the application is sent back with, not yet exchanged. */
  async function codeFor(application: PublishedApplication, cookie: string) {
    const { answer, verifier } = await askToConnect(app, { application, origin, cookie });
    const consent = await answerConsent(app, {
      consentPage: answer.headers.location!,
      accept: true,
      cookie,
      origin,
    });
    const code = new URL((consent.body as { url: string }).url).searchParams.get('code')!;
    return { application, origin, code, verifier };
  }

  /**
   * Holds the next read of an application's server: `asked` resolves when it is asked for, and
   * it is answered once the test calls `answer`.
   */
  function holdingTheNextRead() {
    let answer = (): void => undefined;
    const asked = new Promise<void>((isAsked) => {
      beforeADocumentIsRead = () => {
        isAsked();
        return new Promise<void>((answered) => {
          answer = answered;
        });
      };
    });
    return {
      asked,
      answer: () => {
        answer();
      },
    };
  }

  /** The API's answer to a failure of its own, as every route gives it. */
  const fault = {
    status: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: 'The request failed', details: [] } },
  };

  describe('renewing the access', () => {
    it('keeps the refresh token usable when its replacement cannot be stored: the same renewal, sent again, succeeds', async () => {
      const claude = applications.publish('Claude');
      const cookie = await sessionOf('ana@example.com');
      const first = await connectApplication(app, { application: claude, origin, cookie });
      const allow = await refusing('INSERT', 'oauth_refresh_tokens');

      const failed = await renewAccess(app, claude, first.refresh_token);
      await allow();
      const renewed = await renewAccess(app, claude, first.refresh_token);

      expect(renewed.status).toBe(200);
      expect(failed).toMatchObject(fault);
      const second = renewed.body as ApplicationAccess;
      expect(second.access_token).toEqual(expect.any(String));
      expect(second.refresh_token).toEqual(expect.any(String));
      expect(second.refresh_token).not.toBe(first.refresh_token);
    });

    it('logs the failure as every fault of the API, never with the query that failed', async () => {
      const console = vi.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);
      const claude = applications.publish('Claude');
      const cookie = await sessionOf('alba@example.com');
      const first = await connectApplication(app, { application: claude, origin, cookie });
      await refusing('INSERT', 'oauth_refresh_tokens');

      await renewAccess(app, claude, first.refresh_token);

      expect(failures).toMatchObject([{ message: 'Request failed', method: 'POST' }]);
      expect(console).not.toHaveBeenCalled();
    });

    it('gives tokens that work even when the answer kept for a repeated renewal cannot be stored', async () => {
      const claude = applications.publish('Claude');
      const cookie = await sessionOf('bea@example.com');
      const first = await connectApplication(app, { application: claude, origin, cookie });
      await refusing('UPDATE', 'oauth_refresh_tokens', 'NEW.rotation_replay_response IS NOT NULL');

      const renewed = await renewAccess(app, claude, first.refresh_token);
      const again = await renewAccess(
        app,
        claude,
        (renewed.body as ApplicationAccess).refresh_token,
      );

      expect([renewed.status, again.status]).toEqual([200, 200]);
    });

    it('answers a renewal sent twice within 30 seconds with the same tokens', async () => {
      const connected = Date.parse('2027-03-01T10:00:00Z');
      at(connected);
      const claude = applications.publish('Claude');
      const cookie = await sessionOf('carla@example.com');
      const first = await connectApplication(app, { application: claude, origin, cookie });

      at(connected + minute);
      const renewed = await renewAccess(app, claude, first.refresh_token);
      at(connected + minute + 29 * second);
      const repeated = await renewAccess(app, claude, first.refresh_token);

      expect([renewed.status, repeated.status]).toEqual([200, 200]);
      const { access_token, refresh_token } = renewed.body as ApplicationAccess;
      expect(repeated.body).toMatchObject({ access_token, refresh_token });
    });

    it('disconnects the application when a refresh token is used again after 30 seconds: the refusal keeps what it deleted', async () => {
      const connected = Date.parse('2027-03-02T10:00:00Z');
      at(connected);
      const claude = applications.publish('Claude');
      const cookie = await sessionOf('dora@example.com');
      const first = await connectApplication(app, { application: claude, origin, cookie });
      const renewed = await renewAccess(app, claude, first.refresh_token);

      at(connected + 31 * second);
      const reused = await renewAccess(app, claude, first.refresh_token);
      const latest = await renewAccess(
        app,
        claude,
        (renewed.body as ApplicationAccess).refresh_token,
      );

      expect(renewed.status).toBe(200);
      expect(reused.status).toBe(400);
      expect(latest.status).toBe(400);
      expect(latest.body).toMatchObject({ error: 'invalid_grant' });
    });

    it('holds no database connection while it reads the application’s document again', async () => {
      const connected = Date.parse('2027-03-03T10:00:00Z');
      at(connected);
      const claude = applications.publish('Claude');
      const cookie = await sessionOf('eva@example.com');
      const first = await connectApplication(app, { application: claude, origin, cookie });
      // An hour later the document read when it connected is no longer trusted.
      at(connected + 61 * minute);
      const read = holdingTheNextRead();

      const renewing = renewAccess(app, claude, first.refresh_token);
      await read.asked;
      // The pool's only connection is free: the database answers while the read is on its way.
      const meanwhile = await pool.query('SELECT 1 AS answered');
      read.answer();
      const renewed = await renewing;

      expect(meanwhile.rows).toEqual([{ answered: 1 }]);
      expect(renewed.status).toBe(200);
    });

    it('keeps what it read again of the application though the renewal then fails: its new name stays stored', async () => {
      const connected = Date.parse('2027-03-04T10:00:00Z');
      at(connected);
      const claude = applications.publish('Claude');
      const cookie = await sessionOf('gala@example.com');
      const first = await connectApplication(app, { application: claude, origin, cookie });
      // An hour later the document is read again, and by then the application has another name.
      at(connected + 61 * minute);
      applications.publishDocument(claude.address, {
        client_id: claude.address,
        client_name: 'Claude, renamed',
        redirect_uris: [claude.redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      });
      await refusing('INSERT', 'oauth_refresh_tokens');

      const failed = await renewAccess(app, claude, first.refresh_token);

      // The sign-in library takes the document as stored for the next hour: it must be.
      const names = await pool.query('SELECT name FROM oauth_clients WHERE client_id = $1', [
        claude.address,
      ]);
      expect(failed).toMatchObject(fault);
      expect(names.rows).toEqual([{ name: 'Claude, renamed' }]);
    });
  });

  describe('exchanging a code for tokens', () => {
    it('does not use the code up when its tokens cannot be stored: the same code, sent again, gives them', async () => {
      const claude = applications.publish('Claude');
      const cookie = await sessionOf('fina@example.com');
      const exchange = await codeFor(claude, cookie);
      const allow = await refusing('INSERT', 'oauth_refresh_tokens');

      const failed = await exchangeCode(app, exchange);
      await allow();
      const exchanged = await exchangeCode(app, exchange);

      expect(exchanged.status).toBe(200);
      expect(failed).toMatchObject(fault);
      expect(exchanged.body).toMatchObject({
        access_token: expect.any(String) as string,
        refresh_token: expect.any(String) as string,
      });
    });
  });

  // Each of its token requests carries a proof of who sends it, signed with its key and taken
  // once: the proof is used up with what the request gives, or not at all.
  describe('an application that signs its token requests', () => {
    it('renews with the very same request once it failed midway: its proof was not used up', async () => {
      const chatgpt = applications.publishSigning('ChatGPT', origin);
      const cookie = await sessionOf('hilda@example.com');
      const first = await connectApplication(app, { application: chatgpt, origin, cookie });
      const proof = chatgpt.proof();
      const allow = await refusing('INSERT', 'oauth_refresh_tokens');

      const failed = await renewAccess(app, chatgpt, first.refresh_token, proof);
      await allow();
      const renewed = await renewAccess(app, chatgpt, first.refresh_token, proof);

      expect(renewed.status).toBe(200);
      expect(failed).toMatchObject(fault);
      expect(renewed.body).toMatchObject({
        access_token: expect.any(String) as string,
        refresh_token: expect.any(String) as string,
      });
    });

    it('exchanges its code with the very same request once it failed midway', async () => {
      const chatgpt = applications.publishSigning('ChatGPT', origin);
      const cookie = await sessionOf('irene@example.com');
      const exchange = { ...(await codeFor(chatgpt, cookie)), proof: chatgpt.proof() };
      const allow = await refusing('INSERT', 'oauth_refresh_tokens');

      const failed = await exchangeCode(app, exchange);
      await allow();
      const exchanged = await exchangeCode(app, exchange);

      expect(exchanged.status).toBe(200);
      expect(failed).toMatchObject(fault);
      expect(exchanged.body).toMatchObject({
        access_token: expect.any(String) as string,
        refresh_token: expect.any(String) as string,
      });
    });

    it('refuses a renewal sent again after it succeeded: its proof is taken once', async () => {
      const chatgpt = applications.publishSigning('ChatGPT', origin);
      const cookie = await sessionOf('julia@example.com');
      const first = await connectApplication(app, { application: chatgpt, origin, cookie });
      const proof = chatgpt.proof();

      const renewed = await renewAccess(app, chatgpt, first.refresh_token, proof);
      // Without its proof, a renewal repeated this soon would be answered with the same tokens.
      const again = await renewAccess(app, chatgpt, first.refresh_token, proof);

      expect(renewed.status).toBe(200);
      expect(again.status).toBe(400);
      expect(again.body).toEqual({
        error: 'invalid_client',
        error_description: 'client assertion jti has already been used',
      });
    });

    it('refuses the exchange of a code sent again after it succeeded, as a proof presented twice', async () => {
      const chatgpt = applications.publishSigning('ChatGPT', origin);
      const cookie = await sessionOf('karen@example.com');
      const exchange = { ...(await codeFor(chatgpt, cookie)), proof: chatgpt.proof() };

      const exchanged = await exchangeCode(app, exchange);
      const again = await exchangeCode(app, exchange);

      expect(exchanged.status).toBe(200);
      expect(again.status).toBe(400);
      expect(again.body).toMatchObject({ error: 'invalid_client' });
    });

    it('takes the proof of a renewal it refuses too: it cannot be presented again', async () => {
      const chatgpt = applications.publishSigning('ChatGPT', origin);
      const cookie = await sessionOf('lara@example.com');
      const first = await connectApplication(app, { application: chatgpt, origin, cookie });
      const proof = chatgpt.proof();

      const refused = await renewAccess(app, chatgpt, 'not-a-refresh-token', proof);
      const again = await renewAccess(app, chatgpt, first.refresh_token, proof);

      expect(refused.status).toBe(400);
      expect(refused.body).toMatchObject({ error: 'invalid_grant' });
      expect(again.status).toBe(400);
      expect(again.body).toMatchObject({ error: 'invalid_client' });
    });

    it('takes the proof of a request it refuses before it reads a refresh token: none was named', async () => {
      const chatgpt = applications.publishSigning('ChatGPT', origin);
      const cookie = await sessionOf('lidia@example.com');
      const first = await connectApplication(app, { application: chatgpt, origin, cookie });
      const proof = chatgpt.proof();

      const refused = await renewAccess(app, chatgpt, '', proof);
      const again = await renewAccess(app, chatgpt, first.refresh_token, proof);

      expect(refused.status).toBe(400);
      expect(refused.body).toMatchObject({ error: 'invalid_request' });
      expect(again.status).toBe(400);
      expect(again.body).toMatchObject({ error: 'invalid_client' });
    });

    it('holds no database connection while it reads the application’s keys', async () => {
      const connected = Date.parse('2027-03-05T10:00:00Z');
      at(connected);
      const chatgpt = applications.publishSigning('ChatGPT', origin);
      const cookie = await sessionOf('marta@example.com');
      const first = await connectApplication(app, { application: chatgpt, origin, cookie });
      // Eleven minutes later the keys read when it connected are no longer trusted; its
      // document, read then too, still is.
      at(connected + 11 * minute);
      const read = holdingTheNextRead();

      const renewing = renewAccess(app, chatgpt, first.refresh_token);
      await read.asked;
      // The pool's only connection is free: the database answers while the read is on its way.
      const meanwhile = await pool.query('SELECT 1 AS answered');
      read.answer();
      const renewed = await renewing;

      expect(meanwhile.rows).toEqual([{ answered: 1 }]);
      expect(renewed.status).toBe(200);
      expect(applications.asked.at(-1)).toMatch(/\/jwks\.json$/);
    });
  });

  describe('handing a refresh token back', () => {
    /** What the token route answers a renewal with a refresh token that is no longer good. */
    const noLongerGood = { status: 400, body: { error: 'invalid_grant' } };
    /** What a proof presented a second time is answered. */
    const presentedTwice = {
      status: 400,
      body: {
        error: 'invalid_client',
        error_description: 'client assertion jti has already been used',
      },
    };

    it('renews nothing with a refresh token handed back by a signed request', async () => {
      const chatgpt = applications.publishSigning('ChatGPT', origin);
      const cookie = await sessionOf('noelia@example.com');
      const access = await connectApplication(app, { application: chatgpt, origin, cookie });

      const handedBack = await handBack(app, chatgpt, access.refresh_token);
      const renewed = await renewAccess(app, chatgpt, access.refresh_token);

      expect(handedBack.status).toBe(200);
      expect(renewed).toMatchObject(noLongerGood);
    });

    it('hands it back with the very same signed request once it failed midway: its proof was not used up', async () => {
      const chatgpt = applications.publishSigning('ChatGPT', origin);
      const cookie = await sessionOf('olga@example.com');
      const access = await connectApplication(app, { application: chatgpt, origin, cookie });
      const proof = chatgpt.proof('revoke');
      const allow = await refusing('UPDATE', 'oauth_refresh_tokens');

      const failed = await handBack(app, chatgpt, access.refresh_token, { proof });
      await allow();
      const handedBack = await handBack(app, chatgpt, access.refresh_token, { proof });
      const renewed = await renewAccess(app, chatgpt, access.refresh_token);

      expect(handedBack.status).toBe(200);
      expect(failed).toMatchObject(fault);
      expect(renewed).toMatchObject(noLongerGood);
    });

    it('answers a hand-back that could not be written as a fault, never as done: the refresh token still renews', async () => {
      const claude = applications.publish('Claude');
      const cookie = await sessionOf('paula@example.com');
      const access = await connectApplication(app, { application: claude, origin, cookie });
      const allow = await refusing('UPDATE', 'oauth_refresh_tokens');

      const failed = await handBack(app, claude, access.refresh_token);
      await allow();
      const renewed = await renewAccess(app, claude, access.refresh_token);

      expect(failed).toMatchObject(fault);
      expect(renewed.status).toBe(200);
    });

    it('logs the failure as every fault of the API, never with the query that failed', async () => {
      const console = vi.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);
      const claude = applications.publish('Claude');
      const cookie = await sessionOf('queralt@example.com');
      const access = await connectApplication(app, { application: claude, origin, cookie });
      await refusing('UPDATE', 'oauth_refresh_tokens');

      await handBack(app, claude, access.refresh_token);

      expect(failures).toMatchObject([{ message: 'Request failed', method: 'POST' }]);
      expect(console).not.toHaveBeenCalled();
    });

    it('refuses a signed hand-back sent again after it succeeded: its proof is taken once', async () => {
      const chatgpt = applications.publishSigning('ChatGPT', origin);
      const cookie = await sessionOf('rosa@example.com');
      const access = await connectApplication(app, { application: chatgpt, origin, cookie });
      const proof = chatgpt.proof('revoke');

      const handedBack = await handBack(app, chatgpt, access.refresh_token, { proof });
      const again = await handBack(app, chatgpt, access.refresh_token, { proof });

      expect(handedBack.status).toBe(200);
      expect(again).toMatchObject(presentedTwice);
    });

    it('takes a proof once over both routes: the one a renewal presented hands nothing back', async () => {
      const chatgpt = applications.publishSigning('ChatGPT', origin);
      const cookie = await sessionOf('sara@example.com');
      const first = await connectApplication(app, { application: chatgpt, origin, cookie });
      const proof = chatgpt.proof('server');

      const renewed = await renewAccess(app, chatgpt, first.refresh_token, proof);
      const second = (renewed.body as ApplicationAccess).refresh_token;
      const refused = await handBack(app, chatgpt, second, { proof });
      const renewedAgain = await renewAccess(app, chatgpt, second);

      expect(renewed.status).toBe(200);
      expect(refused).toMatchObject(presentedTwice);
      expect(renewedAgain.status).toBe(200);
    });

    it('refuses a proof presented twice when the request does not say what the token is too, as a token it does not find', async () => {
      const chatgpt = applications.publishSigning('ChatGPT', origin);
      const cookie = await sessionOf('tania@example.com');
      const first = await connectApplication(app, { application: chatgpt, origin, cookie });
      const proof = chatgpt.proof('server');

      const renewed = await renewAccess(app, chatgpt, first.refresh_token, proof);
      const second = (renewed.body as ApplicationAccess).refresh_token;
      const refused = await handBack(app, chatgpt, second, { proof, saidToBe: null });
      const renewedAgain = await renewAccess(app, chatgpt, second);

      expect(renewed.status).toBe(200);
      // The sign-in library tries such a token as each kind it knows, and answers whatever
      // refusal the last try met as a token not found.
      expect(refused.status).toBe(400);
      expect(refused.body).toMatchObject({ error: 'invalid_request' });
      expect(renewedAgain.status).toBe(200);
    });
  });
});

describe('the authorization server as it starts, against PostgreSQL', () => {
  let database: FreshDatabase;
  let pool: pg.Pool;

  beforeAll(async () => {
    database = await createFreshDatabase();
    pool = new pg.Pool({ connectionString: database.url, max: 1 });
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
  });

  /** The API's sign-in and authorization server, starting at a public address. */
  const starting = (baseURL: string) =>
    createAuth({ db: createDatabase(pool), secret, baseURL, log: () => undefined });

  /** The addresses tokens are issued for, as stored. */
  const issuedFor = async () =>
    (await pool.query('SELECT identifier FROM oauth_resources')).rows as unknown[];

  it('has started once what tokens are issued for is stored', async () => {
    await starting(origin).started();

    expect(await issuedFor()).toEqual([{ identifier: `${origin}/api/mcp` }]);
  });

  it('does not start when what tokens are issued for cannot be stored, whatever was stored for an earlier address', async () => {
    await starting(origin).started();
    await pool.query(`
      CREATE FUNCTION refuse() RETURNS trigger LANGUAGE plpgsql AS
        $$ BEGIN RAISE EXCEPTION 'refused by the test'; END $$;
      CREATE TRIGGER refused BEFORE INSERT ON oauth_resources
        FOR EACH ROW EXECUTE FUNCTION refuse()`);

    const started = starting('https://qando.example').started();

    await expect(started).rejects.toThrow('What tokens are issued for is not stored');
    await pool.query('DROP TRIGGER refused ON oauth_resources; DROP FUNCTION refuse()');
    expect(await issuedFor()).toEqual([{ identifier: `${origin}/api/mcp` }]);
  });
});
