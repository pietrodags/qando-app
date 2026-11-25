import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../../db/database.js';
import { runMigrations } from '../../db/migrate.js';
import { users } from '../../db/schema.js';
import type { SendEmail } from '../../email/email.js';
import { createFreshDatabase, type FreshDatabase } from '../../test/fresh-database.js';
import { createAuth, emailCodesOf, type EmailCodes } from './auth.js';

const secret = 'test-secret-for-the-integration-tests-only-0123456789';
const baseURL = 'http://localhost:4200';

// Two processes of the API serve at once while a deployment switches over: the old one still
// answers what it was sent while the new one serves. Each process here is the email codes over
// a pool of its own, on the same database.
describe('email codes served by two processes over one database', () => {
  let database: FreshDatabase;
  /** The test's own connections: to hold a stored code, and to look at the database. */
  let pool: pg.Pool;
  const pools: pg.Pool[] = [];

  /** What the email server does with the next email: takes it, refuses it, or holds it. */
  let takes: 'at-once' | 'refusing' | 'holding' = 'at-once';
  /** The codes of the emails the email server took, in the order it took them. */
  const delivered: string[] = [];
  /** The email held on its way, until the test lets it arrive. */
  let held: { readonly arrive: () => void } | undefined;
  /** A stored code held by the test, until it lets go. */
  let holder: pg.PoolClient | undefined;

  const sendEmail: SendEmail = ({ text }) => {
    if (takes === 'refusing') return Promise.reject(new Error('Mailbox unavailable'));
    const take = () => delivered.push(/\b(\d{6})\b/.exec(text)?.[1] ?? text);
    if (takes === 'at-once') {
      take();
      return Promise.resolve();
    }
    return new Promise<void>((arrived) => {
      held = {
        arrive: () => {
          take();
          arrived();
        },
      };
    });
  };

  /** A process of the API, with a pool of that many connections. */
  async function processWith(connections: number): Promise<EmailCodes> {
    const own = new pg.Pool({ connectionString: database.url, max: connections });
    pools.push(own);
    const db = createDatabase(own);
    const log = () => undefined;
    const auth = createAuth({ db, secret, baseURL, log });
    await auth.started();
    return emailCodesOf(auth, { sendEmail, log });
  }

  /** The last code the email server took. */
  const lastDelivered = () => delivered.at(-1) ?? '';

  /** Holds the email's stored code, as a request writing it would, until `letGo`. */
  async function holdStoredCode(email: string): Promise<void> {
    holder = await pool.connect();
    await holder.query('BEGIN');
    await holder.query('SELECT id FROM verifications WHERE identifier = $1 FOR UPDATE', [
      `sign-in-otp-${email}`,
    ]);
  }

  async function letGo(): Promise<void> {
    const holding = holder;
    holder = undefined;
    await holding?.query('COMMIT');
    holding?.release();
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

  /** Resolves once an email is held on its way. */
  const heldOnItsWay = () =>
    vi.waitFor(
      () => {
        if (held === undefined) throw new Error('No email on its way');
      },
      { timeout: 5000, interval: 10 },
    );

  beforeAll(async () => {
    database = await createFreshDatabase();
    pool = new pg.Pool({ connectionString: database.url });
    await runMigrations(pool);
  });

  // Whatever a test left waiting is let go, so that nothing it started is left running.
  afterEach(async () => {
    takes = 'at-once';
    held?.arrive();
    held = undefined;
    await letGo();
  });

  afterAll(async () => {
    await Promise.all(pools.map((own) => own.end()));
    await pool.end();
    await database.drop();
  });

  it('keeps the code last delivered when one process stores it while the other sends a new one', async () => {
    const [first, second] = [await processWith(5), await processWith(5)];
    expect(await first.signInCodes.send('ana@example.com')).toBe('sent');
    // The first process sends a new code; once its email arrives, it stores the new code while
    // the test holds the stored one, and the second process sends one more, which is refused.
    takes = 'holding';
    const sending = first.signInCodes.send('ana@example.com');
    await heldOnItsWay();
    await holdStoredCode('ana@example.com');
    held?.arrive();
    held = undefined;
    await waitingInTheDatabase(1);
    takes = 'refusing';
    const sendingAgain = second.signInCodes.send('ana@example.com');
    await waitingInTheDatabase(2);
    await letGo();

    expect(await sending).toBe('sent');
    expect(await sendingAgain).toBe('not-delivered');
    const signedIn = await second.signInCodes.signIn('ana@example.com', lastDelivered());
    expect(signedIn).toMatchObject({ status: 'signed-in' });
  });

  it('a try in one process waits for the code the other process is storing', async () => {
    const [first, second] = [await processWith(5), await processWith(5)];
    expect(await first.signInCodes.send('blas@example.com')).toBe('sent');
    takes = 'holding';
    const sending = first.signInCodes.send('blas@example.com');
    await heldOnItsWay();
    await holdStoredCode('blas@example.com');
    held?.arrive();
    held = undefined;
    await waitingInTheDatabase(1);
    const trying = second.signInCodes.signIn('blas@example.com', lastDelivered());
    await waitingInTheDatabase(2);
    await letGo();

    expect(await sending).toBe('sent');
    expect(await trying).toMatchObject({ status: 'signed-in' });
  });

  it('a send and a try for another email do not wait for a code being stored', async () => {
    const [first, second] = [await processWith(5), await processWith(5)];
    expect(await first.signInCodes.send('carla@example.com')).toBe('sent');
    await holdStoredCode('carla@example.com');
    const sending = first.signInCodes.send('carla@example.com');
    await waitingInTheDatabase(1);

    expect(await second.signInCodes.send('dario@example.com')).toBe('sent');
    const signedIn = await second.signInCodes.signIn('dario@example.com', lastDelivered());
    expect(signedIn).toMatchObject({ status: 'signed-in' });
    await letGo();
    expect(await sending).toBe('sent');
  });

  it('holds no connection while an email is on its way: a try made meanwhile is answered', async () => {
    const one = await processWith(1);
    expect(await one.signInCodes.send('elena@example.com')).toBe('sent');
    const code = lastDelivered();
    takes = 'holding';
    const sending = one.signInCodes.send('elena@example.com');
    await heldOnItsWay();

    const other = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
    const wrong = await one.signInCodes.signIn('elena@example.com', other);
    const right = await one.signInCodes.signIn('elena@example.com', code);

    expect(wrong).toMatchObject({ status: 'wrong-code', attemptsLeft: 4 });
    expect(right).toMatchObject({ status: 'signed-in' });
    held?.arrive();
    held = undefined;
    expect(await sending).toBe('sent');
  });

  it('deletes an account through a process with a single connection', async () => {
    const one = await processWith(1);
    await one.signInCodes.send('fabio@example.com');
    await one.signInCodes.signIn('fabio@example.com', lastDelivered());
    const [account] = await createDatabase(pool)
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, 'fabio@example.com'));
    expect(await one.accountDeletion.sendCode(account!.id)).toBe('sent');

    const deleted = await one.accountDeletion.delete(account!.id, lastDelivered());

    expect(deleted).toEqual({ status: 'deleted', events: 0 });
  });
});
