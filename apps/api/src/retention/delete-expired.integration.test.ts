import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/database.js';
import { runMigrations } from '../db/migrate.js';
import { cancelledEvents, events, sessions, users, verifications } from '../db/schema.js';
import { seedEvent, type EventSeed } from '../seed/seed-event.js';
import { storedRows } from '../seed/stored-rows.js';
import { createFreshDatabase, type FreshDatabase } from '../test/fresh-database.js';
import { storeUser } from '../test/stored-user.js';
import { deleteExpired } from './delete-expired.js';

const at = (instant: string) => new Date(instant);

/** Ana's "Cena de verano", voting until 30 June 2026, before a date is confirmed. */
const unconfirmedCena: EventSeed = {
  title: 'Cena de verano',
  options: ['2026-07-11', '2026-07-18'],
  deadline: '2026-06-30',
  votes: [
    { name: 'Luis', states: ['available', 'preferred'] },
    { name: 'Marta', states: ['unavailable', 'available'] },
  ],
  emails: { summary: 'sent' },
};

/** The same, confirmed for Saturday 18 July 2026. */
const cena: EventSeed = { ...unconfirmedCena, outcome: { confirmed: 1 } };

describe('deleting what qando no longer keeps, against PostgreSQL', () => {
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

  beforeEach(async () => {
    await db.delete(events);
    await db.delete(cancelledEvents);
    await db.delete(users);
    await db.delete(verifications);
  });

  const eventExists = async (eventId: string | null) =>
    (await db.select({ id: events.id }).from(events).where(eq(events.id, eventId!))).length === 1;

  const ownerOf = async (eventId: string | null) => {
    const [event] = await db
      .select({ ownerId: events.ownerId })
      .from(events)
      .where(eq(events.id, eventId!));
    return event!.ownerId;
  };

  const lastSeen = (userId: string, instant: string) =>
    db
      .update(users)
      .set({ lastSeenAt: at(instant) })
      .where(eq(users.id, userId));

  const accountExists = async (userId: string) =>
    (await db.select({ id: users.id }).from(users).where(eq(users.id, userId))).length === 1;

  describe('events', () => {
    it('keeps an event until 6 months after its confirmed date have passed in its time zone', async () => {
      const { eventId } = await seedEvent(db, cena);

      // 18 January 2027, 23:59 in Madrid.
      await deleteExpired(db, at('2027-01-18T22:59:00Z'));

      expect(await eventExists(eventId)).toBe(true);
    });

    it('deletes it on the next day, with its options, votes, confirmation and emails', async () => {
      const { eventId } = await seedEvent(db, cena);
      const stored = await storedRows(db, eventId!);

      // 19 January 2027, 00:00 in Madrid.
      await deleteExpired(db, at('2027-01-18T23:00:00Z'));

      expect(stored).toEqual({
        options: 2,
        participations: 2,
        votes: 4,
        confirmations: 1,
        emails: 1,
      });
      expect(await eventExists(eventId)).toBe(false);
      expect(await storedRows(db, eventId!)).toEqual({
        options: 0,
        participations: 0,
        votes: 0,
        confirmations: 0,
        emails: 0,
      });
    });

    it('counts from the last day of a confirmed range of days', async () => {
      const { eventId } = await seedEvent(db, {
        ...cena,
        options: [{ date: '2026-07-18', endDate: '2026-07-19' }],
        votes: [],
        outcome: { confirmed: 0 },
      });

      // 19 January 2027, 23:59 in Madrid.
      await deleteExpired(db, at('2027-01-19T22:59:00Z'));
      const keptOnTheLastDay = await eventExists(eventId);
      // 20 January 2027, 00:00 in Madrid.
      await deleteExpired(db, at('2027-01-19T23:00:00Z'));

      expect(keptOnTheLastDay).toBe(true);
      expect(await eventExists(eventId)).toBe(false);
    });

    it('counts from the deadline when no date was confirmed', async () => {
      const { eventId } = await seedEvent(db, unconfirmedCena);

      // 30 December 2026, 23:59 in Madrid.
      await deleteExpired(db, at('2026-12-30T22:59:00Z'));
      const keptOnTheLastDay = await eventExists(eventId);
      // 31 December 2026, 00:00 in Madrid.
      await deleteExpired(db, at('2026-12-30T23:00:00Z'));

      expect(keptOnTheLastDay).toBe(true);
      expect(await eventExists(eventId)).toBe(false);
    });

    it('counts the days in each event’s own time zone', async () => {
      const madrid = await seedEvent(db, cena);
      const newYork = await seedEvent(db, { ...cena, timeZone: 'America/New_York' });

      // 19 January 2027: 05:59 in Madrid, 23:59 of the 18th in New York.
      await deleteExpired(db, at('2027-01-19T04:59:00Z'));

      expect(await eventExists(madrid.eventId)).toBe(false);
      expect(await eventExists(newYork.eventId)).toBe(true);
    });

    it('keeps an event whose date is less than 6 months away', async () => {
      const { eventId } = await seedEvent(db, unconfirmedCena);

      await deleteExpired(db, at('2026-11-23T12:00:00Z'));

      expect(await eventExists(eventId)).toBe(true);
    });
  });

  describe('what is left of a cancelled event', () => {
    async function cancelled(cancelledAt: string) {
      const publicId = randomUUID();
      await db
        .insert(cancelledEvents)
        .values({ publicId, resultsId: randomUUID(), title: 'Cena', cancelledAt: at(cancelledAt) });
      return async () =>
        (await db.select().from(cancelledEvents).where(eq(cancelledEvents.publicId, publicId)))
          .length === 1;
    }

    it('is kept until 6 months after the cancellation and deleted afterwards', async () => {
      const older = await cancelled('2026-07-18T10:00:00Z');
      const newer = await cancelled('2026-07-18T10:02:00Z');

      await deleteExpired(db, at('2027-01-18T10:01:00Z'));

      expect(await older()).toBe(false);
      expect(await newer()).toBe(true);
    });
  });

  describe('accounts', () => {
    it('deletes an account that owns no event and nobody used for 6 months', async () => {
      const unused = await storeUser(db);
      const used = await storeUser(db);
      await lastSeen(unused, '2026-07-18T10:00:00Z');
      await lastSeen(used, '2026-07-18T10:02:00Z');

      await deleteExpired(db, at('2027-01-18T10:01:00Z'));

      expect(await accountExists(unused)).toBe(false);
      expect(await accountExists(used)).toBe(true);
    });

    it('keeps an account that still owns an event, however long unused', async () => {
      const { eventId } = await seedEvent(db, { ...unconfirmedCena, deadline: '2026-12-31' });
      const ownerId = await ownerOf(eventId);
      await lastSeen(ownerId, '2026-01-01T10:00:00Z');

      await deleteExpired(db, at('2027-01-19T10:00:00Z'));

      expect(await accountExists(ownerId)).toBe(true);
    });

    it('deletes an account in the same run as its last event', async () => {
      const { eventId } = await seedEvent(db, cena);
      const ownerId = await ownerOf(eventId);
      await lastSeen(ownerId, '2026-07-01T10:00:00Z');

      await deleteExpired(db, at('2027-01-18T23:00:00Z'));

      expect(await accountExists(ownerId)).toBe(false);
    });
  });

  describe('sign-in codes and sessions', () => {
    it('deletes the sign-in codes that have expired, with the email they were asked for', async () => {
      const code = (expiresAt: string) => ({
        id: randomUUID(),
        identifier: `sign-in-otp-${randomUUID()}@example.com`,
        value: 'hash:0',
        expiresAt: at(expiresAt),
      });
      const expired = code('2026-11-23T11:59:00Z');
      const pending = code('2026-11-23T12:01:00Z');
      await db.insert(verifications).values([expired, pending]);

      await deleteExpired(db, at('2026-11-23T12:00:00Z'));

      expect(await db.select({ id: verifications.id }).from(verifications)).toEqual([
        { id: pending.id },
      ]);
    });

    it('deletes the sessions that have expired, keeping the account', async () => {
      const userId = await storeUser(db);
      const session = (expiresAt: string) => ({
        id: randomUUID(),
        token: randomUUID(),
        userId,
        expiresAt: at(expiresAt),
      });
      const expired = session('2026-11-23T11:59:00Z');
      const alive = session('2026-11-23T12:01:00Z');
      await db.insert(sessions).values([expired, alive]);

      await deleteExpired(db, at('2026-11-23T12:00:00Z'));

      expect(await db.select({ id: sessions.id }).from(sessions)).toEqual([{ id: alive.id }]);
      expect(await accountExists(userId)).toBe(true);
    });
  });

  it('answers how many events, cancelled events and accounts it deleted', async () => {
    const { eventId } = await seedEvent(db, cena);
    await seedEvent(db, cena);
    await seedEvent(db, { ...unconfirmedCena, deadline: '2026-12-31' });
    await db.insert(cancelledEvents).values({
      publicId: 'p',
      resultsId: 'r',
      title: 'Café',
      cancelledAt: at('2026-06-01T10:00:00Z'),
    });
    const ownerId = await ownerOf(eventId);
    await lastSeen(ownerId, '2026-06-01T10:00:00Z');
    const unused = await storeUser(db);
    await lastSeen(unused, '2026-06-01T10:00:00Z');

    const deleted = await deleteExpired(db, at('2027-01-18T23:00:00Z'));

    expect(deleted).toEqual({ events: 2, cancelledEvents: 1, accounts: 1 });
    // The three events share their organizer, who still owns the third.
    expect(await accountExists(ownerId)).toBe(true);
  });
});
