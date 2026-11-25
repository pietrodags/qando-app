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
import { cancelledEvents, events, sessions, users, verifications } from '../../db/schema.js';
import { smtpEmail } from '../../email/email.js';
import { actingOrganizer } from '../management/managed-events.js';
import { createManagedEvents } from '../management/managed-events-repository.js';
import { seedEvent, type EventSeed, type SeededEvent } from '../../seed/seed-event.js';
import { storedRows } from '../../seed/stored-rows.js';
import {
  connectedApplicationRows,
  storeConnectedApplication,
} from '../../test/connected-application.js';
import { createFreshDatabase, type FreshDatabase } from '../../test/fresh-database.js';
import { testDependencies } from '../../test/test-dependencies.js';
import { createAuth, emailCodesOf, sessionsOf } from './auth.js';

/** The error a refused request answered. */
const errorOf = (response: request.Response) =>
  (response.body as { error: { code: string; attemptsLeft?: number } }).error;

const origin = 'http://localhost:4200';
const secret = 'test-secret-for-the-integration-tests-only-0123456789';

/** An email the fake SMTP server took. */
interface Received {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/** An event of the organizer with this email, two people voted, its summary sent. */
const eventOf = (email: string, title: string): EventSeed => ({
  title,
  options: ['2026-12-11', '2026-12-18'],
  deadline: '2026-12-01',
  organizer: { name: 'Ana', email },
  votes: [
    { name: 'Luis', states: ['available', 'preferred'] },
    { name: 'Marta', states: ['unavailable', 'available'] },
  ],
  emails: { summary: 'sent' },
});

describe('deleting an account with a code, against PostgreSQL and an SMTP server', () => {
  let database: FreshDatabase;
  let pool: pg.Pool;
  let db: Database;
  let smtp: SMTPServer;
  let app: ReturnType<typeof createApp>;
  const inbox: Received[] = [];

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
        simpleParser(stream)
          .then((mail) => {
            inbox.push({
              to: mail.to && !Array.isArray(mail.to) ? mail.to.text : '',
              subject: mail.subject ?? '',
              text: mail.text ?? '',
            });
            callback();
          })
          .catch(callback);
      },
    });
    await new Promise<void>((resolve) => smtp.listen(0, '127.0.0.1', resolve));
  });

  // A new app for each test, so its send limits start empty.
  beforeEach(async () => {
    await db.delete(events);
    await db.delete(cancelledEvents);
    await db.delete(users);
    await db.delete(verifications);
    const { port } = smtp.server.address() as AddressInfo;
    const log = () => undefined;
    const auth = createAuth({ db, secret, baseURL: origin, log });
    const codes = emailCodesOf(auth, {
      sendEmail: smtpEmail({
        host: '127.0.0.1',
        port,
        secure: false,
        from: 'qando <no-reply@qando.app>',
      }),
      log,
    });
    app = createApp({
      ...testDependencies(),
      sessions: sessionsOf(auth),
      signInCodes: codes.signInCodes,
      accountDeletion: codes.accountDeletion,
      now: () => new Date(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
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

  /** The last email to this address. */
  const lastTo = (email: string) => {
    const last = inbox.at(-1);
    if (last?.to !== email) throw new Error(`No email reached ${email}`);
    return last;
  };

  /** Moves the system's clock, which the send limits and the codes read, past the 30 seconds. */
  const later = () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 31_000);
  };

  /** Signs the email in with a code and answers the session cookie. */
  async function signedIn(email: string): Promise<string> {
    await request(app).post('/api/auth/sign-in-code').set('Origin', origin).send({ email });
    const code = /^(\d{6}) es tu código de qando$/.exec(lastTo(email).subject)?.[1];
    const response = await request(app)
      .post('/api/auth/sign-in')
      .set('Origin', origin)
      .send({ email, code });
    const [cookie] = response.get('Set-Cookie') ?? [];
    return cookie!.split(';')[0]!;
  }

  /** Asks for a deletion code with the session and answers the code the email carries. */
  async function deletionCode(cookie: string, email: string): Promise<string> {
    const response = await request(app)
      .post('/api/me/deletion-code')
      .set('Origin', origin)
      .set('Cookie', cookie);
    expect(response.status).toBe(200);
    const { subject, text } = lastTo(email);
    expect(subject).toBe('Tu código para eliminar tu cuenta de qando');
    return /eventos\. (\d{6})\n/.exec(text)?.[1] ?? '';
  }

  const deleteWith = (cookie: string, code: string) =>
    request(app)
      .post('/api/me/deletion')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ code });

  const accountOf = async (email: string) =>
    (await db.select({ id: users.id }).from(users).where(eq(users.email, email)))[0]?.id;

  const sessionsOfAccount = async (accountId: string) =>
    (await db.select().from(sessions).where(eq(sessions.userId, accountId))).length;

  const cancelledTitles = async () =>
    (await db.select({ title: cancelledEvents.title }).from(cancelledEvents)).map(
      ({ title }) => title,
    );

  /** Cancels a stored event as its organizer does, with its management link. */
  const cancel = async ({ publicId, managementToken }: SeededEvent) => {
    const managedEvents = createManagedEvents(db);
    const access = await actingOrganizer(managedEvents, publicId, { managementToken });
    if (access.status !== 'granted') throw new Error('The management link should manage it');
    await managedEvents.cancel(access.organizer);
  };

  it('emails the account a code that deletes it, greeting it by its name', async () => {
    await seedEvent(db, eventOf('ana@example.com', 'Cena de verano'));
    const cookie = await signedIn('ana@example.com');

    const code = await deletionCode(cookie, 'ana@example.com');

    expect(code).toMatch(/^\d{6}$/);
    expect(lastTo('ana@example.com').text).toMatch(
      /^Hola, Ana:\n\nEscribe este código en qando para eliminar tu cuenta y todos tus eventos\./,
    );
  });

  it('deletes the account, its sessions, its events with everything under them and what is left of the ones it cancelled', async () => {
    const cookie = await signedIn('ana@example.com');
    later();
    const otherBrowser = await signedIn('ana@example.com');
    const { eventId } = await seedEvent(db, eventOf('ana@example.com', 'Cena de verano'));
    const cancelled = await seedEvent(db, eventOf('ana@example.com', 'Partido de pádel'));
    await cancel(cancelled);
    const accountId = (await accountOf('ana@example.com'))!;
    const stored = await storedRows(db, eventId!);

    const response = await deleteWith(cookie, await deletionCode(cookie, 'ana@example.com'));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ deleted: true, events: 1 });
    expect(response.headers['set-cookie']).toContain(
      'qando.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
    );
    // Its summary sent, its "voting closed" queued.
    expect(stored).toMatchObject({ options: 2, participations: 2, votes: 4, emails: 2 });
    expect(await accountOf('ana@example.com')).toBeUndefined();
    expect(await sessionsOfAccount(accountId)).toBe(0);
    expect(await storedRows(db, eventId!)).toEqual({
      options: 0,
      participations: 0,
      votes: 0,
      confirmations: 0,
      emails: 0,
    });
    expect(await db.select().from(events)).toEqual([]);
    expect(await cancelledTitles()).toEqual([]);
    const session = await request(app).get('/api/auth/session').set('Cookie', otherBrowser);
    expect(session.body).toBeNull();
  });

  it('leaves the other accounts and their events as they were, and counts none of them', async () => {
    const cookie = await signedIn('ana@example.com');
    await signedIn('luis@example.com');
    const luisEvent = await seedEvent(db, eventOf('luis@example.com', 'Excursión'));
    const luisCancelled = await seedEvent(db, eventOf('luis@example.com', 'Café'));
    await cancel(luisCancelled);
    const luisId = (await accountOf('luis@example.com'))!;

    const response = await deleteWith(cookie, await deletionCode(cookie, 'ana@example.com'));

    expect(response.body).toEqual({ deleted: true, events: 0 });
    expect(await accountOf('luis@example.com')).toBe(luisId);
    expect(await sessionsOfAccount(luisId)).toBe(1);
    expect(await storedRows(db, luisEvent.eventId!)).toMatchObject({ options: 2, votes: 4 });
    expect(await cancelledTitles()).toEqual(['Café']);
  });

  it('deletes what the account allowed applications to do, leaving another account’s', async () => {
    const cookie = await signedIn('ana@example.com');
    await signedIn('luis@example.com');
    const anaId = (await accountOf('ana@example.com'))!;
    const luisId = (await accountOf('luis@example.com'))!;
    await storeConnectedApplication(db, anaId);
    await storeConnectedApplication(db, luisId);
    const stored = await connectedApplicationRows(db, anaId);

    const response = await deleteWith(cookie, await deletionCode(cookie, 'ana@example.com'));

    expect(response.status).toBe(200);
    expect(stored).toEqual({ consents: 1, refreshTokens: 1 });
    expect(await connectedApplicationRows(db, anaId)).toEqual({ consents: 0, refreshTokens: 0 });
    expect(await connectedApplicationRows(db, luisId)).toEqual({ consents: 1, refreshTokens: 1 });
  });

  it('deletes nothing with a wrong code, and tells the tries left', async () => {
    const cookie = await signedIn('ana@example.com');
    const { eventId } = await seedEvent(db, eventOf('ana@example.com', 'Cena de verano'));
    const code = await deletionCode(cookie, 'ana@example.com');
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');

    const response = await deleteWith(cookie, wrong);

    expect(response.status).toBe(400);
    expect(errorOf(response)).toMatchObject({ code: 'WRONG_CODE', attemptsLeft: 4 });
    expect(await accountOf('ana@example.com')).toBeDefined();
    expect(await storedRows(db, eventId!)).toMatchObject({ options: 2, votes: 4 });
    expect((await deleteWith(cookie, code)).status).toBe(200);
  });

  it('takes the code once: the account is gone, and its session with it', async () => {
    const cookie = await signedIn('ana@example.com');
    const code = await deletionCode(cookie, 'ana@example.com');

    await deleteWith(cookie, code);
    const again = await deleteWith(cookie, code);

    expect(again.status).toBe(401);
  });

  it('refuses a code never sent as expired', async () => {
    const cookie = await signedIn('ana@example.com');

    const response = await deleteWith(cookie, '482913');

    expect(errorOf(response).code).toBe('CODE_EXPIRED');
    expect(await accountOf('ana@example.com')).toBeDefined();
  });

  it('lets the email sign in again afterwards, as a new account', async () => {
    const cookie = await signedIn('ana@example.com');
    const before = await accountOf('ana@example.com');

    await deleteWith(cookie, await deletionCode(cookie, 'ana@example.com'));
    later();
    await signedIn('ana@example.com');

    expect(await accountOf('ana@example.com')).toEqual(expect.any(String));
    expect(await accountOf('ana@example.com')).not.toBe(before);
  });
});
