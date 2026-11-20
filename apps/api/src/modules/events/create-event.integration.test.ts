import { randomUUID } from 'node:crypto';
import type { EventCreated } from '@qando/contracts';
import { closingInstant, type NewEvent } from '@qando/domain';
import { asc, eq } from 'drizzle-orm';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { hashCapabilityToken } from '../../capability-token.js';
import { createDatabase, type Database } from '../../db/database.js';
import { runMigrations } from '../../db/migrate.js';
import { events, options, users } from '../../db/schema.js';
import { createFreshDatabase, type FreshDatabase } from '../../test/fresh-database.js';
import {
  testDependencies,
  testSessionCookie,
  testTrustedOrigin,
} from '../../test/test-dependencies.js';
import { createManagedEvents } from '../management/managed-events-repository.js';
import { createPublicEvents } from '../public-events/public-events-repository.js';
import { createNewEvents } from './new-events-repository.js';

// 10:00 in Madrid on 15 June 2026.
const morning = new Date('2026-06-15T08:00:00Z');

interface SentOption {
  dates: { kind: 'single'; date: string } | { kind: 'range'; start: string; end: string };
  time: null | { kind: 'single'; at: string } | { kind: 'range'; start: string; end: string };
};

const wholeDay = (date: string): SentOption => ({ dates: { kind: 'single', date }, time: null });
/** Each day from 1 July on, as many as asked. */
const daysFromJuly = (count: number): SentOption[] =>
  Array.from({ length: count }, (_, index) =>
    wholeDay(new Date(Date.UTC(2026, 6, 1 + index)).toISOString().slice(0, 10)),
  );

const onTheSixth = (time: SentOption['time']): SentOption => ({
  dates: { kind: 'single', date: '2026-07-06' },
  time,
});

const cena = {
  title: 'Cena de verano',
  organizerName: 'Ana',
  timeZone: 'Europe/Madrid',
  deadline: '2026-07-01',
  note: 'Trae postre.',
  anonymous: false,
  // Sent out of order: stored by day, then by time.
  options: [
    onTheSixth({ kind: 'range', start: '20:00', end: '22:00' }),
    { dates: { kind: 'range', start: '2026-07-10', end: '2026-07-12' }, time: null },
    onTheSixth({ kind: 'single', at: '18:00' }),
  ] satisfies SentOption[],
};

