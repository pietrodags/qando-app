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
  emailOutbox,
  scheduleEmail,
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

  function outbox(settings: { compose?: ComposeEmail } = {}): EmailOutbox {
    return emailOutbox({
      db,
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
        },
      ]);
      expect(await storedEmail(eventId)).toMatchObject({
        status: 'sent',
        attempts: 1,
        lastError: null,
        sentAt: clock.now(),
      });
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
});
