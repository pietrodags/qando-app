import type { AddressInfo } from 'node:net';
import { eq } from 'drizzle-orm';
import { simpleParser } from 'mailparser';
import pg from 'pg';
import { SMTPServer } from 'smtp-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { createDatabase, type Database } from '../../db/database.js';
import { runMigrations } from '../../db/migrate.js';
import { sessions, users } from '../../db/schema.js';
import { smtpEmail } from '../../email/email.js';
import { createFreshDatabase, type FreshDatabase } from '../../test/fresh-database.js';
import { testDependencies } from '../../test/test-dependencies.js';
import { createAuth, sessionsOf, signInCodesOf, type AuthLogEntry } from './auth.js';

/** The error a refused request answered. */
const errorOf = (response: request.Response) =>
  (response.body as { error: { code: string; attemptsLeft?: number; details: unknown[] } }).error;

const origin = 'http://localhost:4200';
const secret = 'test-secret-for-the-integration-tests-only-0123456789';

/** An email the fake SMTP server took: its recipient and what it says. */
interface Received {
  readonly to: string;
  readonly from: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

describe('sign-in by email code against PostgreSQL and an SMTP server', () => {
  let database: FreshDatabase;
  let pool: pg.Pool;
  let db: Database;
  let smtp: SMTPServer;
  let app: ReturnType<typeof createApp>;
  const inbox: Received[] = [];
  /** Whether the SMTP server refuses the next emails. */
  let refusing = false;
  /** While set, the SMTP server takes each email and answers only once this settles. */
  let stalled: { readonly until: Promise<void>; received: number } | undefined;
  const logged: AuthLogEntry[] = [];

  beforeAll(async () => {
    database = await createFreshDatabase();
    pool = new pg.Pool({ connectionString: database.url });
    await runMigrations(pool);
    db = createDatabase(pool);
    smtp = new SMTPServer({
      authOptional: true,
      disabledCommands: ['STARTTLS'],
      logger: false,
      onData(stream, _session, callback) {
        if (refusing) {
          const stall = stalled;
          stream.resume();
          stream.on('end', () => {
            if (stall) stall.received += 1;
            void (stall?.until ?? Promise.resolve()).then(() => {
              callback(
                Object.assign(new Error('Mailbox unavailable for x@example.com'), {
                  responseCode: 550,
                }),
              );
            });
          });
          return;
        }
        simpleParser(stream)
          .then((mail) => {
            inbox.push({
              to: mail.to && !Array.isArray(mail.to) ? mail.to.text : '',
              from: mail.from?.text ?? '',
              subject: mail.subject ?? '',
              text: mail.text ?? '',
              html: typeof mail.html === 'string' ? mail.html : '',
            });
            callback();
          })
          .catch(callback);
      },
    });
    await new Promise<void>((resolve) => smtp.listen(0, '127.0.0.1', resolve));
  });

  // A new app for each test: its send limits (per email and per client address) start empty.
  beforeEach(() => {
    const { port } = smtp.server.address() as AddressInfo;
    const auth = createAuth({ db, secret, baseURL: origin, log: (entry) => logged.push(entry) });
    app = createApp({
      ...testDependencies(),
      sessions: sessionsOf(auth),
      signInCodes: signInCodesOf(auth, {
        sendEmail: smtpEmail({
          host: '127.0.0.1',
          port,
          secure: false,
          from: 'qando <no-reply@qando.app>',
        }),
        log: (entry) => logged.push(entry),
      }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    refusing = false;
    stalled = undefined;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      smtp.close(() => {
        resolve();
      });
    });
    await pool.end();
    await database.drop();
  });

  const sendCode = (email: string) =>
    request(app).post('/api/auth/sign-in-code').set('Origin', origin).send({ email });

  const signIn = (email: string, code: string) =>
    request(app).post('/api/auth/sign-in').set('Origin', origin).send({ email, code });

  /** Asks for a code and answers the one the email carries. */
  async function codeFor(email: string): Promise<string> {
    const response = await sendCode(email);
    expect(response.status).toBe(200);
    const last = inbox.at(-1);
    if (last?.to !== email.toLowerCase()) throw new Error(`No code reached ${email}`);
    return /^(\d{6}) es tu código de qando$/.exec(last.subject)?.[1] ?? '';
  }

  /** A 6-digit code other than this one. */
  const otherThan = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

  it('emails a new address a 6-digit code, greeting without a name', async () => {
    const code = await codeFor('Gema@Example.com');

    const email = inbox.at(-1)!;
    expect(code).toMatch(/^\d{6}$/);
    expect(email.from).toBe('"qando" <no-reply@qando.app>');
    expect(email.text).toContain(`Hola:\n\nTu código para entrar en qando es: ${code}`);
    expect(email.html).toContain(`>${code}</div>`);
    expect(email.html).toContain('src="http://localhost:4200/email/logo.png"');
  });

  it('greets an existing account by its name', async () => {
    await db
      .insert(users)
      .values({ id: 'ana-id', name: 'Ana', email: 'ana@example.com', emailVerified: true });

    await codeFor('ana@example.com');

    expect(inbox.at(-1)!.text).toMatch(/^Hola, Ana:\n/);
  });

  it('signs a new email in: a verified account, a session cookie, and the code used up', async () => {
    const code = await codeFor('hugo@example.com');

    const response = await signIn('hugo@example.com', code);
    const again = await signIn('hugo@example.com', code);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ signedIn: true });
    expect(response.headers['set-cookie']).toEqual([
      expect.stringMatching(
        /^qando\.session_token=[^;]+; Max-Age=7776000; Path=\/; HttpOnly; SameSite=Lax$/,
      ),
    ]);
    const [account] = await db.select().from(users).where(eq(users.email, 'hugo@example.com'));
    expect(account).toMatchObject({ emailVerified: true, name: '' });
    expect(await db.select().from(sessions).where(eq(sessions.userId, account!.id))).toHaveLength(
      1,
    );
    expect(errorOf(again).code).toBe('CODE_EXPIRED');
  });

  it('counts the wrong tries down, and voids the code at the fifth, even for the right code', async () => {
    const code = await codeFor('ivan@example.com');
    const wrong = otherThan(code);

    const answers = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      answers.push(errorOf(await signIn('ivan@example.com', wrong)));
    }
    const right = await signIn('ivan@example.com', code);

    expect(answers.map(({ code, attemptsLeft }) => [code, attemptsLeft])).toEqual([
      ['WRONG_CODE', 4],
      ['WRONG_CODE', 3],
      ['WRONG_CODE', 2],
      ['WRONG_CODE', 1],
      ['TOO_MANY_ATTEMPTS', undefined],
    ]);
    expect(right.status).toBe(400);
    expect(errorOf(right).code).toBe('TOO_MANY_ATTEMPTS');
    expect(right.headers['set-cookie']).toBeUndefined();
  });

