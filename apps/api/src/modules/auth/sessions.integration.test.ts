import type { ManagedEvent } from '@qando/contracts';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { createDatabase, type Database } from '../../db/database.js';
import { runMigrations } from '../../db/migrate.js';
import { confirmations, sessions, users } from '../../db/schema.js';
import { seedEvent, type SeededEvent } from '../../seed/seed-event.js';
import { createFreshDatabase, type FreshDatabase } from '../../test/fresh-database.js';
import { testDependencies } from '../../test/test-dependencies.js';
import { createManagedEvents } from '../management/managed-events-repository.js';
import { authRoutesOf, createAuth, sessionsOf, type Auth } from './auth.js';

const origin = 'http://localhost:4200';
const secret = 'test-secret-for-the-integration-tests-only-0123456789';
const day = 24 * 60 * 60 * 1000;

describe('sessions against PostgreSQL', () => {
  let database: FreshDatabase;
  let pool: pg.Pool;
  let db: Database;
  let codes: Map<string, string>;
  const authOn = (baseURL: string) =>
    createAuth({
      db,
      secret,
      baseURL,
      sendSignInCode: (email, code) => {
        codes.set(email, code);
        return Promise.resolve();
      },
    });
  let auth: Auth;
  let app: ReturnType<typeof createApp>;
  let cena: SeededEvent;

  beforeAll(async () => {
    database = await createFreshDatabase();
    pool = new pg.Pool({ connectionString: database.url });
    await runMigrations(pool);
    db = createDatabase(pool);
    codes = new Map();
    auth = authOn(origin);
    app = createApp({
      ...testDependencies(),
      managedEvents: createManagedEvents(db),
      sessions: sessionsOf(auth),
      authRoutes: authRoutesOf(auth),
      now: () => new Date('2026-06-15T08:00:00Z'),
    });
    cena = await seedEvent(db, {
      title: 'Cena de verano',
      options: ['2026-07-06', '2026-07-10'],
      deadline: '2026-07-01',
      organizer: { name: 'Ana', email: 'ana@example.com' },
    });
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
  });

  /** Signs the email in with a code, as the sign-in page will, and answers its `Set-Cookie`. */
  async function signIn(email: string, on = auth): Promise<string[]> {
    await on.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
    const otp = codes.get(email);
    if (otp === undefined) throw new Error(`No code was sent to ${email}`);
    const { headers } = await on.api.signInEmailOTP({ body: { email, otp }, returnHeaders: true });
    return headers.getSetCookie();
  }

  /** The `Cookie` header a browser sends back for these `Set-Cookie` values. */
  const cookieOf = (setCookies: readonly string[]) =>
    setCookies.map((cookie) => cookie.split(';')[0]).join('; ');

  const sessionOf = async (email: string) => cookieOf(await signIn(email));

  const manageCena = (cookie?: string) => {
    const sent = request(app).get(`/api/events/${cena.publicId}`);
    return cookie === undefined ? sent : sent.set('Cookie', cookie);
  };

  const confirmCena = (cookie: string, from?: string) => {
    const sent = request(app)
      .post(`/api/events/${cena.publicId}/confirmation`)
      .set('Cookie', cookie)
      .send({ optionId: cena.optionIds[1] });
    return from === undefined ? sent : sent.set('Origin', from);
  };

  const signOut = (cookie: string, from = origin) =>
    request(app).post('/api/auth/sign-out').set('Cookie', cookie).set('Origin', from);

  it('manages the event with its owner’s session, without its token', async () => {
    const response = await manageCena(await sessionOf('ana@example.com'));

    expect(response.status).toBe(200);
    expect((response.body as ManagedEvent).title).toBe('Cena de verano');
  });

  it('refuses the session of another account with 403', async () => {
    const response = await manageCena(await sessionOf('bea@example.com'));

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('refuses a request without a session or a token with 401', async () => {
    const response = await manageCena();

    expect(response.status).toBe(401);
  });

  it('refuses a cookie that is not a signed session with 401', async () => {
    const response = await manageCena('qando.session_token=forged.value');

    expect(response.status).toBe(401);
  });

  it('signs out: the session is deleted, its cookie cleared, and the old cookie refused', async () => {
    const cookie = await sessionOf('ana@example.com');
    const before = await db.select({ id: sessions.id }).from(sessions);

    const response = await signOut(cookie);

    expect(response.status).toBe(200);
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringMatching(/^qando\.session_token=;.*Max-Age=0/)]),
    );
    expect(await db.select({ id: sessions.id }).from(sessions)).toHaveLength(before.length - 1);
    expect((await manageCena(cookie)).status).toBe(401);
  });

  it('refuses to sign out from a page of another site, keeping the session', async () => {
    const cookie = await sessionOf('ana@example.com');

    const response = await signOut(cookie, 'https://evil.test');

    expect(response.status).toBe(403);
    expect((await manageCena(cookie)).status).toBe(200);
  });

  it('refuses a change with the session from a page of another site, changing nothing', async () => {
    const cookie = await sessionOf('ana@example.com');

    for (const from of ['https://evil.test', undefined]) {
      const response = await confirmCena(cookie, from);
      expect(response.status).toBe(403);
    }

    expect(await db.select().from(confirmations)).toEqual([]);
  });

  it('accepts a change with the owner’s session from a page of qando', async () => {
    const response = await confirmCena(await sessionOf('ana@example.com'), origin);

    expect(response.status).toBe(200);
    expect((response.body as ManagedEvent).state).toBe('confirmed');
  });

  it('renews a session used after a day: 90 days again, its cookie sent back', async () => {
    const cookie = await sessionOf('carla@example.com');
    const [session] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(users.email, 'carla@example.com'));
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + 80 * day) })
      .where(eq(sessions.id, session!.id));

    const response = await manageCena(cookie);

    expect(response.headers['set-cookie']).toEqual([
      expect.stringMatching(/^qando\.session_token=[^;]+;.*Max-Age=7776000/),
    ]);
    const [renewed] = await db.select().from(sessions).where(eq(sessions.id, session!.id));
    expect(renewed!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 89 * day);
  });

  it('sends back no cookie for a session renewed less than a day ago', async () => {
    const response = await manageCena(await sessionOf('ana@example.com'));

    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('over HTTPS, sets a Secure, HttpOnly, SameSite=Lax cookie that lasts 90 days', async () => {
    const [cookie, ...others] = (
      await signIn('dani@example.com', authOn('https://qando.app'))
    ).filter((setCookie) => setCookie.includes('session_token'));

    expect(others).toEqual([]);
    const attributes = cookie!
      .split('; ')
      .slice(1)
      .map((attribute) => attribute.toLowerCase());
    expect(cookie).toMatch(/^__Secure-qando\.session_token=/);
    expect(attributes).toEqual(
      expect.arrayContaining(['httponly', 'secure', 'samesite=lax', 'max-age=7776000']),
    );
  });

  it.each([
    ['post', '/api/auth/email-otp/send-verification-otp'],
    ['post', '/api/auth/sign-in/email-otp'],
    ['get', '/api/auth/get-session'],
    ['get', '/api/auth/list-sessions'],
    ['post', '/api/auth/delete-user'],
  ] as const)('serves none of Better Auth’s other routes: %s %s', async (method, path) => {
    const response = await request(app)[method](path).set('Origin', origin).send({});

    expect(response.status).toBe(404);
  });
});
