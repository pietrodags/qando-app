import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/database.js';
import { runMigrations } from '../db/migrate.js';
import { events, notifications } from '../db/schema.js';
import { createFreshDatabase, type FreshDatabase } from '../test/fresh-database.js';
import { movingClock, type MovingClock } from '../test/moving-clock.js';
import { storeUser } from '../test/stored-user.js';
import type { OutgoingEmail, SendEmail } from './email.js';
import {
  dropUnsentVotingClosed,
  emailOutbox,
  retryFailedEmail,
  scheduleEmail,
  scheduleVotingClosed,
  type ComposeEmail,
  type EmailOutbox,
  type OutboxLogEntry,
} from './outbox.js';

const minute = 60_000;

/** What an email server answers when it refuses an address, quoting it. */
function refusal(to: string): Error {
  return Object.assign(new Error(`Can't send mail - all recipients were rejected: 550 ${to}`), {
    code: 'EENVELOPE',
    responseCode: 550,
  });
}

describe('email outbox against PostgreSQL', () => {
  let database: FreshDatabase;
  let pool: pg.Pool;
  let db: Database;

  beforeAll(async () => {
    database = await createFreshDatabase();
    pool = new pg.Pool({ connectionString: database.url });
    await runMigrations(pool);
    db = createDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
    await database.drop();
  });

  let clock: MovingClock;
  let delivered: OutgoingEmail[];
  let tried: number;
  let logged: OutboxLogEntry[];
  /** The email server: takes every email unless a test says otherwise. */
  let server: SendEmail;

  beforeEach(async () => {
    await db.delete(notifications);
    clock = movingClock();
    delivered = [];
    tried = 0;
    logged = [];
    server = (email) => {
      delivered.push(email);
      return Promise.resolve();
    };
  });

  const sendEmail: SendEmail = (email) => {
    tried += 1;
    return server(email);
  };

  /** A template that reads the event in the sending transaction, as the real ones do. */
  const compose: ComposeEmail = async ({ eventId, type }, tx) => {
    const [event] = await tx
      .select({ title: events.title })
      .from(events)
      .where(eq(events.id, eventId));
    return { subject: `${type}: ${event!.title}`, text: 'Texto', html: '<p>Texto</p>' };
  };

  function outbox(settings: { compose?: ComposeEmail; db?: Database } = {}): EmailOutbox {
    return emailOutbox({
      db: settings.db ?? db,
      sendEmail,
      compose: settings.compose ?? compose,
      now: clock.now,
      log: (entry) => logged.push(entry),
    });
  }

  async function storeEvent(title = 'Cena de verano'): Promise<string> {
    const ownerId = await storeUser(db);
    const [event] = await db
      .insert(events)
      .values({
        ownerId,
        publicId: `${ownerId}-p`,
        resultsId: `${ownerId}-r`,
        managementTokenHash: `${ownerId}-m`,
        organizerName: 'Ana',
        organizerEmail: 'ana@example.com',
        title,
        timeZone: 'Europe/Madrid',
        deadline: '2026-07-01',
        closesAt: new Date('2026-07-01T21:59:59Z'),
        anonymous: false,
      })
      .returning({ id: events.id });
    return event!.id;
  }

  async function storedEmail(eventId: string, type: 'summary' | 'voting_closed' = 'summary') {
    const [row] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.eventId, eventId))
      .then((rows) => rows.filter((stored) => stored.type === type));
    return row!;
  }

  /**
   * A database reached through connections of its own, which `stop` ends as the database does
   * when the API's process stops: what that process had not committed is undone.
   */
  async function stoppableDatabase(
    run: (stoppable: { db: Database; stop: () => Promise<void> }) => Promise<void>,
  ) {
    const name = `outbox-${randomUUID()}`;
    const connections = new pg.Pool({ connectionString: database.url, application_name: name });
    // An ended connection reports it on its client and its pool: the process that held it is gone.
    connections.on('error', () => undefined);
    connections.on('connect', (client) => client.on('error', () => undefined));
    const stop = async () => {
      // Waits for each connection to end, so its locks are gone once `stop` resolves.
      await pool.query(
        'SELECT pg_terminate_backend(pid, 10000) FROM pg_stat_activity WHERE application_name = $1',
        [name],
      );
    };
    try {
      await run({ db: createDatabase(connections), stop });
    } finally {
      await connections.end();
    }
  }

  const summaryOf = (eventId: string, at = clock.now()) =>
    scheduleEmail(db, { eventId, type: 'summary', recipient: 'ana@example.com', at });

  describe('sending', () => {
    it('sends a due email to its recipient, as its template wrote it, and records it sent', async () => {
      const eventId = await storeEvent('Cena de verano');
      await summaryOf(eventId);

      await outbox().sendDue();

      expect(delivered).toEqual([
        {
          to: 'ana@example.com',
          subject: 'summary: Cena de verano',
          text: 'Texto',
          html: '<p>Texto</p>',
          id: expect.any(String) as string,
        },
      ]);
      expect(await storedEmail(eventId)).toMatchObject({
        status: 'sent',
        attempts: 1,
        lastError: null,
        sentAt: clock.now(),
      });
    });

    it('once told to stop, ends after the email in progress and leaves the rest due', async () => {
      const dinner = await storeEvent('Cena de verano');
      const trip = await storeEvent('Excursión');
      await summaryOf(dinner, new Date(clock.now().getTime() - minute));
      await summaryOf(trip);
      const stopping = new AbortController();
      server = (email) => {
        delivered.push(email);
        stopping.abort();
        return Promise.resolve();
      };

      await outbox().sendDue(stopping.signal);

      expect(delivered.map(({ subject }) => subject)).toEqual(['summary: Cena de verano']);
      expect(await storedEmail(dinner)).toMatchObject({ status: 'sent' });
      expect(await storedEmail(trip)).toMatchObject({ status: 'pending', attempts: 0 });
    });

    it('keeps an email until it is due', async () => {
      const eventId = await storeEvent();
      await summaryOf(eventId, new Date(clock.now().getTime() + 60 * minute));

      await outbox().sendDue();
      expect(delivered).toEqual([]);
      expect(await storedEmail(eventId)).toMatchObject({ status: 'pending', attempts: 0 });

      clock.advance(60 * minute);
      await outbox().sendDue();
      expect(delivered).toHaveLength(1);
    });

    it('sends only the emails to the recipients given, leaving the others due', async () => {
      const dinner = await storeEvent('Cena de verano');
      const trip = await storeEvent('Excursión');
      await scheduleEmail(db, {
        eventId: dinner,
        type: 'summary',
        recipient: 'ana@example.com',
        at: clock.now(),
      });
      await scheduleEmail(db, {
        eventId: trip,
        type: 'summary',
        recipient: 'bea@example.com',
        at: clock.now(),
      });

      await outbox().sendDue(undefined, ['bea@example.com']);

      expect(delivered.map(({ to }) => to)).toEqual(['bea@example.com']);
      expect(await storedEmail(dinner)).toMatchObject({ status: 'pending', attempts: 0 });
      await outbox().sendDue();
      expect(delivered.map(({ to }) => to)).toEqual(['bea@example.com', 'ana@example.com']);
    });

    it('sends every due email in one go, the one due longest first', async () => {
      const dinner = await storeEvent('Cena de verano');
      const trip = await storeEvent('Excursión');
      await summaryOf(dinner, new Date(clock.now().getTime() - 1 * minute));
      await summaryOf(trip, new Date(clock.now().getTime() - 2 * minute));

      await outbox().sendDue();

      expect(delivered.map(({ subject }) => subject)).toEqual([
        'summary: Excursión',
        'summary: Cena de verano',
      ]);
    });

    it('never sends a sent email again', async () => {
      const eventId = await storeEvent();
      await summaryOf(eventId);

      await outbox().sendDue();
      clock.advance(24 * 60 * minute);
      await outbox().sendDue();

      expect(delivered).toHaveLength(1);
    });

    it('sends the emails that were pending when the API stopped once it starts again', async () => {
      const dinner = await storeEvent('Cena de verano');
      await summaryOf(dinner);
      await outbox().sendDue();
      const trip = await storeEvent('Excursión');
      await summaryOf(trip);

      const restarted = outbox();
      await restarted.sendDue();

      expect(delivered.map(({ subject }) => subject)).toEqual([
        'summary: Cena de verano',
        'summary: Excursión',
      ]);
    });

    it('sends an email again, once and as the same message, when the API stopped after the server took it and before recording it', async () => {
      const eventId = await storeEvent();
      await summaryOf(eventId);
      const working = server;

      await stoppableDatabase(async (stoppable) => {
        server = async (email) => {
          await working(email);
          await stoppable.stop();
        };
        await expect(outbox({ db: stoppable.db }).sendDue()).rejects.toThrow();
      });
      expect(await storedEmail(eventId)).toMatchObject({ status: 'pending', attempts: 0 });

      server = working;
      const restarted = outbox();
      const sentAt = clock.now();
      await restarted.sendDue();
      clock.advance(24 * 60 * minute);
      await restarted.sendDue();

      expect(delivered).toHaveLength(2);
      expect(delivered[0]!.id).toEqual(expect.any(String));
      expect(delivered[1]).toEqual(delivered[0]);
      expect(await storedEmail(eventId)).toMatchObject({
        status: 'sent',
        attempts: 1,
        sentAt,
      });
    });

    it('two outboxes at work at once never send the same email twice', async () => {
      const titles = ['Cena de verano', 'Excursión', 'Café', 'Teatro'];
      for (const title of titles) await summaryOf(await storeEvent(title));
      // Slow enough for the second outbox to meet the email the first one is sending.
      server = async (email) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        delivered.push(email);
      };

      await Promise.all([outbox().sendDue(), outbox().sendDue()]);

      expect(delivered.map(({ subject }) => subject).sort()).toEqual(
        titles.map((title) => `summary: ${title}`).sort(),
      );
    });
  });

  describe('failures', () => {
    it('tries a refused email again after growing waits, and gives up after the fifth attempt', async () => {
      const eventId = await storeEvent();
      await summaryOf(eventId);
      server = () => Promise.reject(new Error('Connection refused'));
      const start = clock.now().getTime();

      await outbox().sendDue();
      expect(await storedEmail(eventId)).toMatchObject({
        status: 'pending',
        attempts: 1,
        scheduledAt: new Date(start + 1 * minute),
      });

      clock.advance(1 * minute - 1);
      await outbox().sendDue();
      expect(tried).toBe(1);

      // Each wait counts from the attempt that failed: 1, 5, 15 and 60 minutes.
      for (const [attempts, wait] of [
        [2, 5],
        [3, 15],
        [4, 60],
      ] as const) {
        clock.advance(1);
        await outbox().sendDue();
        expect(await storedEmail(eventId)).toMatchObject({
          status: 'pending',
          attempts,
          scheduledAt: new Date(clock.now().getTime() + wait * minute),
        });
        clock.advance(wait * minute - 1);
        await outbox().sendDue();
        expect(tried).toBe(attempts);
      }

      clock.advance(1);
      await outbox().sendDue();
      expect(await storedEmail(eventId)).toMatchObject({
        status: 'failed',
        attempts: 5,
        sentAt: null,
      });

      clock.advance(7 * 24 * 60 * minute);
      await outbox().sendDue();
      expect(tried).toBe(5);
      expect(delivered).toEqual([]);
    });

    it('sends it at the next attempt once the server takes it again', async () => {
      const eventId = await storeEvent();
      await summaryOf(eventId);
      const working = server;
      server = () => Promise.reject(new Error('Connection refused'));
      await outbox().sendDue();

      server = working;
      clock.advance(1 * minute);
      await outbox().sendDue();

      expect(delivered).toHaveLength(1);
      expect(await storedEmail(eventId)).toMatchObject({
        status: 'sent',
        attempts: 2,
        lastError: null,
        sentAt: clock.now(),
      });
    });

    it('tries a failed email again as the same message, so a copy the server took before failing is not a second one', async () => {
      const eventId = await storeEvent();
      await summaryOf(eventId);
      const ids: (string | undefined)[] = [];
      const working = server;
      server = (email) => {
        ids.push(email.id);
        return ids.length === 1 ? Promise.reject(new Error('Socket timeout')) : working(email);
      };

      await outbox().sendDue();
      clock.advance(1 * minute);
      await outbox().sendDue();

      expect(ids).toEqual([expect.any(String), ids[0]]);
    });

    it('records and logs what failed, never the address the server quoted', async () => {
      const eventId = await storeEvent();
      await summaryOf(eventId);
      server = ({ to }) => Promise.reject(refusal(to));

      await outbox().sendDue();

      expect((await storedEmail(eventId)).lastError).toBe('send: EENVELOPE 550');
      expect(logged).toEqual([
        expect.objectContaining({
          level: 'warn',
          message: 'Email not sent, to be tried again',
          type: 'summary',
          eventId,
          attempts: 1,
          error: 'Error',
          code: 'EENVELOPE 550',
        }),
      ]);
      expect(JSON.stringify(logged)).not.toContain('ana@example.com');
    });

    it('names an error without a code by its kind', async () => {
      const eventId = await storeEvent();
      await summaryOf(eventId);
      server = ({ to }) => Promise.reject(new TypeError(`Bad address ${to}`));

      await outbox().sendDue();

      expect((await storedEmail(eventId)).lastError).toBe('send: TypeError');
    });

    it('logs the last attempt as an error: the email is not tried again', async () => {
      const eventId = await storeEvent();
      await summaryOf(eventId);
      server = () => Promise.reject(new Error('Connection refused'));

      for (const wait of [0, 1, 5, 15, 60]) {
        clock.advance(wait * minute);
        await outbox().sendDue();
      }

      expect(logged.map(({ level, message, attempts }) => [level, message, attempts])).toEqual([
        ['warn', 'Email not sent, to be tried again', 1],
        ['warn', 'Email not sent, to be tried again', 2],
        ['warn', 'Email not sent, to be tried again', 3],
        ['warn', 'Email not sent, to be tried again', 4],
        ['error', 'Email not sent, given up', 5],
      ]);
    });

    it('names a failure by its kind when its code could quote something', async () => {
      const eventId = await storeEvent();
      await summaryOf(eventId);
      server = ({ to }) =>
        Promise.reject(Object.assign(new Error('Refused'), { code: `refused ${to}` }));

      await outbox().sendDue();

      expect((await storedEmail(eventId)).lastError).toBe('send: Error');
      expect(JSON.stringify(logged)).not.toContain('ana@example.com');
    });

    it('counts a template that fails as a failed attempt, and sends nothing', async () => {
      const eventId = await storeEvent();
      await summaryOf(eventId);

      await outbox({ compose: () => Promise.reject(new RangeError('No such option')) }).sendDue();

      expect(tried).toBe(0);
      expect(await storedEmail(eventId)).toMatchObject({
        status: 'pending',
        attempts: 1,
        lastError: 'compose: RangeError',
      });
    });

    it('records the attempt of a template whose query failed', async () => {
      const eventId = await storeEvent();
      await summaryOf(eventId);

      await outbox({
        compose: async (_, tx) => {
          await tx.execute(sql`SELECT 1 / 0`);
          return { subject: 'Nunca', text: '', html: '' };
        },
      }).sendDue();

      expect(await storedEmail(eventId)).toMatchObject({
        status: 'pending',
        attempts: 1,
        lastError: 'compose: 22012',
      });
    });

    it('goes on with the next email after one that failed', async () => {
      const dinner = await storeEvent('Cena de verano');
      const trip = await storeEvent('Excursión');
      await summaryOf(dinner, new Date(clock.now().getTime() - 1 * minute));
      await summaryOf(trip);
      const working = server;
      server = (email) =>
        email.subject.includes('Cena')
          ? Promise.reject(new Error('Connection refused'))
          : working(email);

      await outbox().sendDue();

      expect(delivered.map(({ subject }) => subject)).toEqual(['summary: Excursión']);
    });
  });

  describe('scheduling', () => {
    it('makes an email due again when it is scheduled again, also once sent', async () => {
      const eventId = await storeEvent();
      const closing = (at: Date, recipient = 'ana@example.com') =>
        scheduleEmail(db, { eventId, type: 'voting_closed', recipient, at });
      await closing(clock.now());
      await outbox().sendDue();

      const later = new Date(clock.now().getTime() + 24 * 60 * minute);
      await closing(later, 'ana.garcia@example.com');

      expect(await storedEmail(eventId, 'voting_closed')).toMatchObject({
        status: 'pending',
        recipient: 'ana.garcia@example.com',
        scheduledAt: later,
        attempts: 0,
        sentAt: null,
      });
      clock.advance(24 * 60 * minute);
      await outbox().sendDue();
      expect(delivered.map(({ to }) => to)).toEqual(['ana@example.com', 'ana.garcia@example.com']);
    });

    it('never makes a sent summary due again: it is sent once per event', async () => {
      const eventId = await storeEvent();
      await summaryOf(eventId);
      await outbox().sendDue();
      const sentAt = clock.now();

      clock.advance(60 * minute);
      await summaryOf(eventId);
      await outbox().sendDue();

      expect(delivered).toHaveLength(1);
      expect(await storedEmail(eventId)).toMatchObject({ status: 'sent', attempts: 1, sentAt });
    });

    it('scheduling again clears the failure of the last closing', async () => {
      const eventId = await storeEvent();
      server = () => Promise.reject(new Error('Connection refused'));
      await scheduleEmail(db, {
        eventId,
        type: 'voting_closed',
        recipient: 'ana@example.com',
        at: clock.now(),
      });
      await outbox().sendDue();

      await scheduleEmail(db, {
        eventId,
        type: 'voting_closed',
        recipient: 'ana@example.com',
        at: clock.now(),
      });

      expect(await storedEmail(eventId, 'voting_closed')).toMatchObject({
        status: 'pending',
        attempts: 0,
        lastError: null,
      });
    });

    it('keeps one email per type: the summary and the closing of an event are two', async () => {
      const eventId = await storeEvent('Cena de verano');
      await summaryOf(eventId);
      await scheduleEmail(db, {
        eventId,
        type: 'voting_closed',
        recipient: 'ana@example.com',
        at: clock.now(),
      });
      await summaryOf(eventId);

      await outbox().sendDue();

      expect(delivered.map(({ subject }) => subject).sort()).toEqual([
        'summary: Cena de verano',
        'voting_closed: Cena de verano',
      ]);
    });

    it('queues nothing when the transaction that scheduled it is undone', async () => {
      const eventId = await storeEvent();

      await expect(
        db.transaction(async (tx) => {
          await scheduleEmail(tx, {
            eventId,
            type: 'summary',
            recipient: 'ana@example.com',
            at: clock.now(),
          });
          throw new Error('The change failed');
        }),
      ).rejects.toThrow('The change failed');
      await outbox().sendDue();

      expect(delivered).toEqual([]);
      expect(await db.select().from(notifications)).toEqual([]);
    });
  });

  describe('"voting closed"', () => {
    it('is due a minute after voting closes, so the votes accepted before are stored first', async () => {
      const eventId = await storeEvent();
      const closesAt = new Date(clock.now().getTime() + 60 * minute);
      await scheduleVotingClosed(db, { eventId, recipient: 'ana@example.com', closesAt });

      expect(await storedEmail(eventId, 'voting_closed')).toMatchObject({
        status: 'pending',
        recipient: 'ana@example.com',
        scheduledAt: new Date(closesAt.getTime() + minute),
        attempts: 0,
      });
      clock.advance(60 * minute + minute - 1);
      await outbox().sendDue();
      expect(delivered).toEqual([]);
      clock.advance(1);
      await outbox().sendDue();
      expect(delivered.map(({ subject }) => subject)).toEqual(['voting_closed: Cena de verano']);
    });

    it('is due again at a new closing, also once sent: it is sent once per closing', async () => {
      const eventId = await storeEvent();
      await scheduleVotingClosed(db, {
        eventId,
        recipient: 'ana@example.com',
        closesAt: clock.now(),
      });
      clock.advance(minute);
      await outbox().sendDue();

      const reopened = new Date(clock.now().getTime() + 24 * 60 * minute);
      await scheduleVotingClosed(db, { eventId, recipient: 'ana@example.com', closesAt: reopened });

      expect(await storedEmail(eventId, 'voting_closed')).toMatchObject({
        status: 'pending',
        scheduledAt: new Date(reopened.getTime() + minute),
        sentAt: null,
      });
    });

    it('is a new message at each closing, so no mail client takes it for the last one', async () => {
      const eventId = await storeEvent();
      for (let closing = 1; closing <= 2; closing += 1) {
        await scheduleVotingClosed(db, {
          eventId,
          recipient: 'ana@example.com',
          closesAt: new Date(clock.now().getTime() + 60 * minute),
        });
        clock.advance(2 * 60 * minute);
        await outbox().sendDue();
      }

      expect(delivered.map(({ id }) => id)).toEqual([expect.any(String), expect.any(String)]);
      expect(delivered[1]!.id).not.toBe(delivered[0]!.id);
    });

    it('is dropped unless it was sent: neither the pending nor the failed one goes out', async () => {
      const [pending, failed, sent] = await Promise.all(
        ['Cena de verano', 'Excursión', 'Café'].map((title) => storeEvent(title)),
      );
      for (const eventId of [pending!, failed!, sent!]) {
        await summaryOf(eventId);
        await scheduleVotingClosed(db, {
          eventId,
          recipient: 'ana@example.com',
          closesAt: clock.now(),
        });
      }
      await db
        .update(notifications)
        .set({ status: 'failed', attempts: 5 })
        .where(eq(notifications.eventId, failed!));
      await db
        .update(notifications)
        .set({ status: 'sent', attempts: 1, sentAt: clock.now() })
        .where(eq(notifications.eventId, sent!));

      for (const eventId of [pending!, failed!, sent!]) await dropUnsentVotingClosed(db, eventId);

      const left = await db
        .select({ eventId: notifications.eventId, type: notifications.type })
        .from(notifications);
      expect(left).toEqual(
        expect.arrayContaining([
          { eventId: pending, type: 'summary' },
          { eventId: failed, type: 'summary' },
          { eventId: sent, type: 'summary' },
          { eventId: sent, type: 'voting_closed' },
        ]),
      );
      expect(left).toHaveLength(4);
    });
  });

  describe('retrying', () => {
    /** Leaves the email as the outbox does after its fifth failed attempt. */
    const fail = (eventId: string, type: 'summary' | 'voting_closed' = 'summary') =>
      db
        .update(notifications)
        .set({ status: 'failed', attempts: 5, lastError: 'send: ECONNREFUSED' })
        .where(eq(notifications.eventId, eventId))
        .then(async () => storedEmail(eventId, type));

    it('makes a failed email due at the time given: the next run sends it, once', async () => {
      const eventId = await storeEvent();
      await summaryOf(eventId);
      await fail(eventId);
      clock.advance(2 * 60 * minute);

      expect(await retryFailedEmail(db, { eventId, type: 'summary', at: clock.now() })).toBe(true);
      expect(await storedEmail(eventId)).toMatchObject({
        status: 'pending',
        scheduledAt: clock.now(),
      });
      await outbox().sendDue();
      await outbox().sendDue();

      expect(delivered).toHaveLength(1);
      expect(await storedEmail(eventId)).toMatchObject({ status: 'sent', attempts: 6 });
    });

    it('gives up at once when the attempt it makes fails too: one attempt, no more waits', async () => {
      const eventId = await storeEvent();
      await summaryOf(eventId);
      await fail(eventId);
      server = () => Promise.reject(new Error('Connection refused'));

      await retryFailedEmail(db, { eventId, type: 'summary', at: clock.now() });
      await outbox().sendDue();

      expect(tried).toBe(1);
      expect(await storedEmail(eventId)).toMatchObject({ status: 'failed', attempts: 6 });
    });

    it.each([
      ['sent', () => outbox().sendDue()],
      ['still being tried', () => Promise.resolve()],
    ])('leaves an email %s as it is, answering that it had not failed', async (_name, before) => {
      const eventId = await storeEvent();
      await summaryOf(eventId);
      await before();
      const stored = await storedEmail(eventId);
      clock.advance(minute);

      expect(await retryFailedEmail(db, { eventId, type: 'summary', at: clock.now() })).toBe(false);
      expect(await storedEmail(eventId)).toEqual(stored);
    });

    it('answers that an email never queued had not failed, queuing nothing', async () => {
      const eventId = await storeEvent();

      expect(await retryFailedEmail(db, { eventId, type: 'summary', at: clock.now() })).toBe(false);
      expect(await db.select().from(notifications)).toEqual([]);
    });

    it('retries only the email of its type', async () => {
      const eventId = await storeEvent();
      await summaryOf(eventId);
      await scheduleEmail(db, {
        eventId,
        type: 'voting_closed',
        recipient: 'ana@example.com',
        at: clock.now(),
      });
      await fail(eventId);

      await retryFailedEmail(db, { eventId, type: 'voting_closed', at: clock.now() });

      expect(await storedEmail(eventId, 'voting_closed')).toMatchObject({ status: 'pending' });
      expect(await storedEmail(eventId)).toMatchObject({ status: 'failed' });
    });

    it('retries only the email of its event', async () => {
      const [cena, excursion] = [await storeEvent(), await storeEvent('Excursión')];
      await summaryOf(cena);
      await summaryOf(excursion);
      await fail(cena);
      await fail(excursion);

      await retryFailedEmail(db, { eventId: cena, type: 'summary', at: clock.now() });

      expect(await storedEmail(cena)).toMatchObject({ status: 'pending' });
      expect(await storedEmail(excursion)).toMatchObject({ status: 'failed' });
    });
  });
});