  it('accepts the right code after 4 wrong tries', async () => {
    const code = await codeFor('julia@example.com');
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await signIn('julia@example.com', otherThan(code));
    }

    const response = await signIn('julia@example.com', code);

    expect(response.status).toBe(200);
  });

  it('a new code, 30 seconds later, replaces the last one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const first = await codeFor('karim@example.com');
    vi.advanceTimersByTime(30_000);
    const second = await codeFor('karim@example.com');

    const withFirst = await signIn('karim@example.com', first);
    const withSecond = await signIn('karim@example.com', second);

    expect(first === second ? 'WRONG_CODE' : errorOf(withFirst).code).toBe('WRONG_CODE');
    expect(withSecond.status).toBe(200);
  });

  it('refuses a code after its 10 minutes as expired', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const code = await codeFor('lola@example.com');
    vi.advanceTimersByTime(10 * 60_000 + 1_000);

    const response = await signIn('lola@example.com', code);

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe('CODE_EXPIRED');
  });

  it('answers an email that was never sent a code as expired', async () => {
    const response = await signIn('nadie@example.com', '123456');

    expect(errorOf(response).code).toBe('CODE_EXPIRED');
  });

  it('answers 502 when the SMTP server refuses the email, logging it without the address', async () => {
    refusing = true;
    logged.length = 0;

    const response = await sendCode('mario@example.com');

    expect(response.status).toBe(502);
    expect(errorOf(response).code).toBe('CODE_NOT_DELIVERED');
    expect(logged).toEqual([
      expect.objectContaining({ level: 'error', message: 'Sign-in code not delivered' }),
    ]);
    expect(JSON.stringify(logged)).not.toContain('example.com');
  });

  it('delivers a new code at once after a failed delivery', async () => {
    refusing = true;
    await sendCode('nora@example.com');
    refusing = false;

    const code = await codeFor('nora@example.com');

    expect((await signIn('nora@example.com', code)).status).toBe(200);
  });

  /** Asks for a code the SMTP server refuses to take. */
  async function failToDeliverTo(email: string): Promise<void> {
    refusing = true;
    expect((await sendCode(email)).status).toBe(502);
    refusing = false;
  }

  it('still accepts the last delivered code after a delivery that failed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const delivered = await codeFor('olga@example.com');
    vi.advanceTimersByTime(30_000);
    await failToDeliverTo('olga@example.com');

    const response = await signIn('olga@example.com', delivered);

    expect(response.status).toBe(200);
  });

  it('keeps the wrong tries of the last delivered code through a failed delivery', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const delivered = await codeFor('pablo@example.com');
    await signIn('pablo@example.com', otherThan(delivered));
    await signIn('pablo@example.com', otherThan(delivered));
    vi.advanceTimersByTime(30_000);
    await failToDeliverTo('pablo@example.com');

    const wrong = await signIn('pablo@example.com', otherThan(delivered));

    expect(errorOf(wrong)).toMatchObject({ code: 'WRONG_CODE', attemptsLeft: 2 });
  });

  it('keeps the expiry of the last delivered code through a failed delivery', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const delivered = await codeFor('quim@example.com');
    vi.advanceTimersByTime(5 * 60_000);
    await failToDeliverTo('quim@example.com');
    vi.advanceTimersByTime(5 * 60_000 + 1_000);

    const response = await signIn('quim@example.com', delivered);

    expect(errorOf(response).code).toBe('CODE_EXPIRED');
  });

  it('a code delivered after a failed delivery replaces the earlier one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const first = await codeFor('rosa@example.com');
    vi.advanceTimersByTime(30_000);
    await failToDeliverTo('rosa@example.com');
    vi.advanceTimersByTime(1_000);
    const second = await codeFor('rosa@example.com');

    const withFirst = await signIn('rosa@example.com', first);
    const withSecond = await signIn('rosa@example.com', second);

    expect(first === second ? 'WRONG_CODE' : errorOf(withFirst).code).toBe('WRONG_CODE');
    expect(withSecond.status).toBe(200);
  });

  it('keeps a code delivered while an older send was still failing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await codeFor('tomas@example.com');
    vi.advanceTimersByTime(30_000);
    let refuse = (): void => undefined;
    const stall = { until: new Promise<void>((resolve) => (refuse = resolve)), received: 0 };
    stalled = stall;
    refusing = true;
    const slow = sendCode('tomas@example.com').then((response) => response.status);
    await vi.waitFor(() => {
      expect(stall.received).toBe(1);
    });
    refusing = false;
    vi.advanceTimersByTime(31_000);
    const later = sendCode('tomas@example.com').then((response) => response.status);
    // Time for the later send to be delivered, were it not waiting for the slow one.
    await new Promise((resolve) => setTimeout(resolve, 300));
    refuse();

    expect(await slow).toBe(502);
    expect(await later).toBe(200);
    const delivered = /^(\d{6}) es tu código de qando$/.exec(inbox.at(-1)!.subject)![1]!;
    expect((await signIn('tomas@example.com', delivered)).status).toBe(200);
  });

  it('leaves no code to guess when the only one asked for was never delivered', async () => {
    await failToDeliverTo('saul@example.com');

    const response = await signIn('saul@example.com', '123456');

    expect(errorOf(response).code).toBe('CODE_EXPIRED');
  });
});
