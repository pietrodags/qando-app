import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../db/database.js';
import { runMigrations } from '../db/migrate.js';
import {
  cancelledEvents,
  events,
  oauthAccessTokens,
  oauthClientAssertions,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
  sessions,
  users,
  verifications,
} from '../db/schema.js';
import { actingOrganizer } from '../modules/management/managed-events.js';
import { createManagedEvents } from '../modules/management/managed-events-repository.js';
import { seedEvent, type EventSeed } from '../seed/seed-event.js';
import { storedRows } from '../seed/stored-rows.js';
import {
  connectedApplicationRows,
  storeConnectedApplication,
} from '../test/connected-application.js';
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
    await db.delete(oauthClients);
    await db.delete(oauthClientAssertions);
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

    it('leaves an event being confirmed meanwhile for a later run, which keeps it by its new date', async () => {
      const managedEvents = createManagedEvents(db);
      const seeded = await seedEvent(db, {
        ...unconfirmedCena,
        options: ['2026-07-11', '2026-12-19'],
      });
      const access = await actingOrganizer(managedEvents, seeded.publicId, {
        managementToken: seeded.managementToken,
      });
      if (access.status !== 'granted') throw new Error('The management link should manage it');
      // 31 December 2026, 00:00 in Madrid: 6 months after the deadline, not after 19 December.
      const now = at('2026-12-30T23:00:00Z');

      const keptWhileConfirming = await managedEvents.change(async (change) => {
        await change.lock(access.organizer);
        await change.confirm(access.organizer, seeded.optionIds[1]!);
        await deleteExpired(db, now);
        return eventExists(seeded.eventId);
      });
      await deleteExpired(db, now);

      expect(keptWhileConfirming).toBe(true);
      expect(await eventExists(seeded.eventId)).toBe(true);
    });

    it('keeps an event whose date is less than 6 months away', async () => {
      const { eventId } = await seedEvent(db, unconfirmedCena);

      await deleteExpired(db, at('2026-11-23T12:00:00Z'));

      expect(await eventExists(eventId)).toBe(true);
    });
  });

  describe('what is left of a cancelled event', () => {
    async function cancelled(cancelledAt: string, ownerId?: string) {
      const publicId = randomUUID();
      await db.insert(cancelledEvents).values({
        publicId,
        resultsId: randomUUID(),
        title: 'Cena',
        cancelledAt: at(cancelledAt),
        ...(ownerId !== undefined && { ownerId }),
      });
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

    it('goes with the account that cancelled it, deleted for being unused', async () => {
      const ownerId = await storeUser(db);
      await lastSeen(ownerId, '2026-07-01T10:00:00Z');
      const left = await cancelled('2026-12-01T10:00:00Z', ownerId);

      await deleteExpired(db, at('2027-01-18T10:00:00Z'));

      expect(await accountExists(ownerId)).toBe(false);
      expect(await left()).toBe(false);
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

    it('deletes with an unused account what it allowed applications to do, leaving another account’s', async () => {
      const unused = await storeUser(db);
      const used = await storeUser(db);
      await lastSeen(unused, '2026-07-18T10:00:00Z');
      await lastSeen(used, '2026-07-18T10:02:00Z');
      await storeConnectedApplication(db, unused);
      await storeConnectedApplication(db, used);

      await deleteExpired(db, at('2027-01-18T10:01:00Z'));

      expect(await connectedApplicationRows(db, unused)).toEqual({ consents: 0, refreshTokens: 0 });
      expect(await connectedApplicationRows(db, used)).toEqual({ consents: 1, refreshTokens: 1 });
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

  describe('what applications were given', () => {
    const now = at('2026-11-23T12:00:00Z');
    /** The application's ID and whether it is still stored. */
    async function application({
      readFromItsDocument = true,
      lastReadAt = '2026-11-01T12:00:00Z',
    }: { readFromItsDocument?: boolean; lastReadAt?: string } = {}) {
      const clientId = `https://${randomUUID()}.example/client.json`;
      await db.insert(oauthClients).values({
        id: randomUUID(),
        clientId,
        redirectUris: ['https://assistant.example/callback'],
        // Stored long ago; reading its document again keeps that and dates the read.
        createdAt: at('2026-01-01T12:00:00Z'),
        updatedAt: at(lastReadAt),
        ...(readFromItsDocument && { clientDiscoveryId: 'cimd' }),
      });
      return {
        clientId,
        stored: async () =>
          (await db.$count(oauthClients, eq(oauthClients.clientId, clientId))) === 1,
      };
    }
    const scopes = ['events:read', 'events:manage', 'offline_access'];
    const refreshToken = (
      clientId: string,
      userId: string,
      expiresAt: string,
      revoked?: string,
    ) => ({
      id: randomUUID(),
      token: randomUUID(),
      clientId,
      userId,
      scopes,
      expiresAt: at(expiresAt),
      ...(revoked !== undefined && { revoked: at(revoked), rotatedAt: at(revoked) }),
    });
    const storedIds = async (table: typeof oauthRefreshTokens | typeof oauthAccessTokens) =>
      (await db.select({ id: table.id }).from(table)).map(({ id }) => id).sort();

    it('deletes the refresh tokens past their expiry, replaced or not, and keeps the others', async () => {
      const userId = await storeUser(db);
      const { clientId } = await application();
      const expired = refreshToken(clientId, userId, '2026-11-23T11:59:00Z');
      const replacedAndExpired = refreshToken(
        clientId,
        userId,
        '2026-11-23T11:59:00Z',
        '2026-10-24T11:59:00Z',
      );
      const expiringNow = refreshToken(clientId, userId, '2026-11-23T12:00:00Z');
      // Presented again, it is refused and takes every token of the application with it, so it
      // stays as long as it could be presented.
      const replaced = refreshToken(
        clientId,
        userId,
        '2026-12-20T10:00:00Z',
        '2026-11-20T10:00:00Z',
      );
      await db
        .insert(oauthRefreshTokens)
        .values([expired, replacedAndExpired, expiringNow, replaced]);

      await deleteExpired(db, now);

      expect(await storedIds(oauthRefreshTokens)).toEqual([expiringNow.id, replaced.id].sort());
    });

    it('deletes the access tokens stored past their expiry', async () => {
      const userId = await storeUser(db);
      const { clientId } = await application();
      const accessToken = (expiresAt: string) => ({
        id: randomUUID(),
        token: randomUUID(),
        clientId,
        userId,
        scopes,
        expiresAt: at(expiresAt),
      });
      const expired = accessToken('2026-11-23T11:59:00Z');
      const expiringNow = accessToken('2026-11-23T12:00:00Z');
      await db.insert(oauthAccessTokens).values([expired, expiringNow]);

      await deleteExpired(db, now);

      expect(await storedIds(oauthAccessTokens)).toEqual([expiringNow.id]);
    });

    it('deletes an application nobody is connected to whose document was last read over a day ago', async () => {
      const older = await application({ lastReadAt: '2026-11-22T11:59:00Z' });
      const aDayAgo = await application({ lastReadAt: '2026-11-22T12:00:00Z' });

      await deleteExpired(db, now);

      expect(await older.stored()).toBe(false);
      expect(await aDayAgo.stored()).toBe(true);
    });

    it('keeps an application an account allowed, or holding a token that is still answered', async () => {
      const userId = await storeUser(db);
      const allowed = await application();
      await db
        .insert(oauthConsents)
        .values({ id: randomUUID(), clientId: allowed.clientId, userId, scopes });
      const renewing = await application();
      await db
        .insert(oauthRefreshTokens)
        .values(
          refreshToken(renewing.clientId, userId, '2026-12-20T10:00:00Z', '2026-11-20T10:00:00Z'),
        );
      const holdingAnAccessToken = await application();
      await db.insert(oauthAccessTokens).values({
        id: randomUUID(),
        token: randomUUID(),
        clientId: holdingAnAccessToken.clientId,
        userId,
        scopes,
        expiresAt: at('2026-11-23T12:30:00Z'),
      });

      await deleteExpired(db, now);

      expect(await allowed.stored()).toBe(true);
      expect(await renewing.stored()).toBe(true);
      expect(await holdingAnAccessToken.stored()).toBe(true);
    });

    it('deletes an application in the same run as its last token or its last account', async () => {
      const userId = await storeUser(db);
      await lastSeen(userId, '2026-05-01T10:00:00Z');
      const renewedNoMore = await application();
      await db
        .insert(oauthRefreshTokens)
        .values(refreshToken(renewedNoMore.clientId, await storeUser(db), '2026-11-23T11:00:00Z'));
      const accessedNoMore = await application();
      await db.insert(oauthAccessTokens).values({
        id: randomUUID(),
        token: randomUUID(),
        clientId: accessedNoMore.clientId,
        userId: await storeUser(db),
        scopes,
        expiresAt: at('2026-11-23T11:00:00Z'),
      });
      const ofAnUnusedAccount = await application();
      await db
        .insert(oauthConsents)
        .values({ id: randomUUID(), clientId: ofAnUnusedAccount.clientId, userId, scopes });

      await deleteExpired(db, now);

      expect(await renewedNoMore.stored()).toBe(false);
      expect(await accessedNoMore.stored()).toBe(false);
      expect(await ofAnUnusedAccount.stored()).toBe(false);
    });

    it('keeps an application that was not read from a document, which could not be read again', async () => {
      const registered = await application({ readFromItsDocument: false });

      await deleteExpired(db, now);

      expect(await registered.stored()).toBe(true);
    });

    it('deletes the proofs of signed requests past their expiry, which are refused by then', async () => {
      const proof = (expiresAt: string) => ({ id: randomUUID(), expiresAt: at(expiresAt) });
      const expired = proof('2026-11-23T11:59:00Z');
      const expiringNow = proof('2026-11-23T12:00:00Z');
      await db.insert(oauthClientAssertions).values([expired, expiringNow]);

      await deleteExpired(db, now);

      expect(await db.select({ id: oauthClientAssertions.id }).from(oauthClientAssertions)).toEqual(
        [{ id: expiringNow.id }],
      );
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