describe('POST /api/events against PostgreSQL', () => {
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

  /** A verified account, named or not yet, as signing in with a code leaves it. */
  async function storeAccount(name = ''): Promise<string> {
    const id = randomUUID();
    await db.insert(users).values({ id, name, email: `${id}@example.com`, emailVerified: true });
    return id;
  }

  const app = () =>
    createApp({
      ...testDependencies({ now: morning }),
      newEvents: createNewEvents(db),
      publicEvents: createPublicEvents(db),
      managedEvents: createManagedEvents(db),
    });

  const createAs = (accountId: string, body: unknown) =>
    request(app())
      .post('/api/events')
      .set('Cookie', `${testSessionCookie}=${accountId}`)
      .set('Origin', testTrustedOrigin)
      .send(body as object);

  const eventsOf = (accountId: string) =>
    db.select().from(events).where(eq(events.ownerId, accountId));

  const nameOf = async (accountId: string) =>
    (await db.select({ name: users.name }).from(users).where(eq(users.id, accountId)))[0]?.name;

  it('stores the event and its options in order, owned by the account, behind its new links', async () => {
    const ana = await storeAccount();

    const response = await createAs(ana, cena);

    expect(response.status).toBe(201);
    const links = response.body as EventCreated;
    const [stored, ...others] = await eventsOf(ana);
    expect(others).toEqual([]);
    expect(stored).toMatchObject({
      publicId: links.participationId,
      resultsId: links.resultsId,
      managementTokenHash: hashCapabilityToken(links.managementToken),
      organizerName: 'Ana',
      organizerEmail: `${ana}@example.com`,
      title: 'Cena de verano',
      note: 'Trae postre.',
      timeZone: 'Europe/Madrid',
      deadline: '2026-07-01',
      closesAt: closingInstant('2026-07-01', 'Europe/Madrid'),
      anonymous: false,
      state: 'open',
    });
    const offered = await db
      .select({
        position: options.position,
        startDate: options.startDate,
        endDate: options.endDate,
        startTime: options.startTime,
        endTime: options.endTime,
      })
      .from(options)
      .where(eq(options.eventId, stored?.id ?? ''))
      .orderBy(asc(options.position));
    expect(offered).toEqual([
      { position: 0, startDate: '2026-07-06', endDate: null, startTime: '18:00:00', endTime: null },
      {
        position: 1,
        startDate: '2026-07-06',
        endDate: null,
        startTime: '20:00:00',
        endTime: '22:00:00',
      },
      {
        position: 2,
        startDate: '2026-07-10',
        endDate: '2026-07-12',
        startTime: null,
        endTime: null,
      },
    ]);
  });

  it('opens the voting page with the participation link and the management page with the token', async () => {
    const ana = await storeAccount();
    const links = (await createAs(ana, cena)).body as EventCreated;

    const voting = await request(app()).get(`/api/public/events/${links.participationId}`);
    const managed = await request(app())
      .get(`/api/events/${links.participationId}`)
      .set('X-Management-Token', links.managementToken);

    expect(voting.status).toBe(200);
    expect(voting.body).toMatchObject({ title: 'Cena de verano', organizerName: 'Ana' });
    expect(managed.status).toBe(200);
    expect(managed.body).toMatchObject({
      participationId: links.participationId,
      resultsId: links.resultsId,
      state: 'open',
    });
  });

  it('names an account without a name after the organizer, and keeps the name of one that has it', async () => {
    const unnamed = await storeAccount();
    const named = await storeAccount('Ana María');

    await createAs(unnamed, { ...cena, organizerName: '  Ana ' });
    await createAs(named, cena);

    expect(await nameOf(unnamed)).toBe('Ana');
    expect(await nameOf(named)).toBe('Ana María');
  });

  it('gives every event links of its own', async () => {
    const ana = await storeAccount();

    const first = (await createAs(ana, cena)).body as EventCreated;
    const second = (await createAs(ana, cena)).body as EventCreated;

    const all = [first, second].flatMap(Object.values);
    expect(new Set(all).size).toBe(6);
    expect(await eventsOf(ana)).toHaveLength(2);
  });

  it.each([
    ['61 options', { options: daysFromJuly(61) }],
    ['a date beyond twelve months', { options: [wholeDay('2027-07-01')] }],
    ['a date before today', { options: [wholeDay('2026-06-14')] }],
    ['minutes off the quarters', { options: [onTheSixth({ kind: 'single', at: '18:10' })] }],
    ['two equal options', { options: [wholeDay('2026-07-06'), wholeDay('2026-07-06')] }],
    [
      'a time range that ends first',
      { options: [onTheSixth({ kind: 'range', start: '20:00', end: '19:00' })] },
    ],
    ['a deadline before today', { deadline: '2026-06-14' }],
    ['no title', { title: ' ' }],
    ['a note too long', { note: 'a'.repeat(151) }],
    ['a body that breaks the contract', { timeZone: 'Europe/Atlantis' }],
  ])('stores nothing for an event with %s, and names no account', async (_name, change) => {
    const ana = await storeAccount();

    const response = await createAs(ana, { ...cena, ...change });

    expect(response.status).toBe(400);
    expect(await eventsOf(ana)).toEqual([]);
    expect(await nameOf(ana)).toBe('');
  });

  describe('when a step of the transaction fails', () => {
    const valid: NewEvent = {
      organizerName: 'Ana',
      title: 'Cena de verano',
      note: null,
      timeZone: 'Europe/Madrid',
      deadline: '2026-07-01',
      closesAt: closingInstant('2026-07-01', 'Europe/Madrid'),
      anonymous: false,
      options: [{ dates: { kind: 'single', date: '2026-07-06' }, time: null }],
    };

    it('stores no event and leaves the account unnamed when its options cannot be stored', async () => {
      const ana = await storeAccount();
      // Past the domain, an option the database refuses: a time range that ends first.
      const broken: NewEvent = {
        ...valid,
        options: [
          ...valid.options,
          {
            dates: { kind: 'single', date: '2026-07-10' },
            time: { kind: 'range', start: '22:00', end: '20:00' },
          },
        ],
      };

      await expect(createNewEvents(db).create(ana, broken)).rejects.toThrow();

      expect(await eventsOf(ana)).toEqual([]);
      expect(
        await db
          .select()
          .from(options)
          .innerJoin(events, eq(events.id, options.eventId))
          .where(eq(events.ownerId, ana)),
      ).toEqual([]);
      expect(await nameOf(ana)).toBe('');
    });

    it('stores nothing for an account that no longer exists', async () => {
      const gone = randomUUID();

      await expect(createNewEvents(db).create(gone, valid)).rejects.toThrow();

      expect(await eventsOf(gone)).toEqual([]);
    });
  });
});
