import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../db/database.js';
import { runMigrations } from '../../db/migrate.js';
import { sessions, users, verifications } from '../../db/schema.js';
import { createFreshDatabase, type FreshDatabase } from '../../test/fresh-database.js';
import { createAuth, type Auth } from './auth.js';

describe('createAuth against PostgreSQL', () => {
  let database: FreshDatabase;
  let pool: pg.Pool;
  let db: Database;
  let auth: Auth;
  const sent: { email: string; code: string }[] = [];
  /** What the next delivery does once the code is recorded; succeeds by default. */
  let deliver: () => Promise<void> = () => Promise.resolve();

  beforeAll(async () => {
    database = await createFreshDatabase();
    pool = new pg.Pool({ connectionString: database.url });
    await runMigrations(pool);
    db = createDatabase(pool);
    auth = createAuth({
      db,
      secret: 'test-secret-for-the-integration-tests-only-0123456789',
      baseURL: 'http://localhost:3000',
      sendSignInCode: (email, code) => {
        sent.push({ email, code });
        return deliver();
      },
      log: () => undefined,
    });
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
  });

  async function sendCode(email: string): Promise<string> {
    await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
    const last = sent.at(-1);
    if (last?.email !== email.toLowerCase()) throw new Error(`No code was sent to ${email}`);
    return last.code;
  }

  const storedCodes = (email: string) =>
    db
      .select()
      .from(verifications)
      .where(eq(verifications.identifier, `sign-in-otp-${email}`));

  it('sends a 6-digit code and stores only its hash, valid for 10 minutes', async () => {
    const before = Date.now();

    const code = await sendCode('Gema@Example.com');

    expect(code).toMatch(/^\d{6}$/);
    const [stored, ...others] = await storedCodes('gema@example.com');
    expect(others).toEqual([]);
    expect(stored?.value).not.toContain(code);
    const lifetime = stored!.expiresAt.getTime() - before;
    expect(lifetime).toBeGreaterThan(9.9 * 60_000);
    expect(lifetime).toBeLessThanOrEqual(10 * 60_000 + 5_000);
  });

  it('signs in a new email: a verified account, a session, and the code used up', async () => {
    const code = await sendCode('hugo@example.com');

    const signedIn = await auth.api.signInEmailOTP({
      body: { email: 'hugo@example.com', otp: code },
    });

    const [user] = await db.select().from(users).where(eq(users.email, 'hugo@example.com'));
    expect(user).toMatchObject({ id: signedIn.user.id, emailVerified: true });
    const userSessions = await db.select().from(sessions).where(eq(sessions.userId, user!.id));
    expect(userSessions.map((session) => session.token)).toEqual([signedIn.token]);
    expect(await storedCodes('hugo@example.com')).toEqual([]);
  });

  it('signs the same account in again with a new code, in a new session', async () => {
    const first = await auth.api.signInEmailOTP({
      body: { email: 'iris@example.com', otp: await sendCode('iris@example.com') },
    });

    const second = await auth.api.signInEmailOTP({
      body: { email: 'iris@example.com', otp: await sendCode('iris@example.com') },
    });

    expect(second.user.id).toBe(first.user.id);
    const userSessions = await db.select().from(sessions).where(eq(sessions.userId, first.user.id));
    expect(userSessions).toHaveLength(2);
  });

  const signIn = (email: string, otp: string) => auth.api.signInEmailOTP({ body: { email, otp } });

  /** A six-digit code other than `code`. */
  const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

  const refusal = (code: string) => ({ body: { code } });

  it('refuses a used code', async () => {
    const code = await sendCode('lia@example.com');
    await signIn('lia@example.com', code);

    await expect(signIn('lia@example.com', code)).rejects.toMatchObject(refusal('INVALID_OTP'));
  });

  it('refuses an expired code', async () => {
    const code = await sendCode('mar@example.com');
    await db
      .update(verifications)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(verifications.identifier, 'sign-in-otp-mar@example.com'));

    await expect(signIn('mar@example.com', code)).rejects.toMatchObject(refusal('OTP_EXPIRED'));
  });

  it('refuses even the right code after 5 wrong tries', async () => {
    const code = await sendCode('noa@example.com');
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(signIn('noa@example.com', wrong(code))).rejects.toMatchObject(
        refusal('INVALID_OTP'),
      );
    }

    await expect(signIn('noa@example.com', code)).rejects.toMatchObject(
      refusal('TOO_MANY_ATTEMPTS'),
    );
  });

  it('accepts the right code after 4 wrong tries', async () => {
    const code = await sendCode('olga@example.com');
    for (let attempt = 0; attempt < 4; attempt++) {
      await expect(signIn('olga@example.com', wrong(code))).rejects.toThrow();
    }

    const signedIn = await signIn('olga@example.com', code);

    expect(signedIn.user.email).toBe('olga@example.com');
  });

  it('a new code replaces the last one', async () => {
    const first = await sendCode('pau@example.com');
    const second = await sendCode('pau@example.com');

    await expect(signIn('pau@example.com', first)).rejects.toMatchObject(refusal('INVALID_OTP'));
    expect((await signIn('pau@example.com', second)).user.email).toBe('pau@example.com');
  });

  it('answers only once the code email is delivered', async () => {
    let delivered!: () => void;
    deliver = () => new Promise((resolve) => (delivered = resolve));
    let answered = false;

    const sending = auth.api
      .sendVerificationOTP({ body: { email: 'jon@example.com', type: 'sign-in' } })
      .then(() => (answered = true));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const beforeDelivery = answered;
    delivered();
    await sending;

    expect(beforeDelivery).toBe(false);
    expect(answered).toBe(true);
    deliver = () => Promise.resolve();
  });

  it('sends no email for the code types qando does not offer', async () => {
    const before = sent.length;

    await auth.api.sendVerificationOTP({
      body: { email: 'iris@example.com', type: 'forget-password' },
    });

    expect(sent).toHaveLength(before);
  });
});
